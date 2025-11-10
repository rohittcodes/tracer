// Use Next.js API routes (server-side) instead of direct backend calls
// This ensures all data fetching happens on the server
const BACKEND_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function fetchWithAuth<T>(
  endpoint: string,
  apiKey: string,
  options?: RequestInit
): Promise<T> {
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error('Invalid endpoint: must be a non-empty string');
  }
  
  let apiRoute: string | null = null;
  
  if (endpoint.startsWith('/logs')) {
    const queryString = endpoint.includes('?') ? endpoint.split('?')[1] : '';
    apiRoute = `/api/logs${queryString ? `?${queryString}` : ''}`;
  } else if (endpoint.startsWith('/metrics')) {
    const queryString = endpoint.includes('?') ? endpoint.split('?')[1] : '';
    apiRoute = `/api/metrics${queryString ? `?${queryString}` : ''}`;
  } else if (endpoint.startsWith('/alerts')) {
    const queryString = endpoint.includes('?') ? endpoint.split('?')[1] : '';
    apiRoute = `/api/alerts${queryString ? `?${queryString}` : ''}`;
  } else if (endpoint.startsWith('/search/logs')) {
    const queryString = endpoint.includes('?') ? endpoint.split('?')[1] : '';
    apiRoute = `/api/logs${queryString ? `?${queryString}` : ''}`;
  }

  if (apiRoute) {
    const response = await fetch(apiRoute, {
      ...options,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (response.status === 401) {
      throw new Error('Invalid API key');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  const response = await fetch(`${BACKEND_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    throw new Error('Invalid API key');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export interface Log {
  id: number;
  timestamp: string;
  level: string;
  message: string;
  service: string;
  metadata?: any;
}

export interface Metric {
  id: number;
  service: string;
  metricType: string;
  value: number;
  windowStart: string;
  windowEnd: string;
}

export interface Alert {
  id: number;
  alertType: string;
  severity: string;
  message: string;
  service: string;
  resolved: boolean;
  createdAt: string;
}

export interface LogsResponse {
  logs: Log[];
}

export interface MetricsResponse {
  metrics: Metric[];
}

export interface AlertsResponse {
  alerts: Alert[];
}

export interface Service {
  name: string;
}

export interface ServicesResponse {
  services: string[];
}

export interface ServiceHealthResponse {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  errorRate: string;
  totalLogs: number;
  activeAlerts: number;
  lastLogTime: string | null;
  metrics: {
    errorCount: number;
    logCount: number;
    latencyP95: number;
  };
}

export interface SearchLogsResponse {
  logs: Log[];
  count: number;
  filters: {
    service?: string;
    level?: string;
    query?: string;
    start?: string;
    end?: string;
  };
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  service: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  status: string;
  attributes?: Record<string, any>;
  events?: Array<{
    name: string;
    timestamp: string;
    attributes?: Record<string, any>;
  }>;
  links?: Array<{
    traceId: string;
    spanId: string;
    attributes?: Record<string, any>;
  }>;
}

export interface Trace {
  traceId: string;
  service: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  spanCount: number;
  errorCount: number;
  rootSpanId?: string;
  spans: Span[];
}

export interface TraceResponse {
  trace: Trace;
  logs: Log[];
}

export interface TracesResponse {
  traces: Array<{
    id: number;
    traceId: string;
    service: string;
    startTime: string;
    endTime?: string;
    duration?: number;
    spanCount: number;
    errorCount: number;
    rootSpanId?: string;
  }>;
}

export interface ServiceMapResponse {
  services: Array<{
    name: string;
    totalCalls: number;
    totalErrors: number;
    avgLatency: number;
  }>;
  dependencies: Array<{
    from: string;
    to: string;
    callCount: number;
    errorCount: number;
    avgDuration: number;
  }>;
}


