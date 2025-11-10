# Using Express Example for Data Ingestion

The Express example app **IS** your data ingestion tool. Simply start it and make HTTP requests to its endpoints - each request automatically generates traces, logs, and spans.

## Quick Start

### 1. Start Tracer Services

```bash
# From project root
pnpm dev
```

This starts:
- API server on `http://localhost:3000`
- Web dashboard on `http://localhost:3001`
- Processor (handles logs, metrics, alerts)

### 2. Start Express Example App

```bash
# From project root
pnpm example:express

# Or manually
cd apps/express-example
pnpm dev
```

The Express app will start on `http://localhost:4000` (or the port you set in `PORT` env var).

### 3. Generate Data (Choose One Method)

**Option A: Auto-Generate (Recommended - No Manual Requests!)**

The app automatically loads settings from `.env` file. Just create/update `.env`:

```bash
# Copy example env file
cp .env.example .env

# Or create .env with:
AUTO_GENERATE=true
AUTO_GENERATE_INTERVAL=5000  # Generate data every 5 seconds (adjust as needed)
```

Then start the app:
```bash
pnpm example:express
```

The app will automatically make requests to itself in the background, generating traces, logs, and spans continuously. No manual requests needed!

**Option B: Manual Requests**

Simply make HTTP requests to any endpoint - each request automatically generates observability data. Use `curl`, Postman, browser, or any HTTP client.

## Available Endpoints for Data Generation

### Basic Operations (Generate Normal Traces)

```bash
# Get all users (generates trace + info log)
curl http://localhost:4000/api/users

# Get specific user (generates trace + info log)
curl http://localhost:4000/api/users/123

# Create user (generates trace + info log)
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "alice@example.com"}'

# Get user that doesn't exist (generates error log)
curl http://localhost:4000/api/users/999
```

### External API Calls (Generate Distributed Traces)

```bash
# Fetches from external API, creates child span
curl http://localhost:4000/api/posts

# Simulates service-to-service call
curl http://localhost:4000/api/orders
```

### Error Generation

```bash
# Generates error trace with error log
curl http://localhost:4000/api/error-demo
```

### Complex Operations (Generate Nested Spans)

```bash
# Creates parent span with nested child spans (database, cache)
curl http://localhost:4000/api/complex-operation
```

### Different Log Levels

```bash
# Generates logs at all levels: debug, info, warn, error, fatal
curl http://localhost:4000/api/log-levels-demo
```

### Manual Trace Propagation

```bash
# Demonstrates manual trace context propagation
curl http://localhost:4000/api/manual-propagation
```

### Async Context

```bash
# Demonstrates async context preservation
curl http://localhost:4000/api/async-context-demo
```

### Different Span Kinds

```bash
# Creates spans with different kinds (SERVER, CLIENT, PRODUCER, CONSUMER)
curl http://localhost:4000/api/span-kinds-demo
```

## Generating Data

### Recommended: Auto-Generate (Built-in)

The easiest way - just set environment variables and the app generates data automatically:

Edit `.env` file and set:

```bash
# Generate data every 5 seconds (default)
AUTO_GENERATE=true
AUTO_GENERATE_INTERVAL=5000

# Generate data faster (every 1 second)
AUTO_GENERATE_INTERVAL=1000

# Generate data slower (every 10 seconds)
AUTO_GENERATE_INTERVAL=10000
```

Then restart the app: `pnpm example:express`

The app will automatically:
- Make requests to various endpoints
- Generate normal traces (90% of requests)
- Generate error traces (10% of requests)
- Create logs at different levels
- Create nested spans and complex operations

**No manual requests needed!** Just start the app and watch the dashboard.

### Alternative: Manual Methods

If you prefer manual control:

#### Option 1: Use Apache Bench (ab) or similar

```bash
# Generate 1000 requests to /api/users
ab -n 1000 -c 10 http://localhost:4000/api/users

# Generate 500 requests to /api/complex-operation
ab -n 500 -c 5 http://localhost:4000/api/complex-operation
```

### Option 3: Use curl in a loop

```bash
# Generate 100 requests
for i in {1..100}; do
  curl http://localhost:4000/api/users
  sleep 0.1
done
```

