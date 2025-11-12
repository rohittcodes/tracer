"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraceRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../schema");
class TraceRepository {
    /**
     * Insert a new trace
     */
    async insertTrace(trace) {
        const db = (0, db_1.getDb)();
        const newTrace = {
            traceId: trace.traceId,
            service: trace.service,
            startTime: trace.startTime,
            endTime: trace.endTime || null,
            duration: trace.duration || null,
            spanCount: trace.spanCount,
            errorCount: trace.errorCount,
            rootSpanId: trace.rootSpanId || null,
        };
        const result = await db.insert(schema_1.traces).values(newTrace).returning({ id: schema_1.traces.id });
        return result[0].id;
    }
    /**
     * Insert a span
     */
    async insertSpan(span) {
        const db = (0, db_1.getDb)();
        const newSpan = {
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId || null,
            name: span.name,
            kind: span.kind,
            service: span.service,
            startTime: span.startTime,
            endTime: span.endTime || null,
            duration: span.duration || null,
            status: span.status,
            attributes: span.attributes || null,
            events: span.events ? span.events : null,
            links: span.links ? span.links : null,
        };
        const result = await db.insert(schema_1.spans).values(newSpan).returning({ id: schema_1.spans.id });
        return result[0].id;
    }
    /**
     * Insert multiple spans in a batch
     */
    async insertSpansBatch(spanList) {
        const db = (0, db_1.getDb)();
        const newSpans = spanList.map((span) => ({
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId || null,
            name: span.name,
            kind: span.kind,
            service: span.service,
            startTime: span.startTime,
            endTime: span.endTime || null,
            duration: span.duration || null,
            status: span.status,
            attributes: span.attributes || null,
            events: span.events ? span.events : null,
            links: span.links ? span.links : null,
        }));
        await db.insert(schema_1.spans).values(newSpans);
    }
    /**
     * Get a trace by trace ID with all spans
     */
    async getByTraceId(traceId) {
        const db = (0, db_1.getDb)();
        // Get trace metadata
        const traceResult = await db
            .select()
            .from(schema_1.traces)
            .where((0, drizzle_orm_1.eq)(schema_1.traces.traceId, traceId))
            .limit(1);
        if (traceResult.length === 0) {
            return null;
        }
        const traceData = traceResult[0];
        // Get all spans for this trace
        const spansResult = await db
            .select()
            .from(schema_1.spans)
            .where((0, drizzle_orm_1.eq)(schema_1.spans.traceId, traceId))
            .orderBy(schema_1.spans.startTime);
        const spanList = spansResult.map((s) => ({
            traceId: s.traceId,
            spanId: s.spanId,
            parentSpanId: s.parentSpanId || undefined,
            name: s.name,
            kind: s.kind,
            service: s.service,
            startTime: s.startTime,
            endTime: s.endTime || undefined,
            duration: s.duration || undefined,
            status: s.status,
            attributes: s.attributes || undefined,
            events: s.events || undefined,
            links: s.links || undefined,
        }));
        return {
            traceId: traceData.traceId,
            service: traceData.service,
            startTime: traceData.startTime,
            endTime: traceData.endTime || undefined,
            duration: traceData.duration || undefined,
            spanCount: traceData.spanCount,
            errorCount: traceData.errorCount,
            rootSpanId: traceData.rootSpanId || undefined,
            spans: spanList,
        };
    }
    /**
     * Get recent traces, optionally filtered by service
     */
    async getRecentTraces(service, limit = 100) {
        const db = (0, db_1.getDb)();
        if (service) {
            return db
                .select()
                .from(schema_1.traces)
                .where((0, drizzle_orm_1.eq)(schema_1.traces.service, service))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.traces.startTime))
                .limit(limit);
        }
        return db
            .select()
            .from(schema_1.traces)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.traces.startTime))
            .limit(limit);
    }
    /**
     * Query traces by time range
     */
    async queryByTimeRange(start, end, service, limit) {
        const db = (0, db_1.getDb)();
        const conditions = [(0, drizzle_orm_1.gte)(schema_1.traces.startTime, start), (0, drizzle_orm_1.lte)(schema_1.traces.startTime, end)];
        if (service) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.traces.service, service));
        }
        let query = db
            .select()
            .from(schema_1.traces)
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.traces.startTime));
        if (limit) {
            query = query.limit(limit);
        }
        return query;
    }
    /**
     * Update trace end time and duration
     */
    async updateTraceEnd(traceId, endTime, duration) {
        const db = (0, db_1.getDb)();
        await db
            .update(schema_1.traces)
            .set({
            endTime,
            duration,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.traces.traceId, traceId));
    }
    /**
     * Update span end time and duration
     */
    async updateSpanEnd(spanId, endTime, duration, status) {
        const db = (0, db_1.getDb)();
        await db
            .update(schema_1.spans)
            .set({
            endTime,
            duration,
            ...(status && { status: status }),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.spans.spanId, spanId));
    }
    /**
     * Get service dependencies from trace data
     * Analyzes spans to find service-to-service calls
     */
    async getServiceDependencies(timeWindowHours = 24) {
        const pool = (0, db_1.getPool)();
        const since = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
        // Query to find service dependencies by analyzing parent-child span relationships
        // A dependency exists when a span from service A has a child span from service B
        const result = await pool.query(`
      SELECT 
        parent.service as from_service,
        child.service as to_service,
        COUNT(*) as call_count,
        SUM(CASE WHEN child.status = 'error' THEN 1 ELSE 0 END) as error_count,
        AVG(child.duration) as avg_duration
      FROM spans child
      INNER JOIN spans parent ON child.parent_span_id = parent.span_id
      WHERE child.start_time >= $1
        AND child.service != parent.service
      GROUP BY parent.service, child.service
      ORDER BY call_count DESC
    `, [since]);
        return result.rows.map((row) => ({
            from: row.from_service,
            to: row.to_service,
            callCount: parseInt(row.call_count, 10),
            errorCount: parseInt(row.error_count, 10),
            avgDuration: parseFloat(row.avg_duration) || 0,
        }));
    }
    /**
     * Search traces by various criteria
     */
    async searchTraces(filters) {
        const db = (0, db_1.getDb)();
        const pool = (0, db_1.getPool)();
        const conditions = [];
        if (filters.service) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.traces.service, filters.service));
        }
        if (filters.hasErrors !== undefined) {
            if (filters.hasErrors) {
                conditions.push((0, drizzle_orm_1.sql) `${schema_1.traces.errorCount} > 0`);
            }
            else {
                conditions.push((0, drizzle_orm_1.sql) `${schema_1.traces.errorCount} = 0`);
            }
        }
        if (filters.minDuration !== undefined) {
            conditions.push((0, drizzle_orm_1.sql) `${schema_1.traces.duration} >= ${filters.minDuration}`);
        }
        if (filters.maxDuration !== undefined) {
            conditions.push((0, drizzle_orm_1.sql) `${schema_1.traces.duration} <= ${filters.maxDuration}`);
        }
        if (filters.startTime) {
            conditions.push((0, drizzle_orm_1.gte)(schema_1.traces.startTime, filters.startTime));
        }
        if (filters.endTime) {
            conditions.push((0, drizzle_orm_1.lte)(schema_1.traces.startTime, filters.endTime));
        }
        // If searching by span attributes or name, we need to join with spans table
        if (filters.spanAttributes || filters.spanName) {
            const spanConditions = [];
            const params = [];
            let paramIndex = 1;
            if (filters.spanName) {
                spanConditions.push(`s.name = $${paramIndex}`);
                params.push(filters.spanName);
                paramIndex++;
            }
            if (filters.spanAttributes) {
                for (const [key, value] of Object.entries(filters.spanAttributes)) {
                    spanConditions.push(`s.attributes->>$${paramIndex} = $${paramIndex + 1}`);
                    params.push(key);
                    params.push(String(value));
                    paramIndex += 2;
                }
            }
            // Build trace conditions
            const traceConditions = [];
            if (filters.service) {
                traceConditions.push(`t.service = $${paramIndex}`);
                params.push(filters.service);
                paramIndex++;
            }
            if (filters.hasErrors !== undefined) {
                if (filters.hasErrors) {
                    traceConditions.push(`t.error_count > 0`);
                }
                else {
                    traceConditions.push(`t.error_count = 0`);
                }
            }
            if (filters.minDuration !== undefined) {
                traceConditions.push(`t.duration >= $${paramIndex}`);
                params.push(filters.minDuration);
                paramIndex++;
            }
            if (filters.maxDuration !== undefined) {
                traceConditions.push(`t.duration <= $${paramIndex}`);
                params.push(filters.maxDuration);
                paramIndex++;
            }
            if (filters.startTime) {
                traceConditions.push(`t.start_time >= $${paramIndex}`);
                params.push(filters.startTime);
                paramIndex++;
            }
            if (filters.endTime) {
                traceConditions.push(`t.start_time <= $${paramIndex}`);
                params.push(filters.endTime);
                paramIndex++;
            }
            const allConditions = [...traceConditions, ...spanConditions];
            const whereClause = allConditions.length > 0
                ? `WHERE ${allConditions.join(' AND ')}`
                : '';
            const limit = filters.limit || 100;
            const query = `
        SELECT DISTINCT t.*
        FROM traces t
        INNER JOIN spans s ON t.trace_id = s.trace_id
        ${whereClause}
        ORDER BY t.start_time DESC
        LIMIT $${paramIndex}
      `;
            params.push(limit);
            const result = await pool.query(query, params);
            return result.rows;
        }
        // Standard query without span filtering
        let query = db
            .select()
            .from(schema_1.traces)
            .where(conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.traces.startTime));
        if (filters.limit) {
            query = query.limit(filters.limit);
        }
        return query;
    }
}
exports.TraceRepository = TraceRepository;
//# sourceMappingURL=traces.js.map