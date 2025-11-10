"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeyRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../schema");
const crypto_1 = __importDefault(require("crypto"));
class ApiKeyRepository {
    hashKey(key) {
        return crypto_1.default.createHash('sha256').update(key).digest('hex');
    }
    generateKey() {
        const key = crypto_1.default.randomBytes(32).toString('hex');
        const hash = this.hashKey(key);
        return { key, hash };
    }
    async create(data) {
        const db = (0, db_1.getDb)();
        const { key, hash } = this.generateKey();
        const newApiKey = {
            keyHash: hash,
            name: data.name || null,
            service: data.service || null,
            active: true,
            expiresAt: data.expiresAt || null,
        };
        const result = await db.insert(schema_1.apiKeys).values(newApiKey).returning({ id: schema_1.apiKeys.id });
        return { id: result[0].id, key };
    }
    async validate(key) {
        const db = (0, db_1.getDb)();
        const hash = this.hashKey(key);
        const result = await db
            .select()
            .from(schema_1.apiKeys)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.apiKeys.keyHash, hash), (0, drizzle_orm_1.eq)(schema_1.apiKeys.active, true)))
            .limit(1);
        if (result.length === 0) {
            return null;
        }
        const apiKey = result[0];
        if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
            return null;
        }
        await db
            .update(schema_1.apiKeys)
            .set({ lastUsedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.apiKeys.id, apiKey.id));
        return apiKey;
    }
    async list(service) {
        const db = (0, db_1.getDb)();
        if (service) {
            return await db
                .select()
                .from(schema_1.apiKeys)
                .where((0, drizzle_orm_1.eq)(schema_1.apiKeys.service, service))
                .orderBy(schema_1.apiKeys.createdAt);
        }
        return await db
            .select()
            .from(schema_1.apiKeys)
            .orderBy(schema_1.apiKeys.createdAt);
    }
    async revoke(id) {
        const db = (0, db_1.getDb)();
        await db.update(schema_1.apiKeys).set({ active: false }).where((0, drizzle_orm_1.eq)(schema_1.apiKeys.id, id));
    }
    async delete(id) {
        const db = (0, db_1.getDb)();
        await db.delete(schema_1.apiKeys).where((0, drizzle_orm_1.eq)(schema_1.apiKeys.id, id));
    }
}
exports.ApiKeyRepository = ApiKeyRepository;
//# sourceMappingURL=api-keys.js.map