# Statistical Anomaly Detection - Implementation Guide

## Quick Start

### 1. Install Dependencies

The statistical anomaly detector uses existing dependencies. No additional packages required.

### 2. Update Processor Configuration

Edit `apps/processor/src/index.ts` to integrate the statistical detector:

```typescript
import { StatisticalAnomalyDetector } from './statistical-anomaly-detector';

// Initialize statistical detector
const statisticalDetector = new StatisticalAnomalyDetector({
  zScoreThreshold: 3.0,
  minDataPoints: 30,
  baselineWindowMinutes: 60,
  rateOfChangeThreshold: 0.5,
  rateOfChangeWindowMinutes: 5,
  emaSmoothingFactor: 0.3,
  useMAD: false,
  sensitivity: 0.7,
});
```

### 3. Integration Points

#### Log Processing Integration

Update your log processing pipeline:

```typescript
// In your log processor
async function processLog(log: LogEntry): Promise<void> {
  // Existing processing
  await saveLogToDatabase(log);
  
  // Statistical anomaly detection
  const alerts = statisticalDetector.processLog(log);
  
  // Handle alerts
  for (const alert of alerts) {
    await saveAlertToDatabase(alert);
    await sendNotification(alert);
  }
}
```

#### Metrics Processing Integration

```typescript
// Process batch metrics
async function processMetrics(metrics: Metric[]): Promise<void> {
  // Existing metrics processing
  await saveMetricsToDatabase(metrics);
  
  // Statistical anomaly detection
  const alerts = statisticalDetector.processMetrics(metrics);
  
  // Handle alerts
  for (const alert of alerts) {
    await saveAlertToDatabase(alert);
    await sendNotification(alert);
  }
}
```

## Configuration Options

### Basic Configuration

```typescript
const config = {
  // Statistical threshold (default: 3.0)
  // Higher values = fewer alerts, more precision
  // Lower values = more alerts, more recall
  zScoreThreshold: 3.0,
  
  // Minimum data points before detection (default: 30)
  // Higher values = more accurate baselines
  // Lower values = faster startup
  minDataPoints: 30,
  
  // Rolling window size in minutes (default: 60)
  // Larger windows = better for seasonal patterns
  // Smaller windows = more responsive to changes
  baselineWindowMinutes: 60,
  
  // Rate of change threshold (default: 0.5 = 50%)
  // Percentage change that triggers alert
  rateOfChangeThreshold: 0.5,
  
  // Time window for rate-of-change in minutes (default: 5)
  rateOfChangeWindowMinutes: 5,
  
  // EMA smoothing factor (default: 0.3)
  // Higher values = more weight to recent data
  emaSmoothingFactor: 0.3,
  
  // Use Median Absolute Deviation (default: false)
  // true = more robust to outliers, slightly slower
  // false = use standard deviation, faster
  useMAD: false,
  
  // Detection sensitivity (default: 0.7)
  // Range: 0.1 (low sensitivity) to 1.0 (high sensitivity)
  sensitivity: 0.7,
};
```

### Environment-Specific Configurations

#### Development Environment
```typescript
const devConfig = {
  minDataPoints: 10,        // Faster feedback
  baselineWindowMinutes: 15, // Shorter windows
  zScoreThreshold: 2.0,     // More sensitive
  sensitivity: 0.9,         // High sensitivity
};
```

#### Production Environment
```typescript
const prodConfig = {
  minDataPoints: 30,        // Statistical significance
  baselineWindowMinutes: 60, // Hourly patterns
  zScoreThreshold: 3.0,     // Conservative threshold
  sensitivity: 0.7,         // Balanced sensitivity
};
```

#### High-Volume Environment
```typescript
const highVolumeConfig = {
  minDataPoints: 20,        // Faster baseline establishment
  baselineWindowMinutes: 30, // Lower memory usage
  zScoreThreshold: 3.5,     // Higher threshold for stability
  rateOfChangeThreshold: 0.7, // Less sensitive to noise
  useMAD: false,            // Faster processing
  sensitivity: 0.6,         // Lower sensitivity
};
```

