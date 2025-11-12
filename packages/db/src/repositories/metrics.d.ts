import { Metric } from '@tracer/core';
export declare class MetricRepository {
    /**
     * Insert a new metric
     */
    insert(metric: Metric): Promise<void>;
    /**
     * Query metrics by service and metric type within a time window
     */
    queryByService(service: string, metricType: string, windowStart: Date, windowEnd: Date): Promise<{
        id: number;
        service: string;
        metricType: "error_count" | "log_count" | "latency_p95" | "throughput" | "request_count";
        value: number;
        windowStart: Date;
        windowEnd: Date;
        createdAt: Date;
    }[]>;
    /**
     * Get latest metrics, optionally filtered by service
     */
    getLatestMetrics(service?: string, limit?: number): Promise<{
        id: number;
        service: string;
        metricType: "error_count" | "log_count" | "latency_p95" | "throughput" | "request_count";
        value: number;
        windowStart: Date;
        windowEnd: Date;
        createdAt: Date;
    }[]>;
}
//# sourceMappingURL=metrics.d.ts.map