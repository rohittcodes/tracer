import { LogLevel } from '@tracer/core';
import { Tracer } from './tracer';
export interface TracerClientConfig {
    apiUrl?: string;
    apiKey?: string;
    service: string;
    batchSize?: number;
    flushInterval?: number;
    traceSampleRate?: number;
    alwaysSampleErrors?: boolean;
}
export declare class TracerClient {
    private apiUrl;
    private apiKey?;
    readonly service: string;
    private batchSize;
    private flushInterval;
    private buffer;
    private flushTimer?;
    readonly tracer: Tracer;
    private readonly maxBufferSize;
    constructor(config: TracerClientConfig);
    log(level: LogLevel, message: string, metadata?: Record<string, any>): void;
    debug(message: string, metadata?: Record<string, any>): void;
    info(message: string, metadata?: Record<string, any>): void;
    warn(message: string, metadata?: Record<string, any>): void;
    error(message: string, metadata?: Record<string, any>): void;
    fatal(message: string, metadata?: Record<string, any>): void;
    flush(): Promise<void>;
    private startAutoFlush;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=client.d.ts.map