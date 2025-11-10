# Express.js Example with Tracer

A complete Express.js application demonstrating how to integrate Tracer observability SDK.

## Features

- ✅ **Automatic request tracing** with Express middleware
- ✅ **Manual logging** at different levels (debug, info, warn, error, fatal)
- ✅ **Trace context propagation** for external HTTP calls (fetch & axios)
- ✅ **Error tracking and logging** with stack traces
- ✅ **Custom span attributes** and events
- ✅ **Manual span creation** and nested spans
- ✅ **Async context preservation** with `runInSpan()`
- ✅ **Span status management** (OK, ERROR, UNSET)
- ✅ **Helper methods** for logging (debug, info, warn, error, fatal)

## Setup

1. **Install dependencies:**
   ```bash
   cd apps/express-example
   pnpm install
   ```

2. **Configure environment variables:**
   
   You can put environment variables in either:
   - **Root `.env` file** (recommended - shared across all apps): `/.env`
   - **Local `.env` file**: `apps/express-example/.env`
   
   The app will check both locations. Example `.env` file:
   ```bash
   # Tracer API Configuration
   TRACER_API_URL=http://localhost:3000
   TRACER_API_KEY=
   
   # Server Configuration
   PORT=4000
   
   # Auto-Generate Data (for testing/demo)
   AUTO_GENERATE=true
   AUTO_GENERATE_INTERVAL=5000
   
   # Trace Sampling
   TRACE_SAMPLE_RATE=1.0
   ```
   
   The `.env` file is automatically loaded when the app starts.

3. **Start the Tracer services:**
   ```bash
   # From project root
   pnpm dev
   ```

4. **Run the example app:**
   ```bash
   # From project root
   pnpm example:express
   
   # Or manually
   cd apps/express-example
   pnpm dev
   ```

## Usage

The server will start on `http://localhost:4000` (or the port you specified).

### Available Endpoints

- `GET /health` - Health check (not traced)
- `GET /api/users` - Fetch all users
- `GET /api/users/:id` - Fetch user by ID
- `POST /api/users` - Create new user
- `GET /api/posts` - Fetch posts from external API (demonstrates trace propagation)
- `GET /api/orders` - Fetch orders (demonstrates service-to-service calls)
- `GET /api/error-demo` - Demonstrates error logging
- `GET /api/complex-operation` - Manual span creation, nested spans, and span events
- `GET /api/log-levels-demo` - Demonstrates helper methods (debug, info, warn, error)
- `GET /api/manual-propagation` - Manual trace context propagation
- `GET /api/async-context-demo` - Demonstrates `runInSpan()` for async context preservation

### Example Requests

```bash
# Get all users
curl http://localhost:4000/api/users

# Get specific user
curl http://localhost:4000/api/users/123

# Create user
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "alice@example.com"}'

# Trigger error demo
curl http://localhost:4000/api/error-demo
```

## What Gets Traced

1. **Automatic Request Tracing**: All routes (except `/health` and `/metrics`) are automatically traced
2. **Manual Logs**: Logs created with `tracer.log()` are automatically associated with the current request span
3. **External HTTP Calls**: Using `tracerFetch()` automatically creates child spans for outbound requests
4. **Errors**: Errors are automatically captured and logged with stack traces

## Viewing Traces

1. Open the Tracer dashboard: `http://localhost:3001`
2. Navigate to the **Traces** page
3. You'll see all requests from this Express app
4. Click on a trace to see the full span hierarchy and correlated logs

## Key Integration Points

### 1. Express Middleware

```typescript
import { expressTracing } from '@tracer/sdk';

app.use(expressTracing({
  tracer,
  ignorePaths: ['/health', '/metrics'],
  setAttributes: (req, span) => {
    span.setAttributes({
      'http.user_agent': req.get('user-agent') || '',
    });
  },
}));
```

### 2. Manual Logging

```typescript
// Using the log() method with LogLevel enum
import { LogLevel } from '@tracer/sdk';

tracer.log(LogLevel.INFO, 'User created', {
  user_id: userId,
  email: userEmail,
});

// Or use helper methods
tracer.info('User created', { user_id: userId });
tracer.error('Failed to create user', { error: err.message });
tracer.warn('Rate limit approaching', { remaining: 10 });
tracer.debug('Detailed debug info', { state: currentState });
```

### 3. Manual Span Creation

```typescript
import { SpanKind, SpanStatus } from '@tracer/sdk';

// Create a span
const span = tracer.tracer.startSpan('my-operation', SpanKind.INTERNAL);

// Add attributes
span.setAttributes({
  'operation.type': 'data-processing',
  'operation.batch_size': 100,
});

// Add events
span.addEvent('processing-started', { timestamp: new Date() });

// Set status
span.setStatus(SpanStatus.OK);

// Don't forget to end the span
span.end();
```

### 4. Nested Spans

```typescript
// Create a parent span
const parentSpan = tracer.tracer.startSpan('parent-operation', SpanKind.INTERNAL);

// Create child spans
const childSpan = tracer.tracer.startSpan('child-operation', SpanKind.INTERNAL, {
  traceId: parentSpan.traceId,
  spanId: parentSpan.spanId,
});

// ... do work ...

childSpan.end();
parentSpan.end();
```

### 5. Async Context Preservation

```typescript
// Use runInSpan to preserve context across async operations
const span = tracer.tracer.startSpan('async-operation', SpanKind.INTERNAL);

const result = await tracer.tracer.runInSpan(span, async () => {
  // Inside this function, getCurrentSpan() will return 'span'
  const currentSpan = tracer.tracer.getCurrentSpan();
  currentSpan?.setAttribute('step', 'processing');
  
  // Even in nested async operations, context is preserved
  await someAsyncOperation();
  
  return result;
});

span.end();
```

### 6. External HTTP Calls with Trace Propagation

```typescript
import { interceptFetch } from '@tracer/sdk/middleware/fetch';

// Set up fetch interception (do this once at app startup)
interceptFetch(tracer);

// Now all fetch calls automatically include trace context
const response = await fetch('https://api.example.com/data', {
  method: 'GET',
});
```

## Next Steps

- Add more endpoints to see how traces are created
- Experiment with different log levels
- Make calls between multiple Express services to see distributed tracing
- Check the dashboard to see traces, logs, and metrics