### Option 4: Use load testing tools

```bash
# Using k6 (https://k6.io)
k6 run --vus 10 --duration 30s script.js

# Using wrk
wrk -t4 -c100 -d30s http://localhost:4000/api/users

# Using hey
hey -n 1000 -c 10 http://localhost:4000/api/users
```

## What Data Gets Generated

Each request generates:

1. **Trace**: Automatically created by Express middleware
   - Contains request span with HTTP attributes
   - May contain child spans for external calls
   - May contain nested spans for complex operations

2. **Logs**: Created by `tracer.log()` calls
   - Automatically correlated with trace
   - Different log levels (debug, info, warn, error, fatal)
   - Custom attributes

3. **Spans**: 
   - Automatic spans from middleware
   - Manual spans for complex operations
   - Child spans for nested operations
   - Different span kinds (SERVER, CLIENT, PRODUCER, CONSUMER, INTERNAL)

4. **Metrics**: Automatically aggregated from traces
   - Request rate
   - Error rate
   - Latency (p50, p95, p99)

## Viewing Generated Data

1. **Traces**: Open `http://localhost:3001/traces`
   - See all traces from the Express app
   - Filter by service, time range, errors, etc.
   - Click a trace to see full span hierarchy

2. **Logs**: Open `http://localhost:3001/logs`
   - See all logs correlated with traces
   - Filter by service, level, time range
   - Search by message content

3. **Service Map**: Open `http://localhost:3001/service-map`
   - See service dependencies
   - See call volumes between services

4. **Alerts**: Open `http://localhost:3001/alerts`
   - See active alerts (if error thresholds are met)
   - See alert history

## Tips for Realistic Data Generation

1. **Mix of Endpoints**: Hit different endpoints to create variety
   - Some successful requests
   - Some errors (use `/api/users/999` or `/api/error-demo`)
   - Some complex operations

2. **Vary Request Rates**: 
   - Burst traffic (many requests quickly)
   - Steady traffic (consistent rate)
   - Sparse traffic (occasional requests)

3. **Time Distribution**:
   - Generate data over time (not all at once)
   - Simulate peak hours vs quiet hours

4. **Error Patterns**:
   - Occasional errors (5-10% error rate)
   - Error spikes (many errors in short time)
   - Recovering errors (errors then recovery)

## Example: Generate Test Data for Dashboard

### Using Auto-Generate (Easiest)

```bash
# Terminal 1: Start services
pnpm dev

# Terminal 2: Start Express app (auto-generation enabled in .env)
pnpm example:express

# That's it! Data is being generated automatically.
# Check the dashboard at http://localhost:3001
```

### Using Manual Requests

```bash
# Terminal 1: Start services
pnpm dev

# Terminal 2: Start Express app
pnpm example:express

# Terminal 3: Generate data using curl, ab, or any HTTP client
# Example with curl loop:
for i in {1..500}; do
  curl http://localhost:4000/api/users
  sleep 0.1
done

# Or use Apache Bench:
ab -n 500 -c 10 http://localhost:4000/api/users

# Now check the dashboard at http://localhost:3001
```

## Environment Variables

You can customize the Express app behavior by editing the `.env` file:

```bash
# Tracer API URL (default: http://localhost:3000)
TRACER_API_URL=http://localhost:3000

# API Key (optional, for authentication)
TRACER_API_KEY=your_api_key_here

# Server port (default: 4000)
PORT=4000

# Auto-generate data (default: false)
# When true, the app automatically generates data in the background
AUTO_GENERATE=true

# Auto-generate interval in milliseconds (default: 5000 = 5 seconds)
# Lower = more frequent data generation
AUTO_GENERATE_INTERVAL=5000

# Trace sample rate (default: 1.0 = 100%)
TRACE_SAMPLE_RATE=1.0
```

The `.env` file is automatically loaded when the app starts. You can copy `.env.example` to `.env` and customize it.

## Next Steps

- Experiment with different endpoints
- Generate data over time to see trends
- Create multiple Express instances to simulate microservices
- Use the AI features to analyze the generated data

