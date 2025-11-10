"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertChannelRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../schema");
class AlertChannelRepository {
    async create(data) {
        const db = (0, db_1.getDb)();
        const newChannel = {
            channelType: data.channelType,
            name: data.name || null,
            service: data.service || null,
            active: true,
            config: data.config,
        };
        const result = await db.insert(schema_1.alertChannels).values(newChannel).returning();
        return result[0];
    }
    async list(service, channelType) {
        const db = (0, db_1.getDb)();
        const conditions = [];
        if (service) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.alertChannels.service, service));
        }
        if (channelType) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.alertChannels.channelType, channelType));
        }
        conditions.push((0, drizzle_orm_1.eq)(schema_1.alertChannels.active, true));
        return await db
            .select()
            .from(schema_1.alertChannels)
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy(schema_1.alertChannels.createdAt);
    }
    async getById(id) {
        const db = (0, db_1.getDb)();
        const result = await db
            .select()
            .from(schema_1.alertChannels)
            .where((0, drizzle_orm_1.eq)(schema_1.alertChannels.id, id))
            .limit(1);
        return result[0] || null;
    }
    async update(id, data) {
        const db = (0, db_1.getDb)();
        await db
            .update(schema_1.alertChannels)
            .set({
            ...data,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.alertChannels.id, id));
    }
    async delete(id) {
        const db = (0, db_1.getDb)();
        await db.delete(schema_1.alertChannels).where((0, drizzle_orm_1.eq)(schema_1.alertChannels.id, id));
    }
    async deactivate(id) {
        const db = (0, db_1.getDb)();
        await db
            .update(schema_1.alertChannels)
            .set({ active: false, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.alertChannels.id, id));
    }
}
exports.AlertChannelRepository = AlertChannelRepository;
//# sourceMappingURL=alert-channels.js.map