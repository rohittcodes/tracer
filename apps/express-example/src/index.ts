import { config } from 'dotenv';
import { resolve } from 'path';
import express, { Request, Response, NextFunction } from 'express';

// Load .env from express-example directory first, then fallback to root
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../../../.env') }); // Root .env
import { TracerClient, expressTracing, interceptFetch, axiosTracing, LogLevel, SpanKind, SpanStatus } from '@tracer/sdk';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize Tracer SDK
const tracer = new TracerClient({
  apiUrl: process.env.TRACER_API_URL || 'http://localhost:3000',
  apiKey: process.env.TRACER_API_KEY,
  service: 'express-example',
  batchSize: 10, // Send logs/spans in batches of 10
  flushInterval: 5000, // Flush every 5 seconds
  traceSampleRate: 1.0, // Sample 100% of traces (set to 0.1 for 10% sampling)
  alwaysSampleErrors: true, // Always sample traces with errors, even if below sample rate
});

// Intercept fetch calls to automatically propagate trace context
interceptFetch(tracer);

// Intercept axios calls to automatically propagate trace context
axiosTracing(axios, tracer);

// Use Express tracing middleware (auto-instruments all routes)
app.use(expressTracing({
  tracer,
  ignorePaths: ['/health', '/metrics'],
  setAttributes: (req, span) => {
    // Add custom attributes to spans
    span.setAttributes({
      'http.user_agent': req.get('user-agent') || '',
      'http.referer': req.get('referer') || '',
    });
  },
}));

// Middleware
app.use(express.json());

// Health check endpoint (not traced)
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Example: Simple GET endpoint
app.get('/api/users', async (req: Request, res: Response) => {
  // This will automatically create a span for this request
  
  // Manual logging
  tracer.log(LogLevel.INFO, 'Fetching users list', {
    query: req.query,
  });

  // Simulate database call
  await new Promise(resolve => setTimeout(resolve, 100));

  res.json({
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ],
  });
});

// Example: GET with ID parameter
app.get('/api/users/:id', async (req: Request, res: Response) => {
  const userId = req.params.id;

  tracer.log(LogLevel.INFO, `Fetching user ${userId}`, {
    user_id: userId,
  });

  // Simulate database lookup
  await new Promise(resolve => setTimeout(resolve, 50));

  if (userId === '999') {
    tracer.log(LogLevel.ERROR, 'User not found', { user_id: userId });
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: userId,
    name: 'John Doe',
    email: 'john@example.com',
  });
});

// Example: POST endpoint
app.post('/api/users', async (req: Request, res: Response) => {
  const { name, email } = req.body;

  tracer.log(LogLevel.INFO, 'Creating new user', {
    name,
    email,
  });

  // Simulate validation
  if (!name || !email) {
    tracer.log(LogLevel.WARN, 'Invalid user data', { body: req.body });
    return res.status(400).json({ error: 'Name and email are required' });
  }

  // Simulate database insert
  await new Promise(resolve => setTimeout(resolve, 150));

  res.status(201).json({
    id: Math.floor(Math.random() * 1000),
    name,
    email,
  });
});

