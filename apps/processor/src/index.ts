import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { eventBus } from '@tracer/infra';
import { LogEntry, BATCH_INSERT_SIZE, DEFAULT_METRIC_WINDOW_SECONDS, Alert, MetricType, AlertType, Severity } from '@tracer/core';
import { LogRepository, MetricRepository, AlertRepository, AlertChannelRepository, ApiKeyRepository, ProjectRepository, UserRepository, setupTimescaleDB, NotificationListener } from '@tracer/db';
import { MetricAggregator } from './aggregator';
import { AnomalyDetector } from './anomaly-detector';
import { AlertHandler } from './alert-handler';
import { logger } from './logger';

function findProjectRoot(startPath: string = process.cwd()): string {
  let current = resolve(startPath);
  while (current !== resolve(current, '..')) {
    if (existsSync(resolve(current, 'package.json')) && existsSync(resolve(current, 'turbo.json'))) {
      return current;
    }
    current = resolve(current, '..');
  }
  return process.cwd();
}

const rootDir = findProjectRoot();
const envPath = resolve(rootDir, '.env');

if (existsSync(envPath)) {
  const result = config({ path: envPath });
  if (result.error) {
    logger.warn({ error: result.error.message }, 'Failed to load .env file');
  } else {
    const loadedVars = Object.keys(result.parsed || {}).length;
    if (loadedVars > 0) {
      logger.info({ count: loadedVars }, 'Loaded environment variables from .env');
    } else {
      logger.warn('Env file found but no variables parsed. Check file format.');
    }
  }
} else {
  logger.warn({ path: envPath }, 'Env file not found. Make sure DATABASE_URL is set in your environment or create a .env file in the project root.');
}

// Initialize repositories - use process.nextTick to defer until after module loading
let logRepository: LogRepository;
let metricRepository: MetricRepository;
let alertRepository: AlertRepository;
let channelRepository: AlertChannelRepository;
let apiKeyRepository: ApiKeyRepository;
let projectRepository: ProjectRepository;
let userRepository: UserRepository;
let alertHandler: AlertHandler;
let notificationListener: NotificationListener;

// Defer repository instantiation to avoid module loading issues with tsx
process.nextTick(() => {
  try {
    logRepository = new LogRepository();
    metricRepository = new MetricRepository();
    alertRepository = new AlertRepository();
    channelRepository = new AlertChannelRepository();
    apiKeyRepository = new ApiKeyRepository();
    projectRepository = new ProjectRepository();
    userRepository = new UserRepository();

    alertHandler = new AlertHandler(
      alertRepository,
      channelRepository,
      apiKeyRepository,
      projectRepository,
      userRepository,
      apiKey,
      userId,
      toolkits
    );

    notificationListener = new NotificationListener(logRepository);
  } catch (error) {
    logger.error({ error }, 'Failed to initialize repositories');
    process.exit(1);
  }
});

const aggregator = new MetricAggregator(DEFAULT_METRIC_WINDOW_SECONDS);
const detector = new AnomalyDetector();

const apiKey = process.env.COMPOSIO_API_KEY || '';
const userId = process.env.COMPOSIO_USER_ID || 'tracer-system';
const toolkits = (process.env.COMPOSIO_TOOLKITS || 'slack').split(',');

// Metric aggregation interval (for finalizing completed windows)
const METRIC_AGGREGATION_INTERVAL = DEFAULT_METRIC_WINDOW_SECONDS * 1000;

// Service downtime check interval
const DOWNTIME_CHECK_INTERVAL = 60000; // Check every minute

// Track processed log IDs to avoid duplicates during startup catch-up
// Limit size to prevent memory leak (keep last 10k IDs)
const MAX_PROCESSED_LOG_IDS = 10000;
let processedLogIds = new Set<number>();

