import { TracerClient, SpanKind, SpanStatus } from '../index';

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
export function interceptFetch(tracer: TracerClient) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function(
    input: string | Request | URL,
    init?: RequestInit
  ): Promise<Response> {
    const currentSpan = tracer.tracer.getCurrentSpan();
    
    if (!currentSpan) {
      return originalFetch(input, init);
    }

    // Create a child span for the HTTP request
    const span = tracer.tracer.startSpan(
      `HTTP ${typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url}`,
      SpanKind.CLIENT,
      currentSpan.getContext()
    );

    // Extract method and URL
    const url = typeof input === 'string' 
      ? input 
      : input instanceof URL 
        ? input.toString()
        : input.url;
    const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET');

    span.setAttributes({
      'http.method': method,
      'http.url': url,
    });

    // Inject trace context into headers
    const headers = new Headers(init?.headers);
    const traceHeaders = currentSpan.getTraceHeaders();
    Object.entries(traceHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });

    const newInit: RequestInit = {
      ...init,
      headers,
    };

    try {
      const response = await originalFetch(input, newInit);
      
      span.setAttribute('http.status_code', response.status);
      
      if (response.status >= 400) {
        span.setStatus(SpanStatus.ERROR);
      } else {
        span.setStatus(SpanStatus.OK);
      }

      span.end();
      return response;
    } catch (error) {
      span.setStatus(SpanStatus.ERROR);
      span.setAttributes({
        'error.message': (error as Error).message,
        'error.stack': (error as Error).stack || '',
      });
      span.end();
      throw error;
    }
  };
}