// Example: Endpoint that makes external HTTP calls
app.get('/api/posts', async (req: Request, res: Response) => {
  tracer.log(LogLevel.INFO, 'Fetching posts from external API');

  try {
    // Using fetch with automatic trace propagation (intercepted by interceptFetch)
    const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=5', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    let posts: Array<{ id: number; title: string; body: string; userId: number }>;
    try {
      posts = await response.json() as Array<{ id: number; title: string; body: string; userId: number }>;
    } catch (error) {
      tracer.log(LogLevel.ERROR, 'Failed to parse posts response', { error: error instanceof Error ? error.message : 'Unknown error' });
      return res.status(500).json({ error: 'Failed to parse response from external API' });
    }

    tracer.log(LogLevel.INFO, 'Successfully fetched posts', {
      post_count: posts.length,
    });

    res.json({ posts });
  } catch (error) {
    tracer.log(LogLevel.ERROR, 'Failed to fetch posts', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Example: Endpoint with error handling
app.get('/api/error-demo', async (req: Request, res: Response) => {
  tracer.log(LogLevel.INFO, 'Demonstrating error handling');

  try {
    // Simulate an error
    throw new Error('Something went wrong!');
  } catch (error) {
    tracer.log(LogLevel.ERROR, 'Error in error-demo endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Example: Endpoint that calls another service
app.get('/api/orders', async (req: Request, res: Response) => {
  tracer.log(LogLevel.INFO, 'Fetching orders');

  try {
    // Simulate calling another microservice
    // In a real app, this would be another service URL
    // Trace context is automatically propagated via axios interceptor
    const response = await axios.get('http://localhost:4001/api/orders');

    res.json({ orders: response.data });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      tracer.log(LogLevel.ERROR, 'Failed to fetch orders from service', {
        status: error.response?.status,
        message: error.message,
      });
    }

    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Example: Manual span creation and nested spans
app.get('/api/complex-operation', async (req: Request, res: Response) => {
  // Get the current span (created by middleware)
  const currentSpan = tracer.tracer.getCurrentSpan();
  
  // Create a child span for a complex operation
  const operationSpan = tracer.tracer.startSpan('complex-operation', SpanKind.INTERNAL, 
    currentSpan ? {
      traceId: currentSpan.traceId,
      spanId: currentSpan.spanId,
    } : undefined
  );

  try {
    // Add attributes to the span
    operationSpan.setAttributes({
      'operation.type': 'data-processing',
      'operation.batch_size': 100,
    });

    // Add an event to mark the start of processing
    operationSpan.addEvent('processing-started', {
      timestamp: new Date().toISOString(),
    });

    // Simulate nested operations with child spans
    const dbSpan = tracer.tracer.startSpan('database-query', SpanKind.INTERNAL, {
      traceId: operationSpan.traceId,
      spanId: operationSpan.spanId,
    });
    
    dbSpan.setAttribute('db.query', 'SELECT * FROM users');
    dbSpan.setAttribute('db.table', 'users');
    
    // Simulate database work
    await new Promise(resolve => setTimeout(resolve, 50));
    
    dbSpan.addEvent('query-completed');
    dbSpan.end();

    // Another nested span for cache operation
    const cacheSpan = tracer.tracer.startSpan('cache-lookup', SpanKind.INTERNAL, {
      traceId: operationSpan.traceId,
      spanId: operationSpan.spanId,
    });
    
    cacheSpan.setAttribute('cache.key', 'user:123');
    cacheSpan.setAttribute('cache.hit', false);
    
    await new Promise(resolve => setTimeout(resolve, 20));
    cacheSpan.end();

    // Add completion event
    operationSpan.addEvent('processing-completed', {
      records_processed: 100,
    });

    // Set span status to success
    operationSpan.setStatus(SpanStatus.OK);

    res.json({ 
      success: true,
      message: 'Complex operation completed',
      traceId: operationSpan.traceId,
    });
  } catch (error) {
    // Mark span as error
    operationSpan.setStatus(SpanStatus.ERROR);
    operationSpan.setAttribute('error.message', error instanceof Error ? error.message : 'Unknown error');
    
    tracer.log(LogLevel.ERROR, 'Complex operation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({ error: 'Operation failed' });
  } finally {
    operationSpan.end();
  }
});

// Example: Using helper methods (debug, info, warn, error, fatal)
app.get('/api/log-levels-demo', async (req: Request, res: Response) => {
  // These are convenience methods that call tracer.log() with the appropriate level
  tracer.debug('Debug message - detailed information for development');
  tracer.info('Info message - general informational message');
  tracer.warn('Warning message - something unexpected but not critical');
  tracer.error('Error message - an error occurred');
  tracer.fatal('Fatal message - critical error that may cause shutdown');

  res.json({ 
    message: 'Check the logs to see different log levels',
    note: 'Logs are automatically correlated with the current trace',
  });
});

// Example: Manual trace context propagation
app.get('/api/manual-propagation', async (req: Request, res: Response) => {
  const currentSpan = tracer.tracer.getCurrentSpan();
  
  if (!currentSpan) {
    return res.status(500).json({ error: 'No active span' });
  }

  // Get trace context for manual propagation
  const traceHeaders = currentSpan.getTraceHeaders();
  const spanContext = currentSpan.getContext();

  // Manually propagate trace context in a custom HTTP call
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts/1', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Manually inject trace context
        ...traceHeaders,
      },
    });

    let data: any;
    try {
      data = await response.json();
    } catch (error) {
      tracer.log(LogLevel.ERROR, 'Failed to parse response', { error: error instanceof Error ? error.message : 'Unknown error' });
      return res.status(500).json({ error: 'Failed to parse response from external API' });
    }

    res.json({
      message: 'Trace context manually propagated',
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      data,
    });
  } catch (error) {
    tracer.error('Failed to propagate trace context', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Request failed' });
  }
});

// Example: Different span kinds
app.get('/api/span-kinds-demo', async (req: Request, res: Response) => {
  // Demonstrate different span kinds
  const serverSpan = tracer.tracer.startSpan('server-operation', SpanKind.SERVER);
  serverSpan.setAttribute('span.kind', 'server');
  serverSpan.end();

  const clientSpan = tracer.tracer.startSpan('client-operation', SpanKind.CLIENT);
  clientSpan.setAttribute('span.kind', 'client');
  clientSpan.end();

  const producerSpan = tracer.tracer.startSpan('producer-operation', SpanKind.PRODUCER);
  producerSpan.setAttribute('span.kind', 'producer');
  producerSpan.end();

  const consumerSpan = tracer.tracer.startSpan('consumer-operation', SpanKind.CONSUMER);
  consumerSpan.setAttribute('span.kind', 'consumer');
  consumerSpan.end();

  res.json({
    message: 'Created spans with different kinds',
    note: 'Check traces to see SERVER, CLIENT, PRODUCER, CONSUMER, and INTERNAL span kinds',
  });
});

// Example: Using runInSpan for explicit async context
app.get('/api/async-context-demo', async (req: Request, res: Response) => {
  // Create a span
  const span = tracer.tracer.startSpan('async-operation', SpanKind.INTERNAL);
  
  // Run async operations within the span's context
  const result = await tracer.tracer.runInSpan(span, async () => {
    // Inside this function, getCurrentSpan() will return 'span'
    const currentSpan = tracer.tracer.getCurrentSpan();
    currentSpan?.setAttribute('operation.step', 'step-1');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Even in nested async operations, the span context is preserved
    const nestedResult = await Promise.all([
      (async () => {
        const nestedSpan = tracer.tracer.getCurrentSpan();
        nestedSpan?.setAttribute('operation.step', 'step-2a');
        return 'result-1';
      })(),
      (async () => {
        const nestedSpan = tracer.tracer.getCurrentSpan();
        nestedSpan?.setAttribute('operation.step', 'step-2b');
        return 'result-2';
      })(),
    ]);
    
    return nestedResult;
  });
  
  span.end();

  res.json({
    message: 'Async context preserved across operations',
    result,
    traceId: span.traceId,
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  tracer.log(LogLevel.ERROR, 'Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Auto-generate data endpoint (optional)
const AUTO_GENERATE = process.env.AUTO_GENERATE === 'true';
const AUTO_GENERATE_INTERVAL = parseInt(process.env.AUTO_GENERATE_INTERVAL || '5000', 10); // Default 5 seconds

if (AUTO_GENERATE) {
  console.log(`🔄 Auto-generating data every ${AUTO_GENERATE_INTERVAL}ms`);
  
  const endpoints = [
    { method: 'GET', path: '/api/users' },
    { method: 'GET', path: '/api/users/1' },
    { method: 'GET', path: '/api/users/2' },
    { method: 'POST', path: '/api/users', body: { name: 'Auto User', email: 'auto@example.com' } },
    { method: 'GET', path: '/api/posts' },
    { method: 'GET', path: '/api/complex-operation' },
    { method: 'GET', path: '/api/log-levels-demo' },
  ];

  // Occasionally generate errors (10% of the time)
  const errorEndpoints = [
    { method: 'GET', path: '/api/users/999' },
    { method: 'GET', path: '/api/error-demo' },
  ];

  const makeInternalRequest = async (endpoint: typeof endpoints[0]) => {
    try {
      const url = `http://localhost:${PORT}${endpoint.path}`;
      const options: RequestInit = {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
      };
      
      if (endpoint.body && (endpoint.method === 'POST' || endpoint.method === 'PUT')) {
        options.body = JSON.stringify(endpoint.body);
      }

      await fetch(url, options);
    } catch (error) {
      // Silently ignore errors in auto-generation
    }
  };

  // Start auto-generation
  setInterval(() => {
    // 90% normal requests, 10% errors
    const useError = Math.random() < 0.1;
    const endpointList = useError ? errorEndpoints : endpoints;
    const endpoint = endpointList[Math.floor(Math.random() * endpointList.length)];
    
    makeInternalRequest(endpoint);
  }, AUTO_GENERATE_INTERVAL);
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Express server running on http://localhost:${PORT}`);
  console.log(`📊 Tracer API: ${process.env.TRACER_API_URL || 'http://localhost:3000'}`);
  console.log(`🔑 API Key: ${process.env.TRACER_API_KEY ? 'Set' : 'Not set (optional)'}`);
  if (AUTO_GENERATE) {
    console.log(`🔄 Auto-generating data: Enabled (every ${AUTO_GENERATE_INTERVAL}ms)`);
  }
  console.log('\nAvailable endpoints:');
  console.log('  GET  /health');
  console.log('  GET  /api/users');
  console.log('  GET  /api/users/:id');
  console.log('  POST /api/users');
  console.log('  GET  /api/posts');
  console.log('  GET  /api/orders');
  console.log('  GET  /api/error-demo');
  console.log('  GET  /api/complex-operation (manual spans, nested spans, events)');
  console.log('  GET  /api/log-levels-demo (helper methods: debug, info, warn, error, fatal)');
  console.log('  GET  /api/manual-propagation (manual trace context propagation)');
  console.log('  GET  /api/async-context-demo (runInSpan for async context)');
  console.log('  GET  /api/span-kinds-demo (different span kinds: SERVER, CLIENT, PRODUCER, CONSUMER)');
  if (!AUTO_GENERATE) {
    console.log('\n💡 Tip: Set AUTO_GENERATE=true to automatically generate data');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await tracer.shutdown(); // Properly shutdown: flush logs/spans and cleanup
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await tracer.shutdown(); // Properly shutdown: flush logs/spans and cleanup
  process.exit(0);
});

