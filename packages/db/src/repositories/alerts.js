"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../schema");
class AlertRepository {
    /**
     * Insert a new alert
     */
    async insert(alert) {
        const db = (0, db_1.getDb)();
        const newAlert = {
            alertType: alert.alertType,
            severity: alert.severity,
            message: alert.message,
            service: alert.service,
            resolved: alert.resolved,
            createdAt: alert.createdAt,
            resolvedAt: alert.resolvedAt || null,
        };
        const result = await db.insert(schema_1.alerts).values(newAlert).returning({ id: schema_1.alerts.id });
        return result[0].id;
    }
    /**
     * Update alert resolved status
     */
    async updateResolved(id, resolved) {
        const db = (0, db_1.getDb)();
        await db
            .update(schema_1.alerts)
            .set({
            resolved,
            resolvedAt: resolved ? new Date() : null,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.alerts.id, id));
    }
    /**
     * Mark alert as sent
     */
    async markAsSent(id, sessionId) {
        const db = (0, db_1.getDb)();
        await db
            .update(schema_1.alerts)
            .set({
            alertSent: true,
            toolRouterSessionId: sessionId || null,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.alerts.id, id));
    }
    /**
     * Get active (unresolved) alerts, optionally filtered by service
     */
    async getActiveAlerts(service) {
        const db = (0, db_1.getDb)();
        const conditions = [(0, drizzle_orm_1.eq)(schema_1.alerts.resolved, false)];
        if (service) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.alerts.service, service));
        }
        return db
            .select()
            .from(schema_1.alerts)
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.alerts.createdAt));
    }
    /**
     * Get recent alerts, optionally filtered by service
     */
    async getRecentAlerts(limit = 100, service) {
        const db = (0, db_1.getDb)();
        const conditions = [];
        if (service) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.alerts.service, service));
        }
        return db
            .select()
            .from(schema_1.alerts)
            .where(conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.alerts.createdAt))
            .limit(limit);
    }
}
exports.AlertRepository = AlertRepository;
//# sourceMappingURL=alerts.js.map