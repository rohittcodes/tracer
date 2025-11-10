import { Pool } from 'pg';
export declare function getDb(): import("drizzle-orm/node-postgres").NodePgDatabase<Record<string, unknown>> & {
    $client: Pool;
};
export declare function getPool(): Pool;
export declare function closeDb(): Promise<void>;
export declare function setupTimescaleDB(): Promise<void>;
//# sourceMappingURL=db.d.ts.map