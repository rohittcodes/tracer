import { Hono } from 'hono';
import { TraceRepository, LogRepository, ApiKey } from '@tracer/db';
import { Span, Trace } from '@tracer/core';
import { logger } from '../logger';

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

const traces = new Hono<{ Variables: Variables }>();

/**
 * POST /traces/spans - Accept spans from SDK
 */
traces.post('/spans', async (c) => {
  try {
    let body: any;
    try {
      body = await c.req.json();
    } catch (error) {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    const apiKey = c.get('apiKey');
    const defaultService = apiKey?.service || null;

    let spans: Span[];

    if (Array.isArray(body.spans)) {
      spans = body.spans;
    } else if (body.traceId && body.spanId) {
      spans = [body];
    } else {
      return c.json({ error: 'Invalid request format. Expected { spans: [...] } or single span' }, 400);
    }

    // Apply default service if API key has one
    if (defaultService) {
      spans = spans.map(span => ({ ...span, service: defaultService }));
    }

    const traceRepository = new TraceRepository();

    // Process spans and update/create traces
    const traceMap = new Map<string, { spans: Span[]; errorCount: number; startTime: Date; endTime?: Date }>();

    for (const span of spans) {
      // Parse dates with validation
      const startTime = new Date(span.startTime);
      if (isNaN(startTime.getTime())) {
        logger.warn({ spanId: span.spanId, startTime: span.startTime }, 'Invalid startTime, skipping span');
        continue;
      }
      const endTime = span.endTime ? (() => {
        const date = new Date(span.endTime);
        return isNaN(date.getTime()) ? undefined : date;
      })() : undefined;

      // Track trace metadata
      if (!traceMap.has(span.traceId)) {
        traceMap.set(span.traceId, {
          spans: [],
          errorCount: 0,
          startTime,
          endTime,
        });
      }

      const traceData = traceMap.get(span.traceId);
      if (!traceData) {
        logger.warn({ traceId: span.traceId }, 'Trace data not found in map, skipping span');
        continue;
      }
      traceData.spans.push(span);
      
      if (span.status === 'error') {
        traceData.errorCount++;
      }

      // Update trace time bounds
      if (startTime < traceData.startTime) {
        traceData.startTime = startTime;
      }
      if (endTime && (!traceData.endTime || endTime > traceData.endTime)) {
        traceData.endTime = endTime;
      }
    }

    // Insert spans
    await traceRepository.insertSpansBatch(spans);

    // Update or create trace records
    for (const [traceId, traceData] of traceMap.entries()) {
      const rootSpan = traceData.spans.find(s => !s.parentSpanId);
      const duration = traceData.endTime 
        ? traceData.endTime.getTime() - traceData.startTime.getTime()
        : undefined;

      // Check if trace exists
      const existingTrace = await traceRepository.getByTraceId(traceId);
      
      if (existingTrace) {
        // Update existing trace
        await traceRepository.updateTraceEnd(
          traceId,
          traceData.endTime || new Date(),
          duration || 0
        );
      } else {
        // Create new trace
        // Ensure we have at least one span before accessing spans[0]
        if (traceData.spans.length === 0) {
          logger.warn({ traceId }, 'Trace has no spans, skipping trace creation');
          continue;
        }
        
        const newTrace: Trace = {
          traceId,
          service: traceData.spans[0].service, // Use first span's service
          startTime: traceData.startTime,
          endTime: traceData.endTime,
          duration,
          spanCount: traceData.spans.length,
          errorCount: traceData.errorCount,
          rootSpanId: rootSpan?.spanId,
          spans: traceData.spans,
        };
        await traceRepository.insertTrace(newTrace);
      }
    }

    return c.json({ accepted: spans.length }, 202);
  } catch (error) {
    logger.error({ error }, 'Error processing spans');
    return c.json(
      { error: 'Failed to process spans', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * GET /traces/:traceId - Get a specific trace with all spans
 */
traces.get('/:traceId', async (c) => {
  try {
    const traceId = c.req.param('traceId');
    const apiKey = c.get('apiKey');

    const traceRepository = new TraceRepository();
    const trace = await traceRepository.getByTraceId(traceId);

    if (!trace) {
      return c.json({ error: 'Trace not found' }, 404);
    }

    // Check service access
    if (apiKey?.service && trace.service !== apiKey.service) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get associated logs
    const logRepository = new LogRepository();
    const logs = await logRepository.getByTraceId(traceId, 100);
    const logsArray = await logs;

    return c.json({
      trace,
      logs: logsArray,
    });
  } catch (error) {
    const traceId = c.req.param('traceId');
    logger.error({ error, traceId }, 'Error fetching trace');
    return c.json(
      { error: 'Failed to fetch trace', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * GET /traces - List traces (with search support)
 */
traces.get('/', async (c) => {
  try {
    const apiKey = c.get('apiKey');
    const service = c.req.query('service') || apiKey?.service || undefined;
    const limitParam = c.req.query('limit') || '100';
    const limit = parseInt(limitParam, 10);
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return c.json({ error: 'Invalid limit parameter. Must be a number between 1 and 1000' }, 400);
    }
    const start = c.req.query('start');
    const end = c.req.query('end');
    
    // Search filters
    const hasErrors = c.req.query('hasErrors');
    const minDuration = c.req.query('minDuration');
    const maxDuration = c.req.query('maxDuration');
    const spanName = c.req.query('spanName');
    const spanAttributes = c.req.query('spanAttributes'); // JSON string like {"http.method":"GET"}

    const traceRepository = new TraceRepository();

    let traces;
    
    // Parse span attributes if provided
    let parsedSpanAttributes: Record<string, any> | undefined;
    if (spanAttributes) {
      try {
        parsedSpanAttributes = JSON.parse(spanAttributes);
      } catch (e) {
        return c.json({ error: 'Invalid spanAttributes JSON' }, 400);
      }
    }
    
    // Use search if filters are provided
    if (hasErrors !== undefined || minDuration || maxDuration || spanName || parsedSpanAttributes) {
      traces = await traceRepository.searchTraces({
        service,
        hasErrors: hasErrors === 'true' ? true : hasErrors === 'false' ? false : undefined,
        minDuration: minDuration ? (isNaN(parseFloat(minDuration)) ? undefined : parseFloat(minDuration)) : undefined,
        maxDuration: maxDuration ? (isNaN(parseFloat(maxDuration)) ? undefined : parseFloat(maxDuration)) : undefined,
        startTime: start ? (isNaN(Date.parse(start)) ? undefined : new Date(start)) : undefined,
        endTime: end ? (isNaN(Date.parse(end)) ? undefined : new Date(end)) : undefined,
        spanName,
        spanAttributes: parsedSpanAttributes,
        limit,
      });
    } else if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return c.json({ error: 'Invalid date format for start or end parameter' }, 400);
      }
      traces = await traceRepository.queryByTimeRange(
        startDate,
        endDate,
        service,
        limit
      );
    } else {
      traces = await traceRepository.getRecentTraces(service, limit);
    }

    const tracesArray = await traces;

    return c.json({ traces: tracesArray });
  } catch (error) {
    logger.error({ error, filters: c.req.query() }, 'Error fetching traces');
    return c.json(
      { error: 'Failed to fetch traces', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default traces;

