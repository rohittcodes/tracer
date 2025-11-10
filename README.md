# Tracer - Mini Observability Platform

A lightweight, reasoning-focused observability platform designed to collect logs and metrics, process them in real-time, and send automated alerts via Composio's Tool Router.

## Architecture

- **API App**: Ingests logs via HTTP API
- **Processor App**: Processes logs, aggregates metrics, detects anomalies
- **Database**: TimescaleDB (free, open source) - used only for time-series tables (logs, metrics) with automatic compression and retention. Alerts and API keys use regular PostgreSQL tables.
- **Tool Router**: Automated alerting via Slack and Gmail

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- pnpm 10+

### Setup

1. **Clone and install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your database URL and API keys
   ```

3. **Set up database:**
   ```bash
   cd packages/db
   pnpm db:generate  # Generate migrations
   pnpm db:push      # Apply migrations
   ```

4. **Start the services:**
   ```bash
   # Terminal 1: API server
   cd apps/api
   pnpm dev

   # Terminal 2: Processor
   cd apps/processor
   pnpm dev

   # Terminal 3: Dashboard (optional)
   cd apps/web
   pnpm dev
   ```
   
   The dashboard will be available at `http://localhost:3001` (or next available port)

### Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `DATABASE_URL`: PostgreSQL connection string (required)
- `API_PORT`: API server port (default: 3000)
- `COMPOSIO_API_KEY`: Optional - only needed for Slack OAuth via Tool Router (not needed if using webhooks)
- `COMPOSIO_USER_ID`: Optional - User ID for Tool Router session (default: tracer-system)
- `RESEND_API_KEY`: Optional - Global Resend API key for email alerts. Can also be set per-channel. Uses Resend's free onboarding email domain by default.
- `RESEND_FROM_EMAIL`: Optional - Default "from" email (defaults to `onboarding@resend.dev` for free testing)

**Note**: Alert channels are configured via the API, not environment variables. See [Alert Channels Documentation](./docs/ALERT_CHANNELS.md).

## Usage

### Using the SDK (Recommended)

The easiest way to send logs is using the Tracer SDK:

```typescript
import { TracerClient } from '@tracer/sdk';

const tracer = new TracerClient({
  service: 'my-service',
  apiUrl: 'http://localhost:3000',
  apiKey: 'your-api-key-here', // Optional but recommended
});

tracer.info('User logged in', { userId: '123' });
tracer.error('Payment failed', { orderId: '456' });
```

**API Keys**: Create API keys for authentication and service scoping:

```bash
# Create an API key
curl -X POST http://localhost:3000/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "Production Key", "service": "api-service"}'

# Use the returned key in your SDK or requests
```

See `apps/express-example/` for a complete example application.

### API Key Management

Create and manage API keys for authentication:

```bash
# Create a new API key
curl -X POST http://localhost:3000/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Key",
    "service": "api-service"
  }'

# List all API keys
curl http://localhost:3000/api-keys

# Revoke an API key
curl -X DELETE http://localhost:3000/api-keys/1
```

**Note**: The plain API key is only returned once when created. Store it securely!

### Ingesting Logs via API

Send logs directly to the API (with or without API key):

```bash
# Single log (without API key)
curl -X POST http://localhost:3000/logs \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2024-01-01T12:00:00Z",
    "level": "info",
    "message": "User logged in",
    "service": "api-service",
    "metadata": { "user_id": "123" }
  }'

# Single log (with API key)
curl -X POST http://localhost:3000/logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-here" \
  -d '{
    "timestamp": "2024-01-01T12:00:00Z",
    "level": "info",
    "message": "User logged in",
    "service": "api-service"
  }'

# Batch logs
curl -X POST http://localhost:3000/logs \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [
      {
        "timestamp": "2024-01-01T12:00:00Z",
        "level": "error",
        "message": "Database connection failed",
        "service": "api-service"
      },
      {
        "timestamp": "2024-01-01T12:00:01Z",
        "level": "info",
        "message": "Request completed",
        "service": "api-service",
        "metadata": { "latency": 150 }
      }
    ]
  }'
```

### Health Check

```bash
curl http://localhost:3000/health
```

### Dashboard

Start the web dashboard to view logs, metrics, and alerts in real-time:

```bash
cd apps/web
pnpm dev
```

Open `http://localhost:3001` (or the port shown) in your browser. The dashboard shows:
- Active alerts with severity indicators
- Recent metrics aggregated by service
- Recent logs with level indicators
- Auto-refreshes every 10 seconds

### Testing with Examples

See `apps/express-example/` for a complete example application demonstrating all SDK features.

## How It Works

1. **Log Ingestion**: API receives logs and emits events to the event bus
2. **Processing**: Processor subscribes to events, batches logs, and stores them
3. **Aggregation**: Metrics are aggregated in 60-second windows
4. **Anomaly Detection**: Detects error spikes, high latency, and service downtime
5. **Alerting**: Automatically sends alerts via Tool Router to Slack and Gmail

## Project Structure

```
tracer/
├── apps/
│   ├── api/          # Log ingestion API
│   ├── processor/    # Log processing and alerting
│   └── web/          # Dashboard (optional)
├── packages/
│   ├── core/         # Types, constants, event bus
│   ├── db/           # Database schema and repositories
│   ├── infra/        # Shared infrastructure (event bus)
│   ├── router/       # Tool Router integration (future)
│   └── sdk/          # Client SDK for sending logs
├── apps/             # Applications (api, processor, web, express-example)
└── docs/             # Documentation
```

## Development

### Building

```bash
pnpm build
```

### Running in Development

```bash
pnpm dev
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Run tests for a specific package
cd packages/core && pnpm test
```

### Database Schema Management

```bash
cd packages/db
pnpm db:push      # Sync schema.ts directly to database (recommended for MVP)
pnpm db:studio    # Open Drizzle Studio

# Alternative: Use migrations (for production/teams)
pnpm db:generate  # Generate migration files after schema changes
pnpm db:migrate   # Apply migration files
```

**Note**: For MVP, we use `db:push` which directly syncs the schema without migration files. This is simpler and faster for development.

## Production Readiness

See [Production Readiness Checklist](./docs/PRODUCTION_READINESS.md) for a comprehensive assessment.

**Quick Summary**: The platform is **functionally complete** and ready for MVP/internal use. For production/external users, consider adding:
- Rate limiting
- Request size limits  
- Security headers
- Enhanced monitoring
- Structured logging

See [Quick Production Fixes](./docs/QUICK_PRODUCTION_FIXES.md) for easy-to-implement improvements.

## License

ISC
