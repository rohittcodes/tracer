Statistical Anomaly Detection
=============================

## Context

The existing processor flagged anomalies with a single global threshold (`error_count > threshold`). That approach ignores service-specific behaviour, time-of-day patterns, and the rate at which errors ramp up. The new design introduces streaming statistics that learn per-service baselines and detect deviations in real time without sacrificing throughput (100k+ logs/minute) or latency (<10 ms per log).

## Streaming Data Flow

1. **Log ingestion** – each log is normalised into a `Metric` (error count, log count, latency, etc.) by `MetricAggregator`.
2. **Statistical engine** – metrics are routed to the `AnomalyDetector`, which maintains state per service.
3. **Baseline learning** – service state keeps a rolling 30-minute history of error rates, updated at most every 5 seconds to avoid redundant work while windows are still open.
4. **Detection** – current rates are scored against the learned baseline (z-score) and a dedicated rate-of-change monitor (5-minute sliding window).
5. **Alert synthesis** – when either detector fires, the alert is enriched with baseline statistics and routed to downstream channels via `AlertHandler`.

## Components

| Component | Responsibility |
|-----------|----------------|
| `MetricAggregator` (existing) | Produces per-service metrics on rolling windows. |
| **Baseline Store** | Maintains rolling statistics (`sum`, `sumSquares`, `count`) plus the original samples needed to age out values when the window expires. |
| **Z-score Detector** | Computes `(currentRate - mean) / stdDev` when at least `N` samples exist. Uses adaptive standard deviation to avoid division-by-zero and caps minimum variance. |
| **Rate-of-Change Monitor** | Tracks the oldest and newest rates inside a 5-minute buffer. When the relative change exceeds 50 % (configurable) and the window covers ≥2 minutes, it emits a spike alert. |
| **Severity Mapper** | Converts z-scores and rate deltas into `Severity` values: moderate (>=2σ), high (>=3σ or ≥75 % spike), critical (>=4σ or ≥100 % spike). |

## Algorithms

### Baseline learning

* Rolling window = 30 minutes (configurable) to capture diurnal changes without stale data.
* Samples are appended with timestamp + rate value, and removed once they fall out of the window.
* Statistics use an amortised-O(1) queue with head/tail pointers; each incoming metric updates the running sum and sum of squares, enabling instant mean/std-dev reads.
* To reduce redundant updates while a window is still collecting logs, samples are throttled to one insert every 5 seconds per service.

### Z-score anomaly detection

* Error rate = `errors / max(windowDurationSeconds, 1)`.
* Detector requires at least 6 samples before trusting the baseline.
* Uses `z = (rate - mean) / max(stdDev, ε)` with ε = 0.1 to avoid zero-variance explosions.
* Emits when `z >= 3`, and severity tiers increase at 3σ/4σ boundaries.

### Rate-of-change detector

* Independent sliding buffer over the most recent 5 minutes.
* Computes relative change between newest and oldest samples in the buffer.
* Alerts when rate increases by ≥50 % and at least 2 minutes separate the samples. Higher ratios map to higher severity.
* Provides resilience to steady-state variance by comparing against the latest empirical data rather than the long-term baseline.

## Performance Characteristics

* Data structures are purely in-memory maps keyed by service name. Each service holds:
  * ≤360 baseline samples (30 minutes ÷ 5 seconds) → lightweight (`O(samples)` memory).
  * ≤60 rate-of-change samples (5 minutes ÷ 5 seconds).
* Per metric ingestion work:
  * Map lookup + constant-number arithmetic operations + queue pruning (`while` loop removes only expired head elements).
  * No heap allocations besides occasional sample structs.
* Worst-case CPU budget:
  * 100k logs/min = 1,667 logs/s ≈ 0.6 ms per log at 100 % CPU occupancy.
  * Detector performs <200 simple operations per metric, well within 10 ms even on modest hardware.

## Deployment Considerations

* State lives inside the processor instance; if the service restarts, the baseline warm-up period (≈30 minutes) is required.
* All thresholds (window sizes, z-score, spike percentage) live next to the detector implementation to keep configuration explicit but can be promoted to environment variables later.
* Alerts include the current rate, baseline mean/stddev, and rate-change ratio, enabling responders to understand why an alert fired without pulling additional dashboards.

