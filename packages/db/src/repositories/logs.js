"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../schema");
class LogRepository {
    /**
     * Insert a batch of logs efficiently
     */
    async insertBatch(logEntries) {
        const db = (0, db_1.getDb)();
        const newLogs = logEntries.map((entry) => ({
            timestamp: entry.timestamp,
            level: entry.level,
            message: entry.message,
            service: entry.service,
            metadata: entry.metadata || null,
            traceId: entry.traceId || null,
            spanId: entry.spanId || null,
        }));
        await db.insert(schema_1.logs).values(newLogs);
    }
    /**
     * Query logs by time range, optionally filtered by service
     */
    async queryByTimeRange(start, end, service, limit) {
        const db = (0, db_1.getDb)();
        const conditions = [(0, drizzle_orm_1.gte)(schema_1.logs.timestamp, start), (0, drizzle_orm_1.lte)(schema_1.logs.timestamp, end)];
        if (service) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.logs.service, service));
        }
        let query = db
            .select()
            .from(schema_1.logs)
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.logs.timestamp));
        if (limit) {
            query = query.limit(limit);
        }
        return query;
    }
    /**
     * Query logs by service
     */
    async queryByService(service, limit) {
        const db = (0, db_1.getDb)();
        let query = db
            .select()
            .from(schema_1.logs)
            .where((0, drizzle_orm_1.eq)(schema_1.logs.service, service))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.logs.timestamp));
        if (limit) {
            query = query.limit(limit);
        }
        return query;
    }
    /**
     * Get recent logs, optionally filtered by service
     */
    async getRecentLogs(service, limit = 100) {
        const db = (0, db_1.getDb)();
        if (service) {
            return db
                .select()
                .from(schema_1.logs)
                .where((0, drizzle_orm_1.eq)(schema_1.logs.service, service))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.logs.timestamp))
                .limit(limit);
        }
        return db
            .select()
            .from(schema_1.logs)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.logs.timestamp))
            .limit(limit);
    }
    /**
     * Get a log by ID (for real-time processing via NOTIFY)
     */
    async getById(id) {
        const db = (0, db_1.getDb)();
        const result = await db
            .select()
            .from(schema_1.logs)
            .where((0, drizzle_orm_1.eq)(schema_1.logs.id, id))
            .limit(1);
        if (result.length === 0) {
            return null;
        }
        const log = result[0];
        return {
            timestamp: log.timestamp,
            level: log.level,
            message: log.message,
            service: log.service,
            metadata: log.metadata || {},
            traceId: log.traceId || undefined,
            spanId: log.spanId || undefined,
        };
    }
    /**
     * Get logs by trace ID (for trace correlation)
     */
    async getByTraceId(traceId, limit = 100) {
        const db = (0, db_1.getDb)();
        return db
            .select()
            .from(schema_1.logs)
            .where((0, drizzle_orm_1.eq)(schema_1.logs.traceId, traceId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.logs.timestamp))
            .limit(limit);
    }
    /**
     * Get logs by span ID
     */
    async getBySpanId(spanId, limit = 100) {
        const db = (0, db_1.getDb)();
        return db
            .select()
            .from(schema_1.logs)
            .where((0, drizzle_orm_1.eq)(schema_1.logs.spanId, spanId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.logs.timestamp))
            .limit(limit);
    }
}
exports.LogRepository = LogRepository;
//# sourceMappingURL=logs.js.map