function addProcessedLogId(logId: number): void {
  processedLogIds.add(logId);
  // Prevent memory leak by removing oldest entries when limit reached
  if (processedLogIds.size > MAX_PROCESSED_LOG_IDS) {
    const firstId = processedLogIds.values().next().value;
    if (firstId !== undefined) {
      processedLogIds.delete(firstId);
    }
  }
}

/**
 * Process a single log entry in real-time
 * This is called immediately when a log is inserted (via NOTIFY)
 */
async function processLog(log: LogEntry, logId?: number): Promise<void> {
  try {
    // Skip if already processed (during catch-up)
    if (logId !== undefined && processedLogIds.has(logId)) {
      return;
    }
    if (logId !== undefined) {
      addProcessedLogId(logId);
    }

    // Update service activity tracking
    detector.updateServiceActivity(log.service, log.timestamp);

    // Process log and get real-time metrics
    const realTimeMetrics = aggregator.processLog(log);

    // Store real-time metrics immediately (incremental updates)
    if (realTimeMetrics.length > 0) {
      // Use upsert logic: update existing metrics or insert new ones
      // For simplicity, we'll insert all metrics (database can handle deduplication if needed)
      await Promise.all(
        realTimeMetrics.map((metric) => metricRepository.insert(metric))
      );
      
      // Emit metrics for real-time dashboard
      for (const metric of realTimeMetrics) {
        eventBus.emitMetricAggregated(metric);
      }
    }

    // Immediate anomaly detection on log arrival
    // This checks metrics and creates alerts based on thresholds
    const immediateAlerts = detector.detectAnomalies(realTimeMetrics);
    for (const alert of immediateAlerts) {
      await processAlert(alert); // Deduplication handled automatically
    }
  } catch (error) {
    logger.error({ error, service: log.service }, 'Error processing log');
  }
}

/**
 * Catch up on any logs that were inserted before the listener started
 * This ensures we don't miss logs during startup
 */
async function catchUpOnMissedLogs() {
  try {
    const recentLogs = await logRepository.getRecentLogs(undefined, 100);
    const logsArray = await recentLogs;
    
    if (logsArray.length > 0) {
      logger.info({ count: logsArray.length }, 'Catching up on recent logs');
    
      for (const log of logsArray) {
        const logEntry: LogEntry = {
          timestamp: log.timestamp,
          level: log.level as any,
          message: log.message,
          service: log.service,
          metadata: (log.metadata as any) || {},
        };
        
        await processLog(logEntry, log.id);
      }
      
      logger.info({ count: logsArray.length }, 'Caught up on logs');
    }
  } catch (error) {
    logger.error({ error }, 'Error catching up on missed logs');
  }
}

async function initialize() {
  logger.info('Initializing processor...');

  // Wait for repositories to be initialized
  while (!logRepository || !alertHandler || !notificationListener) {
    await new Promise(resolve => setImmediate(resolve));
  }

  await setupTimescaleDB();

  if (apiKey && toolkits.length > 0) {
    try {
      await alertHandler.initializeSession();
      logger.info('Tool Router session initialized for Slack OAuth');
    } catch (error) {
      logger.warn({ error }, 'Tool Router initialization failed. Slack OAuth will not work, but webhooks will still function');
    }
  } else {
    logger.info('COMPOSIO_API_KEY not set. Slack OAuth disabled. Using webhooks only.');
  }

  // Start real-time notification listener (replaces polling)
  await notificationListener.start();
  
  // Register handler for real-time log processing
  notificationListener.onLogInserted(async (log) => {
    await processLog(log);
  });

  // Catch up on any logs that were inserted before listener started
  await catchUpOnMissedLogs();

  // Start periodic tasks
  metricInterval = setInterval(processCompletedMetrics, METRIC_AGGREGATION_INTERVAL);
  downtimeInterval = setInterval(checkServiceDowntime, DOWNTIME_CHECK_INTERVAL);

  logger.info('Processor initialized with real-time processing');
}

// Batch buffering removed - logs are processed immediately via NOTIFY

/**
 * Process completed metric windows (finalize them)
 * Real-time metrics are already stored incrementally, this just finalizes completed windows
 */