## Usage Examples

### Example 1: Basic Log Processing

```typescript
import { StatisticalAnomalyDetector } from './statistical-anomaly-detector';
import { LogEntry } from '@tracer/core';

const detector = new StatisticalAnomalyDetector();

// Process a log entry
const log: LogEntry = {
  timestamp: new Date(),
  level: 'error',
  message: 'Database connection failed',
  service: 'user-service',
  metadata: {
    error: 'ConnectionTimeout',
    latency: 5000,
  },
};

const alerts = detector.processLog(log);

if (alerts.length > 0) {
  console.log(`Detected ${alerts.length} anomalies:`);
  for (const alert of alerts) {
    console.log(`- ${alert.message} (Severity: ${alert.severity})`);
    console.log(`  Z-Score: ${alert.metadata?.zScore}`);
    console.log(`  Rate of Change: ${alert.metadata?.rateOfChange}`);
  }
}
```

### Example 2: Batch Metrics Processing

```typescript
import { Metric, MetricType } from '@tracer/core';

const metrics: Metric[] = [
  {
    service: 'payment-service',
    metricType: MetricType.ERROR_COUNT,
    value: 45,
    windowStart: new Date(Date.now() - 60000),
    windowEnd: new Date(),
  },
  {
    service: 'payment-service',
    metricType: MetricType.LATENCY_P95,
    value: 850,
    windowStart: new Date(Date.now() - 60000),
    windowEnd: new Date(),
  },
];

const alerts = detector.processMetrics(metrics);

// Handle alerts
for (const alert of alerts) {
  await sendToAlertingSystem(alert);
}
```

### Example 3: Monitoring Baseline Health

```typescript
// Get baseline statistics for monitoring
const stats = detector.getBaselineStats('user-service', MetricType.ERROR_COUNT);

if (stats) {
  console.log('Baseline Statistics:');
  console.log(`- Mean: ${stats.mean.toFixed(2)}`);
  console.log(`- Std Dev: ${stats.stdDev.toFixed(2)}`);
  console.log(`- EMA: ${stats.ema.toFixed(2)}`);
  console.log(`- Data Points: ${stats.count}`);
  
  // Monitor baseline health
  if (stats.count < 30) {
    console.warn('Insufficient data points for reliable detection');
  }
}
```

### Example 4: Dynamic Configuration

```typescript
// Adjust sensitivity based on time of day
const hour = new Date().getHours();

if (hour >= 9 && hour <= 17) {
  // Business hours - higher sensitivity
  detector.updateConfig({
    sensitivity: 0.8,
    zScoreThreshold: 2.5,
  });
} else {
  // Off-hours - lower sensitivity
  detector.updateConfig({
    sensitivity: 0.6,
    zScoreThreshold: 3.5,
  });
}
```

### Example 5: Custom Alert Handling

```typescript
const alerts = detector.processLog(log);

for (const alert of alerts) {
  // Custom severity-based handling
  switch (alert.severity) {
    case 'critical':
      await sendPagerDutyAlert(alert);
      await sendSlackNotification(alert, '#alerts-critical');
      break;
      
    case 'high':
      await sendSlackNotification(alert, '#alerts-high');
      break;
      
    case 'medium':
      await sendEmailNotification(alert);
      break;
      
    case 'low':
      // Log only, don't notify
      console.log(`Low severity alert: ${alert.message}`);
      break;
  }
  
  // Save to database
  await saveAlert(alert);
}
```

## Integration with Existing System

### Current Architecture

```
API Server → Event Bus → Processor → AnomalyDetector → AlertHandler
```

### Updated Architecture

```
API Server → Event Bus → Processor → StatisticalAnomalyDetector → AlertHandler
                                      ↓
                              MetricAggregator (existing)
```

### Migration Steps

#### Step 1: Deploy in Shadow Mode

