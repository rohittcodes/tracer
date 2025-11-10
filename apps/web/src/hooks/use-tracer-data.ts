import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth, LogsResponse, MetricsResponse, AlertsResponse, ServicesResponse, ServiceHealthResponse, SearchLogsResponse, TraceResponse, TracesResponse, ServiceMapResponse } from '@/lib/api-client';

export function useLogs(apiKey: string | null, limit: number = 100) {
  return useQuery<LogsResponse>({
    queryKey: ['logs', apiKey, limit],
    queryFn: () => {
      if (!apiKey) throw new Error('API key required');
      return fetchWithAuth<LogsResponse>(`/logs?limit=${limit}`, apiKey);
    },
    enabled: !!apiKey,
    refetchInterval: 10000, // Refetch every 10 seconds
    staleTime: 5000, // Consider data stale after 5 seconds
  });
}

export function useMetrics(apiKey: string | null, limit: number = 200) {
  return useQuery<MetricsResponse>({
    queryKey: ['metrics', apiKey, limit],
    queryFn: () => {
      if (!apiKey) throw new Error('API key required');
      return fetchWithAuth<MetricsResponse>(`/metrics?limit=${limit}`, apiKey);
    },
    enabled: !!apiKey,
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useAlerts(apiKey: string | null, active: boolean = true, limit: number = 50) {
  return useQuery<AlertsResponse>({
    queryKey: ['alerts', apiKey, active, limit],
    queryFn: () => {
      if (!apiKey) throw new Error('API key required');
      return fetchWithAuth<AlertsResponse>(`/alerts?active=${active}&limit=${limit}`, apiKey);
    },
    enabled: !!apiKey,
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useServices(apiKey: string | null) {
  return useQuery<ServicesResponse>({
    queryKey: ['services', apiKey],
    queryFn: () => {
      if (!apiKey) throw new Error('API key required');
      return fetchWithAuth<ServicesResponse>('/services', apiKey);
    },
    enabled: !!apiKey,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}

export function useServiceHealth(apiKey: string | null, service: string) {
  return useQuery<ServiceHealthResponse>({
    queryKey: ['service-health', apiKey, service],
    queryFn: () => {
      if (!apiKey) throw new Error('API key required');
      return fetchWithAuth<ServiceHealthResponse>(`/services/${service}`, apiKey);
    },
    enabled: !!apiKey && !!service,
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useServiceMetrics(apiKey: string | null, service: string, limit: number = 100) {
  return useQuery<MetricsResponse>({
    queryKey: ['service-metrics', apiKey, service, limit],
    queryFn: () => {
      if (!apiKey) throw new Error('API key required');
      return fetchWithAuth<MetricsResponse>(`/services/${service}/metrics?limit=${limit}`, apiKey);
    },
    enabled: !!apiKey && !!service,
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useSearchLogs(
  apiKey: string | null,
  options: {
    query?: string;
    level?: string;
    service?: string;
    start?: string;
    end?: string;
    limit?: number;
  }
) {
  const params = new URLSearchParams();
  if (options.query) params.append('q', options.query);
  if (options.level) params.append('level', options.level);
  if (options.service) params.append('service', options.service);
  if (options.start) params.append('start', options.start);
  if (options.end) params.append('end', options.end);
  params.append('limit', String(options.limit || 100));

  return useQuery<SearchLogsResponse>({
    queryKey: ['search-logs', apiKey, options],
    queryFn: () => {
      if (!apiKey) throw new Error('API key required');
      return fetchWithAuth<SearchLogsResponse>(`/search/logs?${params.toString()}`, apiKey);
    },
    enabled: !!apiKey,
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useTrace(apiKey: string | null, traceId: string) {
  return useQuery<TraceResponse>({
    queryKey: ['trace', apiKey, traceId],
    queryFn: () => {
      if (!apiKey) throw new Error('API key required');
      return fetchWithAuth<TraceResponse>(`/traces/${traceId}`, apiKey);
    },
    enabled: !!apiKey && !!traceId,
    staleTime: 5000,
  });
}

export function useTraces(
  apiKey: string | null,
  service?: string,
  limit: number = 100,
  filters?: {
    hasErrors?: boolean;
    minDuration?: number;
    maxDuration?: number;
    start?: string;
    end?: string;
    spanName?: string;
    spanAttributes?: Record<string, any>;
  }
) {
  return useQuery<TracesResponse>({
    queryKey: ['traces', apiKey, service, limit, filters],
    queryFn: () => {
      if (!apiKey) throw new Error('API key required');
      const params = new URLSearchParams();
      if (service) params.append('service', service);
      params.append('limit', String(limit));
      if (filters?.hasErrors !== undefined) params.append('hasErrors', String(filters.hasErrors));
      if (filters?.minDuration !== undefined) params.append('minDuration', String(filters.minDuration));
      if (filters?.maxDuration !== undefined) params.append('maxDuration', String(filters.maxDuration));
      if (filters?.start) params.append('start', filters.start);
      if (filters?.end) params.append('end', filters.end);
      if (filters?.spanName) params.append('spanName', filters.spanName);
      if (filters?.spanAttributes) params.append('spanAttributes', JSON.stringify(filters.spanAttributes));
      return fetchWithAuth<TracesResponse>(`/traces?${params.toString()}`, apiKey);
    },
    enabled: !!apiKey,
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useServiceMap(apiKey: string | null, hours: number = 24) {
  return useQuery<ServiceMapResponse>({
    queryKey: ['service-map', apiKey, hours],
    queryFn: () => {
      if (!apiKey) throw new Error('API key required');
      return fetchWithAuth<ServiceMapResponse>(`/service-map?hours=${hours}`, apiKey);
    },
    enabled: !!apiKey,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}

