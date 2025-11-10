"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../schema");
class MetricRepository {
    /**
     * Insert a new metric
     */
    async insert(metric) {
        const db = (0, db_1.getDb)();
        const newMetric = {
            service: metric.service,
            metricType: metric.metricType,
            value: metric.value,
            windowStart: metric.windowStart,
            windowEnd: metric.windowEnd,
        };
        await db.insert(schema_1.metrics).values(newMetric);
    }
    /**
     * Query metrics by service and metric type within a time window
     */
    async queryByService(service, metricType, windowStart, windowEnd) {
        const db = (0, db_1.getDb)();
        return db
            .select()
            .from(schema_1.metrics)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.metrics.service, service), (0, drizzle_orm_1.eq)(schema_1.metrics.metricType, metricType), // Cast to enum type
        (0, drizzle_orm_1.gte)(schema_1.metrics.windowStart, windowStart), (0, drizzle_orm_1.lte)(schema_1.metrics.windowEnd, windowEnd)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.metrics.windowStart));
    }
    /**
     * Get latest metrics, optionally filtered by service
     */
    async getLatestMetrics(service, limit = 100) {
        const db = (0, db_1.getDb)();
        if (service) {
            return db
                .select()
                .from(schema_1.metrics)
                .where((0, drizzle_orm_1.eq)(schema_1.metrics.service, service))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.metrics.windowStart))
                .limit(limit);
        }
        return db
            .select()
            .from(schema_1.metrics)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.metrics.windowStart))
            .limit(limit);
    }
}
exports.MetricRepository = MetricRepository;
//# sourceMappingURL=metrics.js.map