```typescript
// Run both detectors in parallel
const thresholdDetector = new AnomalyDetector(); // Existing
const statisticalDetector = new StatisticalAnomalyDetector(); // New

async function processLog(log: LogEntry) {
  // Existing detection
  const thresholdAlerts = thresholdDetector.detectAnomalies([metric]);
  
  // New statistical detection
  const statisticalAlerts = statisticalDetector.processLog(log);
  
  // Compare results for monitoring
  logComparison(thresholdAlerts, statisticalAlerts);
  
  // Use threshold detector for production alerts
  return thresholdAlerts;
}
```

#### Step 2: Gradual Rollout

```typescript
// Feature flag for gradual rollout
const STATISTICAL_DETECTION_ENABLED = 0.1; // 10% of services

async function processLog(log: LogEntry) {
  const useStatistical = Math.random() < STATISTICAL_DETECTION_ENABLED;
  
  if (useStatistical) {
    return statisticalDetector.processLog(log);
  } else {
    const metrics = aggregator.processLog(log);
    return thresholdDetector.detectAnomalies(metrics);
  }
}
```

#### Step 3: Full Migration

```typescript
// Complete migration to statistical detection
async function processLog(log: LogEntry) {
  return statisticalDetector.processLog(log);
}
```

## Monitoring and Observability

### Key Metrics to Monitor

```typescript
// Performance metrics
const metrics = {
  // Detection latency
  detectionLatency: histogram(),
  
  // Baseline statistics
  baselineSize: gauge(),
  baselineAge: gauge(),
  
  // Detection accuracy
  alertsTriggered: counter(),
  anomaliesDetected: counter(),
  
  // System health
  memoryUsage: gauge(),
  processingErrors: counter(),
};

// Monitor baseline health
setInterval(() => {
  const services = ['user-service', 'payment-service', 'api-service'];
  
  for (const service of services) {
    const stats = detector.getBaselineStats(service, MetricType.ERROR_COUNT);
    
    if (stats) {
      metrics.baselineSize.set({ service }, stats.count);
      metrics.baselineAge.set({ service }, Date.now() - stats.recentValues[0]);
    }
  }
}, 60000);
```

### Health Checks

```typescript
// Health check endpoint
app.get('/health/anomaly-detector', (req, res) => {
  const health = {
    status: 'healthy',
    config: detector.getConfig(),
    baselineCount: detector.getBaselineCount(),
    lastProcessingTime: detector.getLastProcessingTime(),
    memoryUsage: process.memoryUsage(),
  };
  
  // Check if baselines are healthy
  if (health.baselineCount < 10) {
    health.status = 'warning';
    health.message = 'Low baseline count';
  }
  
  res.json(health);
});
```

## Troubleshooting

### Common Issues

#### Issue 1: Too Many False Positives

**Symptoms**: High alert volume, low precision

**Solutions**:
```typescript
// Increase threshold
 detector.updateConfig({
   zScoreThreshold: 3.5,
   sensitivity: 0.6,
 });
 
 // Or use MAD for outlier resistance
 detector.updateConfig({
   useMAD: true,
   zScoreThreshold: 3.0,
 });
```

#### Issue 2: Missing Real Anomalies

**Symptoms**: Low recall, missing important issues

**Solutions**:
```typescript
// Decrease threshold
 detector.updateConfig({
   zScoreThreshold: 2.5,
   sensitivity: 0.8,
 });
 
 // Or reduce minimum data points
 detector.updateConfig({
   minDataPoints: 20,
 });
```

#### Issue 3: High Memory Usage

**Symptoms**: Memory usage growing continuously

**Solutions**:
```typescript
// Reduce window size
 detector.updateConfig({
   baselineWindowMinutes: 30,
 });
 
 // Clear old baselines periodically
 setInterval(() => {
   detector.clearInactiveBaselines(24 * 60 * 60 * 1000); // 24 hours
 }, 60 * 60 * 1000); // Every hour
```

#### Issue 4: Slow Processing

**Symptoms**: High latency, CPU usage

**Solutions**:
```typescript
// Optimize for throughput
 detector.updateConfig({
   useMAD: false,           // Faster calculations
   minDataPoints: 20,       // Faster baseline establishment
   sensitivity: 0.6,        // Less processing
 });
 
 // Implement batching
 const batchProcessor = new BatchProcessor({
   batchSize: 1000,
   flushInterval: 1000,
 });
```

