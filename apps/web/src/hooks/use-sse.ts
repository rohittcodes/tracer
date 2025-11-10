import { useEffect, useRef, useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface SSEOptions {
  apiKey: string | null;
  service?: string;
  enabled?: boolean;
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
}

/**
 * Hook for connecting to Server-Sent Events (SSE) stream
 */
export function useSSE(
  endpoint: string,
  options: SSEOptions
) {
  const { apiKey, service, enabled = true, onMessage, onError, onConnect } = options;
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);

  const connect = useCallback(() => {
    if (!enabled || !apiKey) {
      return;
    }

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Build URL with query params
    // Note: EventSource doesn't support custom headers, so we use query param
    // In production, consider using cookies or a token-based approach
    const url = new URL(endpoint, API_URL);
    url.searchParams.append('apiKey', apiKey);
    if (service) {
      url.searchParams.append('service', service);
    }

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      onConnect?.();
    };

    eventSource.onerror = (err) => {
      setError(err);
      setIsConnected(false);
      onError?.(err);
    };

    // Handle connection event
    eventSource.addEventListener('connection', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE connected:', data.message);
        onConnect?.();
      } catch (err) {
        console.error('Error parsing connection message:', err);
      }
    });

    // Handle heartbeat
    eventSource.addEventListener('heartbeat', () => {
      // Just keep connection alive, no action needed
    });

    // Handle custom event types (log, metric, alert, etc.)
    // These are handled by specific event listeners in the hooks below
    if (onMessage) {
      // Generic message handler for events without specific type
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (err) {
          console.error('Error parsing SSE message:', err);
        }
      };
    }

    return eventSource;
  }, [endpoint, apiKey, service, enabled, onMessage, onError, onConnect]);

  useEffect(() => {
    const eventSource = connect();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      setIsConnected(false);
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return {
    isConnected,
    error,
    disconnect,
    connect,
  };
}

/**
 * Hook for real-time log streaming via SSE
 */
export function useLogsSSE(apiKey: string | null, service?: string, enabled: boolean = true) {
  const [logs, setLogs] = useState<any[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);

  useEffect(() => {
    if (!enabled || !apiKey) {
      return;
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const url = new URL('/stream/logs', API_URL);
    url.searchParams.append('apiKey', apiKey);
    if (service) {
      url.searchParams.append('service', service);
    }

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onerror = (err) => {
      setError(err);
      setIsConnected(false);
    };

    // Listen for 'log' events
    eventSource.addEventListener('log', (event) => {
      try {
        const log = JSON.parse(event.data);
        setLogs((prev) => [log, ...prev].slice(0, 100)); // Keep last 100 logs
      } catch (err) {
        console.error('Error parsing log event:', err);
      }
    });

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [apiKey, service, enabled]);

  return { logs, isConnected, error };
}

/**
 * Hook for real-time metric streaming via SSE
 */
export function useMetricsSSE(apiKey: string | null, service?: string, enabled: boolean = true) {
  const [metrics, setMetrics] = useState<any[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);

  useEffect(() => {
    if (!enabled || !apiKey) {
      return;
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const url = new URL('/stream/metrics', API_URL);
    url.searchParams.append('apiKey', apiKey);
    if (service) {
      url.searchParams.append('service', service);
    }

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onerror = (err) => {
      setError(err);
      setIsConnected(false);
    };

    // Listen for 'metric' events
    eventSource.addEventListener('metric', (event) => {
      try {
        const metric = JSON.parse(event.data);
        setMetrics((prev) => {
          // Update or add metric based on service + metricType + window
          const index = prev.findIndex(
            (m) =>
              m.service === metric.service &&
              m.metricType === metric.metricType &&
              m.windowStart === metric.windowStart
          );
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = metric;
            return updated;
          }
          return [metric, ...prev].slice(0, 200); // Keep last 200 metrics
        });
      } catch (err) {
        console.error('Error parsing metric event:', err);
      }
    });

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [apiKey, service, enabled]);

  return { metrics, isConnected, error };
}

/**
 * Hook for real-time alert streaming via SSE
 */
export function useAlertsSSE(apiKey: string | null, service?: string, enabled: boolean = true) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);

  useEffect(() => {
    if (!enabled || !apiKey) {
      return;
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const url = new URL('/stream/alerts', API_URL);
    url.searchParams.append('apiKey', apiKey);
    if (service) {
      url.searchParams.append('service', service);
    }

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onerror = (err) => {
      setError(err);
      setIsConnected(false);
    };

    // Listen for 'alert' events
    eventSource.addEventListener('alert', (event) => {
      try {
        const alert = JSON.parse(event.data);
        setAlerts((prev) => {
          // Add new alert or update existing
          const index = prev.findIndex((a) => a.id === alert.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = alert;
            return updated;
          }
          return [alert, ...prev].slice(0, 50); // Keep last 50 alerts
        });
      } catch (err) {
        console.error('Error parsing alert event:', err);
      }
    });

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [apiKey, service, enabled]);

  return { alerts, isConnected, error };
}