async function processCompletedMetrics() {
  const completedMetrics = aggregator.getCompletedMetrics();

  if (completedMetrics.length === 0) return;

  try {
    await Promise.all(completedMetrics.map((metric) => metricRepository.insert(metric)));
    logger.info({ count: completedMetrics.length }, 'Finalized completed metric windows');
  } catch (error) {
    logger.error({ error }, 'Failed to store completed metrics');
  }

  for (const metric of completedMetrics) {
    eventBus.emitMetricAggregated(metric);
  }

  // Check for anomalies in completed windows (additional check)
  const alerts = detector.detectAnomalies(completedMetrics);

  for (const alert of alerts) {
    processAlert(alert); // Deduplication handled automatically
  }
}

async function processAlert(alert: Alert, checkDuplicates: boolean = false) {
  try {
    // Try to resolve projectId from service if not already set
    if (!alert.projectId) {
      try {
        const projectId = await apiKeyRepository.findProjectIdByService(alert.service);
        if (projectId) {
          alert.projectId = projectId;
        }
      } catch (error) {
        // Ignore errors when resolving projectId - alert will still be created
        logger.debug({ error, service: alert.service }, 'Failed to resolve projectId for alert');
      }
    }

    // Use atomic deduplication with upsert (ignore the checkDuplicates parameter)
    // The new method always performs deduplication
    const { id: alertId, isDuplicate } = await alertRepository.insertWithDeduplication(alert);
    
    if (isDuplicate) {
      logger.debug({ 
        service: alert.service, 
        alertType: alert.alertType,
        alertId 
      }, 'Duplicate alert detected and merged');
      
      // For duplicates, severity update is handled automatically in the upsert logic
      return;
    }

    // New alert created successfully
    const alertWithId = { ...alert, id: alertId };
    logger.info({ 
      alertId, 
      service: alert.service, 
      alertType: alert.alertType 
    }, 'New alert created');

    eventBus.emitAlertTriggered(alertWithId);

    // Try to send alert, but don't fail if sending fails
    // Alert is already stored in database
    await alertHandler.sendAlert(alert, alertId).catch((error) => {
      logger.warn({ error, alertId }, 'Failed to send alert to channels');
      // Alert is still stored, just not sent
    });
  } catch (error) {
    logger.error({ 
      error, 
      alertType: alert.alertType, 
      service: alert.service 
    }, 'Failed to process alert');
    
    // Don't throw to prevent crashing the processor
    // The alert might be processed by another processor or on retry
  }
}

// Helper to compare severity levels
function getSeverityLevel(severity: string): number {
  const levels: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  if (!severity || typeof severity !== 'string') {
    return 0;
  }
  return levels[severity.toLowerCase()] || 0;
}

function checkServiceDowntime() {
  const alerts = detector.checkServiceDowntime(new Date());

  for (const alert of alerts) {
    processAlert(alert, true); // Check for duplicates
  }
}

// EventBus handler for in-process events (if API and processor run in same process)
// Real-time processing is now handled via PostgreSQL NOTIFY
eventBus.onLogReceived(async (event) => {
  const log = event.log;
  await processLog(log);
});

// Process completed metric windows periodically (finalize them)
let metricInterval: NodeJS.Timeout | null = null;
let downtimeInterval: NodeJS.Timeout | null = null;

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received, shutting down gracefully...');
  
  // Clear intervals
  if (metricInterval) {
    clearInterval(metricInterval);
    metricInterval = null;
  }
  if (downtimeInterval) {
    clearInterval(downtimeInterval);
    downtimeInterval = null;
  }
  
  // Stop notification listener
  await notificationListener.stop();
  
  logger.info('Graceful shutdown complete');
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

initialize()
  .then(() => {
    logger.info('Processor started and listening for events');
  })
  .catch((error) => {
    logger.error({ error }, 'Failed to start processor');
    process.exit(1);
  });
