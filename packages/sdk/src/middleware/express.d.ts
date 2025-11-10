type ExpressRequest = any;
type ExpressResponse = any;
type ExpressNextFunction = any;
import { TracerClient } from '../index';
export interface ExpressTracingOptions {
    tracer: TracerClient;
    ignorePaths?: string[];
    setAttributes?: (req: ExpressRequest, span: any) => void;
}
/**
 * Express middleware for automatic trace instrumentation
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { TracerClient } from '@tracer/sdk';
 * import { expressTracing } from '@tracer/sdk/middleware/express';
 *
 * const app = express();
 * const tracer = new TracerClient({ service: 'api', apiKey: 'key' });
 *
 * app.use(expressTracing({ tracer }));
 * ```
 */
export declare function expressTracing(options: ExpressTracingOptions): (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => any;
export {};
//# sourceMappingURL=express.d.ts.map