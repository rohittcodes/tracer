"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupAdditionalIndexes = setupAdditionalIndexes;
const db_1 = require("./db");
async function setupAdditionalIndexes() {
    const pool = (0, db_1.getPool)();
    try {
        await pool.query(`
      CREATE INDEX IF NOT EXISTS logs_metadata_gin_idx 
      ON logs USING gin (metadata);
    `);
        console.log('✅ GIN index created for logs.metadata');
    }
    catch (error) {
        console.warn('Failed to create additional indexes:', error);
    }
}
//# sourceMappingURL=setup-indexes.js.map