### Debug Mode

```typescript
// Enable debug logging
const detector = new StatisticalAnomalyDetector({
  // ... config
});

// Debug specific service
const debugService = 'problematic-service';
const stats = detector.getBaselineStats(debugService, MetricType.ERROR_COUNT);

console.log('Baseline Debug Info:', {
  service: debugService,
  stats,
  config: detector.getConfig(),
  recentValues: stats?.recentValues,
});
```

## Testing

### Unit Tests

```bash
# Run tests
pnpm test statistical-anomaly-detector

# Run with coverage
pnpm test:coverage statistical-anomaly-detector
```

### Performance Tests

```bash
# Run performance benchmarks
pnpm test:perf statistical-anomaly-detector

# Load test
pnpm test:load --logs-per-minute 250000
```

### Integration Tests

```typescript
// Test with realistic data
const testLogs = generateRealisticLogs({
  services: ['user-service', 'payment-service'],
  duration: '1 hour',
  anomalyRate: 0.01, // 1% anomalies
});

const detector = new StatisticalAnomalyDetector();
const results = await runDetectionTest(detector, testLogs);

console.log('Test Results:', {
  precision: results.truePositives / (results.truePositives + results.falsePositives),
  recall: results.truePositives / (results.truePositives + results.falseNegatives),
  processingTime: results.processingTime,
});
```

## Best Practices

### 1. Start Conservative
```typescript
// Begin with high thresholds
const initialConfig = {
  zScoreThreshold: 3.5,
  sensitivity: 0.6,
  minDataPoints: 40,
};

// Gradually adjust based on feedback
```

### 2. Monitor Baseline Health
```typescript
// Regular baseline health checks
setInterval(() => {
  const unhealthyBaselines = detector.getUnhealthyBaselines();
  if (unhealthyBaselines.length > 0) {
    console.warn('Unhealthy baselines detected:', unhealthyBaselines);
  }
}, 5 * 60 * 1000);
```

### 3. Use Service-Specific Configurations
```typescript
// Different configs for different services
const serviceConfigs = {
  'critical-service': { sensitivity: 0.9, zScoreThreshold: 2.5 },
  'batch-service': { sensitivity: 0.5, zScoreThreshold: 4.0 },
  'web-service': { sensitivity: 0.7, zScoreThreshold: 3.0 },
};
```

### 4. Implement Alert Fatigue Prevention
```typescript
// Rate limiting for alerts
const alertRateLimiter = new RateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxAlerts: 10,           // Max 10 alerts per window
});

// Deduplicate similar alerts
const alertDeduper = new Deduper({
  windowMs: 15 * 60 * 1000, // 15 minutes
});
```

### 5. Regular Configuration Review
```typescript
// Monthly configuration review
const reviewMetrics = {
  falsePositiveRate: calculateFPR(),
  falseNegativeRate: calculateFNR(),
  alertVolume: getAlertVolume(),
  
  // Adjust if needed
  ...(shouldAdjustConfig() && getConfigAdjustments()),
};
```

## API Reference

### StatisticalAnomalyDetector

#### Constructor
```typescript
new StatisticalAnomalyDetector(config?: Partial<StatisticalConfig>)
```

#### Methods

##### processLog(log: LogEntry): Alert[]
Process a single log entry and return any detected anomalies.

##### processMetrics(metrics: Metric[]): Alert[]
Process batch metrics and return detected anomalies.

##### getBaselineStats(service: string, metricType: MetricType): BaselineStats | null
Get statistical baseline information for monitoring.

##### clearBaseline(service: string, metricType?: MetricType): void
Clear baseline data for a service or metric type.

##### getConfig(): StatisticalConfig
Get current detector configuration.

##### updateConfig(updates: Partial<StatisticalConfig>): void
Update detector configuration at runtime.

## Support

For issues and questions:
1. Check troubleshooting section above
2. Review test cases for examples
3. Check baseline health and statistics
4. Enable debug logging
5. Contact the development team with metrics and logs