import { Hono } from 'hono';
import { LogRepository, MetricRepository, AlertRepository, getPool } from '@tracer/db';
import { ApiKey } from '@tracer/db';
import { logger } from '../logger';

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

const services = new Hono<{ Variables: Variables }>();

// Get list of all services
services.get('/', async (c) => {
  try {
    const apiKey = c.get('apiKey');
    const logRepo = new LogRepository();
    const metricRepo = new MetricRepository();
    
    // Get unique services from logs and metrics using raw SQL
    const pool = getPool();
    const logServicesResult = await pool.query(`
      SELECT DISTINCT service 
      FROM logs 
      ORDER BY service
    `);
    
    const metricServicesResult = await pool.query(`
      SELECT DISTINCT service 
      FROM metrics 
      ORDER BY service
    `);
    
    const allServices = new Set<string>();
    logServicesResult.rows.forEach((row: any) => allServices.add(row.service));
    metricServicesResult.rows.forEach((row: any) => allServices.add(row.service));
    
    const servicesList = Array.from(allServices).map(service => ({
      name: service,
      // Filter by API key service if present
      visible: !apiKey?.service || apiKey.service === service,
    })).filter(s => s.visible);
    
    return c.json({ services: servicesList.map(s => s.name) });
  } catch (error) {
    logger.error({ error }, 'Error fetching services');
    return c.json(
      { error: 'Failed to fetch services', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// Get service health and summary
services.get('/:service', async (c) => {
  const apiKey = c.get('apiKey');
  const serviceName = c.req.param('service');
  try {
    // Check if user has access to this service
    if (apiKey?.service && apiKey.service !== serviceName) {
      return c.json({ error: 'Access denied' }, 403);
    }
    
    const logRepo = new LogRepository();
    const metricRepo = new MetricRepository();
    const alertRepo = new AlertRepository();
    
    // Get recent logs count
    const recentLogs = await logRepo.getRecentLogs(serviceName, 100);
    const logsArray = await recentLogs;
    
    // Get recent metrics
    const recentMetrics = await metricRepo.getLatestMetrics(serviceName, 50);
    const metricsArray = await recentMetrics;
    
    // Get active alerts
    const activeAlerts = await alertRepo.getActiveAlerts(serviceName);
    const alertsArray = await activeAlerts;
    
    // Calculate health status
    const now = new Date();
    const lastLog = logsArray.length > 0 ? new Date(logsArray[0].timestamp) : null;
    const minutesSinceLastLog = lastLog ? (now.getTime() - lastLog.getTime()) / (1000 * 60) : Infinity;
    
    const errorCount = metricsArray.find(m => m.metricType === 'error_count')?.value || 0;
    const logCount = metricsArray.find(m => m.metricType === 'log_count')?.value || 0;
    const errorRate = logCount > 0 ? (errorCount / logCount) * 100 : 0;
    
    let status: 'healthy' | 'degraded' | 'down' = 'healthy';
    if (minutesSinceLastLog > 5) {
      status = 'down';
    } else if (errorRate > 10 || alertsArray.length > 0) {
      status = 'degraded';
    }
    
    return c.json({
      service: serviceName,
      status,
      errorRate: errorRate.toFixed(2),
      totalLogs: logsArray.length,
      activeAlerts: alertsArray.length,
      lastLogTime: lastLog?.toISOString() || null,
      metrics: {
        errorCount,
        logCount,
        latencyP95: metricsArray.find(m => m.metricType === 'latency_p95')?.value || 0,
      },
    });
  } catch (error) {
    logger.error({ error, service: serviceName }, 'Error fetching service details');
    return c.json(
      { error: 'Failed to fetch service details', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// Get metrics for a specific service
services.get('/:service/metrics', async (c) => {
  const apiKey = c.get('apiKey');
  const serviceName = c.req.param('service');
  const limitParam = c.req.query('limit') || '100';
  const limit = parseInt(limitParam, 10);
  if (isNaN(limit) || limit < 1 || limit > 1000) {
    return c.json({ error: 'Invalid limit parameter. Must be a number between 1 and 1000' }, 400);
  }
  try {
    
    if (apiKey?.service && apiKey.service !== serviceName) {
      return c.json({ error: 'Access denied' }, 403);
    }
    
    const metricRepo = new MetricRepository();
    const metrics = await metricRepo.getLatestMetrics(serviceName, limit);
    const metricsArray = await metrics;
    
    return c.json({ metrics: metricsArray });
  } catch (error) {
    logger.error({ error, service: serviceName }, 'Error fetching service metrics');
    return c.json(
      { error: 'Failed to fetch service metrics', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// Get logs for a specific service
services.get('/:service/logs', async (c) => {
  const apiKey = c.get('apiKey');
  const serviceName = c.req.param('service');
  const limitParam = c.req.query('limit') || '100';
  const limit = parseInt(limitParam, 10);
  if (isNaN(limit) || limit < 1 || limit > 1000) {
    return c.json({ error: 'Invalid limit parameter. Must be a number between 1 and 1000' }, 400);
  }
  try {
    const start = c.req.query('start');
    const end = c.req.query('end');
    
    if (apiKey?.service && apiKey.service !== serviceName) {
      return c.json({ error: 'Access denied' }, 403);
    }
    
    const logRepo = new LogRepository();
    
    let logs;
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return c.json({ error: 'Invalid date format for start or end parameter' }, 400);
      }
      logs = await logRepo.queryByTimeRange(
        startDate,
        endDate,
        serviceName,
        limit
      );
    } else {
      logs = await logRepo.getRecentLogs(serviceName, limit);
    }
    
    const logsArray = await logs;
    return c.json({ logs: logsArray });
  } catch (error) {
    logger.error({ error, service: serviceName }, 'Error fetching service logs');
    return c.json(
      { error: 'Failed to fetch service logs', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default services;

