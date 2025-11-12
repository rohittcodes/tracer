type FastifyRequest = any;
type FastifyInstance = any;
import { TracerClient } from '../index';
export interface FastifyTracingOptions {
    tracer: TracerClient;
    ignorePaths?: string[];
    setAttributes?: (req: FastifyRequest, span: any) => void;
}
/**
 * Fastify plugin for automatic trace instrumentation
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import { TracerClient } from '@tracer/sdk';
 * import { fastifyTracing } from '@tracer/sdk/middleware/fastify';
 *
 * const fastify = Fastify();
 * const tracer = new TracerClient({ service: 'api', apiKey: 'key' });
 *
 * await fastify.register(fastifyTracing, { tracer });
 * ```
 */
export declare function fastifyTracing(fastify: FastifyInstance, options: FastifyTracingOptions): void;
export {};
//# sourceMappingURL=fastify.d.ts.map