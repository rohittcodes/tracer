import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { eventBus } from '@tracer/infra';
import { LogEntry, Metric, Alert } from '@tracer/core';
import { ApiKey } from '@tracer/db';
import { optionalApiKeyAuth } from '../middleware/auth';
import { logger } from '../logger';

type Variables = {
  apiKey?: ApiKey;
  service?: string | null;
};

const stream = new Hono<{ Variables: Variables }>();

// Apply authentication middleware
stream.use('*', optionalApiKeyAuth);

/**
 * SSE endpoint for real-time log streaming
 */
stream.get('/logs', (c) => {
  const apiKey = c.get('apiKey');
  const service = c.req.query('service') || apiKey?.service || undefined;

  return streamSSE(c, async (stream) => {
    let eventId = 0;
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let isClosed = false;

    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      unsubscribe();
    };

    // Send initial connection message
    try {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'connected', message: 'Connected to log stream' }),
        event: 'connection',
        id: String(eventId++),
      });
    } catch (error) {
      cleanup();
      return;
    }

    // Listen for log events from EventBus
    const logHandler = (event: { log: LogEntry }) => {
      if (isClosed) return;
      
      const log: LogEntry = event.log;

      // Filter by service if specified
      if (service && log.service !== service) {
        return;
      }

      // Stream the log to client
      stream.writeSSE({
        data: JSON.stringify(log),
        event: 'log',
        id: String(eventId++),
      }).catch((error) => {
        logger.error({ error }, 'Error writing log to SSE stream');
        cleanup();
      });
    };

    eventBus.onLogReceived(logHandler);

    const unsubscribe = () => {
      eventBus.offEvent('log.received', logHandler);
    };

    // Keep connection alive with heartbeat
    heartbeatInterval = setInterval(async () => {
      if (isClosed) {
        cleanup();
        return;
      }
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() }),
          event: 'heartbeat',
          id: String(eventId++),
        });
      } catch (error) {
        // Connection closed, cleanup
        cleanup();
      }
    }, 30000); // Every 30 seconds
  });
});

/**
 * SSE endpoint for real-time metric streaming
 */
stream.get('/metrics', (c) => {
  const apiKey = c.get('apiKey');
  const service = c.req.query('service') || apiKey?.service || undefined;

  return streamSSE(c, async (stream) => {
    let eventId = 0;
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let isClosed = false;

    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      unsubscribe();
    };

    // Send initial connection message
    try {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'connected', message: 'Connected to metric stream' }),
        event: 'connection',
        id: String(eventId++),
      });
    } catch (error) {
      cleanup();
      return;
    }

    // Listen for metric events from EventBus
    const metricHandler = (event: { metric: Metric }) => {
      if (isClosed) return;
      
      const metric: Metric = event.metric;

      // Filter by service if specified
      if (service && metric.service !== service) {
        return;
      }

      // Stream the metric to client
      stream.writeSSE({
        data: JSON.stringify(metric),
        event: 'metric',
        id: String(eventId++),
      }).catch((error) => {
        logger.error({ error }, 'Error writing metric to SSE stream');
        cleanup();
      });
    };

    eventBus.onMetricAggregated(metricHandler);

    const unsubscribe = () => {
      eventBus.offEvent('metric.aggregated', metricHandler);
    };

    // Keep connection alive with heartbeat
    heartbeatInterval = setInterval(async () => {
      if (isClosed) {
        cleanup();
        return;
      }
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() }),
          event: 'heartbeat',
          id: String(eventId++),
        });
      } catch (error) {
        // Connection closed, cleanup
        cleanup();
      }
    }, 30000); // Every 30 seconds

    // Cleanup is handled by error catch blocks in heartbeat and writeSSE
  });
});

/**
 * SSE endpoint for real-time alert streaming
 */
stream.get('/alerts', (c) => {
  const apiKey = c.get('apiKey');
  const service = c.req.query('service') || apiKey?.service || undefined;

  return streamSSE(c, async (stream) => {
    let eventId = 0;
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let isClosed = false;

    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      unsubscribe();
    };

    // Send initial connection message
    try {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'connected', message: 'Connected to alert stream' }),
        event: 'connection',
        id: String(eventId++),
      });
    } catch (error) {
      cleanup();
      return;
    }

    // Listen for alert events from EventBus
    const alertHandler = (event: { alert: Alert }) => {
      if (isClosed) return;
      
      const alert: Alert = event.alert;

      // Filter by service if specified
      if (service && alert.service !== service) {
        return;
      }

      // Stream the alert to client
      stream.writeSSE({
        data: JSON.stringify(alert),
        event: 'alert',
        id: String(eventId++),
      }).catch((error) => {
        logger.error({ error }, 'Error writing alert to SSE stream');
        cleanup();
      });
    };

    eventBus.onAlertTriggered(alertHandler);

    const unsubscribe = () => {
      eventBus.offEvent('alert.triggered', alertHandler);
    };

    // Keep connection alive with heartbeat
    heartbeatInterval = setInterval(async () => {
      if (isClosed) {
        cleanup();
        return;
      }
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() }),
          event: 'heartbeat',
          id: String(eventId++),
        });
      } catch (error) {
        // Connection closed, cleanup
        cleanup();
      }
    }, 30000); // Every 30 seconds

    // Cleanup is handled by error catch blocks in heartbeat and writeSSE
  });
});

export default stream;

