import { TracerClient } from '../index';
/**
 * Intercept fetch calls to automatically propagate trace context
 *
 * @example
 * ```typescript
 * import { TracerClient } from '@tracer/sdk';
 * import { interceptFetch } from '@tracer/sdk/middleware/fetch';
 *
 * const tracer = new TracerClient({ service: 'api', apiKey: 'key' });
 * interceptFetch(tracer);
 *
 * // Now all fetch calls automatically include trace context
 * await fetch('https://api.example.com/users');
 * ```
 */
export declare function interceptFetch(tracer: TracerClient): void;
//# sourceMappingURL=fetch.d.ts.map