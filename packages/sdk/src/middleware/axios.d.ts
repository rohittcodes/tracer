type AxiosInstance = any;
import { TracerClient } from '../index';
/**
 * Axios interceptor for automatic trace propagation
 *
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { TracerClient } from '@tracer/sdk';
 * import { axiosTracing } from '@tracer/sdk/middleware/axios';
 *
 * const tracer = new TracerClient({ service: 'api', apiKey: 'key' });
 * const client = axios.create();
 * axiosTracing(client, tracer);
 *
 * // Now all axios requests automatically include trace context
 * await client.get('https://api.example.com/users');
 * ```
 */
export declare function axiosTracing(axiosInstance: AxiosInstance, tracer: TracerClient): void;
export {};
//# sourceMappingURL=axios.d.ts.map