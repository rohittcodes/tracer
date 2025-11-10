type HonoContext = any;
type HonoNext = any;
import { TracerClient } from '../index';
export interface HonoTracingOptions {
    tracer: TracerClient;
    ignorePaths?: string[];
    setAttributes?: (c: HonoContext, span: any) => void;
}
/**
 * Hono middleware for automatic trace instrumentation
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { TracerClient } from '@tracer/sdk';
 * import { honoTracing } from '@tracer/sdk/middleware/hono';
 *
 * const app = new Hono();
 * const tracer = new TracerClient({ service: 'api', apiKey: 'key' });
 *
 * app.use('*', honoTracing({ tracer }));
 * ```
 */
export declare function honoTracing(options: HonoTracingOptions): (c: HonoContext, next: HonoNext) => Promise<any>;
export {};
//# sourceMappingURL=hono.d.ts.map