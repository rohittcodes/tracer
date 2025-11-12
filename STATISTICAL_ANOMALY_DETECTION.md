# Statistical Anomaly Detection System

## Architecture Design

### Overview

The Statistical Anomaly Detection System replaces simple threshold-based detection with adaptive, statistically-driven anomaly detection that learns normal patterns per service and detects deviations using z-score analysis and rate-of-change monitoring.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Log Ingestion Layer                       │
│  (API → Event Bus → Processor)                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            Statistical Anomaly Detection Engine              │
│                                                               │
│  ┌──────────────────┐      ┌──────────────────┐             │
│  │  Baseline Manager│      │  Z-Score         │             │
│  │  (Per Service)   │◄────►│  Calculator      │             │
│  └────────┬─────────┘      └────────┬─────────┘             │
│           │                        │                          │
│           ▼                        ▼                          │
│  ┌──────────────────┐      ┌──────────────────┐             │
│  │  Rate-of-Change  │      │  Alert Generator │             │
│  │  Detector        │─────►│  & Severity      │             │
│  └──────────────────┘      └────────┬─────────┘             │
│                                      │                          │
└──────────────────────┬───────────────┴────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Alert Management                          │
│  (Alert Handler → Database → Notification System)          │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. Baseline Manager
- **Purpose**: Maintains rolling statistical baselines per service and metric type
- **Data Structure**: Circular buffers for O(1) operations
- **Statistics**: Incremental mean, variance, EMA, median, MAD
- **Storage**: In-memory with LRU eviction for scalability

#### 2. Z-Score Calculator
- **Purpose**: Detects statistical deviations from baseline
- **Methods**: Standard z-score and Median Absolute Deviation (MAD)
- **Adaptive Thresholds**: Sensitivity-based threshold adjustment
- **Performance**: O(1) per calculation using pre-computed statistics

#### 3. Rate-of-Change Detector
- **Purpose**: Monitors velocity of metric changes
- **Detection**: Percentage change over configurable time windows
- **Use Case**: 50% error rate increase in 5 minutes
- **Implementation**: Sliding window with max rate tracking

#### 4. Alert Generator
- **Purpose**: Creates contextual alerts with severity levels
- **Severity Logic**: Based on z-score magnitude and rate-of-change
- **Metadata**: Includes statistical context for investigation
- **Types**: ERROR_SPIKE, HIGH_LATENCY, RATE_OF_CHANGE, THRESHOLD_EXCEEDED

### Data Flow

```
1. Log Ingestion
   ├── Extract service, metric type, value
   ├── Route to appropriate baseline manager
   └── Update incremental statistics

2. Statistical Analysis
   ├── Calculate z-score vs. baseline
   ├── Compute rate-of-change
   ├── Apply adaptive thresholds
   └── Determine anomaly status

3. Alert Generation
   ├── Create contextual alert message
   ├── Assign severity level
   ├── Add statistical metadata
   └── Emit to alert system

4. Baseline Maintenance
   ├── Update circular buffers
   ├── Recompute statistics incrementally
   ├── Manage memory with LRU
   └── Persist periodic snapshots
```

### Performance Architecture

#### Memory Management
- **Circular Buffers**: Pre-allocated arrays for O(1) operations
- **Typed Arrays**: Float64Array for numerical data when possible
- **Object Pooling**: Reuse alert objects to reduce GC pressure
- **LRU Eviction**: Automatic cleanup of inactive service baselines

#### Processing Pipeline
- **Batch Processing**: Process logs in batches of 100-1000
- **Parallel Processing**: Web Worker threads for CPU-intensive stats
- **Async I/O**: Non-blocking database writes for baselines
- **Sampling**: Adaptive sampling for extreme throughput (>500k logs/min)

#### Latency Optimization
- **In-Memory Processing**: < 1ms for statistical calculations
- **Lock-Free Structures**: ConcurrentMap for thread safety
- **Pre-Computation**: Incremental statistics avoid full recalculation
- **Early Termination**: Skip unnecessary calculations for normal values

### Configuration

```typescript
interface StatisticalConfig {
  zScoreThreshold: number;              // 3.0 (99.7% confidence)
  minDataPoints: number;                // 30 (statistical significance)
  baselineWindowMinutes: number;        // 60 (1 hour rolling window)
  rateOfChangeThreshold: number;        // 0.5 (50% change)
  rateOfChangeWindowMinutes: number;    // 5 (5 minute window)
  emaSmoothingFactor: number;           // 0.3 (exponential smoothing)
  useMAD: boolean;                      // false (use MAD instead of std dev)
  sensitivity: number;                  // 0.7 (0.1-1.0, higher = more sensitive)
}
```

### Scaling Strategy

#### Horizontal Scaling
- **Service Sharding**: Distribute services across detector instances
- **Consistent Hashing**: Route services to specific instances
- **Shared State**: Redis for cross-instance baseline synchronization
- **Load Balancing**: Round-robin for log distribution

#### Vertical Scaling
- **Multi-threading**: Worker threads for statistical calculations
- **Batch Sizes**: Tune based on available memory and CPU
- **Sampling Rates**: Adaptive based on throughput and resource usage
- **Memory Limits**: Configurable per-instance memory caps

### Fault Tolerance

#### Data Durability
- **Periodic Snapshots**: Save baselines to database every 5 minutes
- **Recovery**: Reload baselines from snapshots on restart
- **Backup**: Maintain last 24 hours of baseline snapshots
- **Graceful Degradation**: Continue with partial baselines if needed

#### Error Handling
- **Baseline Corruption**: Automatic reset on statistical inconsistency
- **Memory Pressure**: LRU eviction with graceful degradation
- **Processing Failures**: Dead letter queue for failed detections
- **Monitoring**: Health checks and metrics for detector status

### Integration Points

#### With Existing System
```
┌─────────────────┐
│   API Server    │
└────────┬────────┘
         │ HTTP API
         ▼
┌─────────────────┐
│  Event Bus      │
└────────┬────────┘
         │ Events
         ▼
┌─────────────────────────┐
│ Statistical Anomaly     │
│ Detector (New)          │
└────────┬────────────────┘
         │ Alerts
         ▼
┌─────────────────┐
│  Alert Handler  │
└────────┬────────┘
         │ Notifications
         ▼
┌─────────────────┐
│  Alert Channels │
└─────────────────┘
```

#### Database Schema
```sql
-- Baseline snapshots for persistence
CREATE TABLE baseline_snapshots (
    id SERIAL PRIMARY KEY,
    service VARCHAR(255) NOT NULL,
    metric_type VARCHAR(50) NOT NULL,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(service, metric_type, created_at)
);

-- Anomaly detection metrics for monitoring
CREATE TABLE detection_metrics (
    id SERIAL PRIMARY KEY,
    service VARCHAR(255) NOT NULL,
    metric_type VARCHAR(50) NOT NULL,
    z_score DOUBLE PRECISION,
    rate_of_change DOUBLE PRECISION,
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Monitoring & Observability

#### Key Metrics
- **Detection Latency**: p50, p95, p99 processing times
- **Baseline Accuracy**: Mean absolute error vs. actual values
- **Alert Precision**: True positive rate, false positive rate
- **Throughput**: Logs processed per second
- **Memory Usage**: Baseline memory consumption per service

#### Health Checks
- **Baseline Health**: Percentage of healthy baselines
- **Processing Health**: Error rate in anomaly detection
- **Memory Health**: Memory usage vs. limits
- **Latency Health**: Processing time SLO compliance

### Security Considerations

- **Data Privacy**: Baselines contain aggregated data only
- **Access Control**: Restrict configuration changes to authorized users
- **Audit Logging**: Log all configuration changes and baseline resets
- **Resource Limits**: Prevent memory exhaustion from malicious inputs

### Deployment Strategy

#### Phased Rollout
1. **Shadow Mode**: Run parallel with existing detector, compare results
2. **Canary**: Deploy to 5% of services, monitor metrics
3. **Gradual Rollout**: Increase to 25%, 50%, 100% of services
4. **Monitoring**: Track false positive rate and detection latency

#### Rollback Plan
- **Feature Flag**: Enable/disable statistical detection via configuration
- **Gradual Rollback**: Reduce percentage of services using new detector
- **Emergency Stop**: Immediate fallback to threshold-based detection
- **Data Preservation**: Keep baselines for quick re-enablement

### Future Enhancements

- **Machine Learning**: Prophet or LSTM for seasonal pattern detection
- **Correlation Analysis**: Cross-service anomaly correlation
- **Root Cause Analysis**: Automated anomaly attribution
- **Adaptive Learning**: Self-tuning sensitivity based on feedback
- **Forecasting**: Predictive anomaly detection

## Implementation Notes

### Performance Characteristics
- **Memory**: ~1KB per service-metric baseline
- **CPU**: < 1ms per log for statistical calculations
- **Throughput**: 100k+ logs/minute per instance
- **Latency**: p99 < 10ms processing time

### Testing Strategy
- **Unit Tests**: Statistical functions and baseline management
- **Integration Tests**: End-to-end anomaly detection flow
- **Performance Tests**: Load testing at 100k+ logs/minute
- **Chaos Tests**: Baseline recovery and fault tolerance
- **A/B Tests**: Compare with threshold-based detection

### Maintenance
- **Baseline Review**: Weekly review of baseline health
- **Threshold Tuning**: Monthly sensitivity adjustment
- **Performance Optimization**: Quarterly performance audit
- **Model Updates**: As needed for new anomaly patterns