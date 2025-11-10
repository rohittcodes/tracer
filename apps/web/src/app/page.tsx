'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricsChart } from '@/components/charts/metrics-chart';
import { ErrorRateChart } from '@/components/charts/error-rate-chart';
import { LatencyChart } from '@/components/charts/latency-chart';
import { Activity, AlertTriangle, TrendingUp, Clock, RefreshCw } from 'lucide-react';
import { useLogs, useMetrics, useAlerts } from '@/hooks/use-tracer-data';
import { Navbar } from '@/components/navbar';
import { useRouter } from 'next/navigation';

interface Log {
  id: number;
  timestamp: string;
  level: string;
  message: string;
  service: string;
  metadata?: any;
}

interface Metric {
  id: number;
  service: string;
  metricType: string;
  value: number;
  windowStart: string;
  windowEnd: string;
}

interface Alert {
  id: number;
  alertType: string;
  severity: string;
  message: string;
  service: string;
  resolved: boolean;
  createdAt: string;
}

interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  errorRate: number;
  lastLogTime: Date | null;
  activeAlerts: number;
}

export default function Home() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [serviceHealth, setServiceHealth] = useState<Map<string, ServiceHealth>>(new Map());
  const queryClient = useQueryClient();

  useEffect(() => {
    const storedToken = localStorage.getItem('tracer_token');
    if (!storedToken) {
      router.push('/login');
      return;
    }
    setToken(storedToken);
    
    // Try to get API key from selected project
    const storedProjectId = localStorage.getItem('tracer_selected_project_id');
    const storedApiKey = localStorage.getItem('tracer_api_key');
    if (storedProjectId && storedApiKey) {
      setSelectedProjectId(parseInt(storedProjectId, 10));
      setApiKey(storedApiKey);
      setIsAuthenticated(true);
    } else {
      // Redirect to projects if no project selected
      router.push('/projects');
    }
  }, [router]);

  const {
    data: logsData,
    isLoading: logsLoading,
    error: logsError,
    refetch: refetchLogs,
  } = useLogs(apiKey, 100);

  const {
    data: metricsData,
    isLoading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = useMetrics(apiKey, 200);

  const {
    data: alertsData,
    isLoading: alertsLoading,
    error: alertsError,
    refetch: refetchAlerts,
  } = useAlerts(apiKey, true, 50);

  // Memoize arrays to prevent infinite re-renders
  const logs = useMemo(() => logsData?.logs || [], [logsData]);
  const metrics = useMemo(() => metricsData?.metrics || [], [metricsData]);
  const alerts = useMemo(() => alertsData?.alerts || [], [alertsData]);
  const loading = logsLoading || metricsLoading || alertsLoading;
  const error = logsError || metricsError || alertsError;
  const refreshing = logsLoading || metricsLoading || alertsLoading;

  // Track previous data to prevent unnecessary recalculations
  const prevDataRef = useRef<{ logs: Log[]; metrics: Metric[]; alerts: Alert[] }>({
    logs: [],
    metrics: [],
    alerts: [],
  });

  useEffect(() => {
    const storedKey = localStorage.getItem('tracer_api_key');
    if (storedKey) {
      setApiKey(storedKey);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (logsError && logsError.message === 'Invalid API key') {
      setIsAuthenticated(false);
      localStorage.removeItem('tracer_api_key');
    }
  }, [logsError, metricsError, alertsError]);

  const calculateServiceHealth = useCallback((metrics: Metric[], alerts: Alert[], logs: Log[]) => {
    const health = new Map<string, ServiceHealth>();
    const now = new Date();

    const services = new Set<string>();
    metrics.forEach(m => services.add(m.service));
    alerts.forEach(a => services.add(a.service));
    logs.forEach(l => services.add(l.service));

    services.forEach(service => {
      const serviceMetrics = metrics.filter(m => m.service === service);
      const serviceAlerts = alerts.filter(a => a.service === service);
      const serviceLogs = logs.filter(l => l.service === service);

      let errorRate = 0;
      const metricErrorCount = serviceMetrics.find(m => m.metricType === 'error_count')?.value || 0;
      const metricLogCount = serviceMetrics.find(m => m.metricType === 'log_count')?.value || 0;
      
      if (metricLogCount > 0) {
        errorRate = (metricErrorCount / metricLogCount) * 100;
      } else if (serviceLogs.length > 0) {
        const errorLogs = serviceLogs.filter(log => log.level === 'error' || log.level === 'fatal');
        errorRate = (errorLogs.length / serviceLogs.length) * 100;
      }

      const lastLog = serviceLogs.length > 0 
        ? new Date(serviceLogs[0].timestamp) 
        : null;
      const minutesSinceLastLog = lastLog 
        ? (now.getTime() - lastLog.getTime()) / (1000 * 60) 
        : Infinity;

      let status: 'healthy' | 'degraded' | 'down' = 'healthy';
      if (minutesSinceLastLog > 5) {
        status = 'down';
      } else if (errorRate > 10 || serviceAlerts.length > 0) {
        status = 'degraded';
      }

      health.set(service, {
        service,
        status,
        errorRate,
        lastLogTime: lastLog,
        activeAlerts: serviceAlerts.length,
      });
    });

    setServiceHealth(health);
  }, []);

  useEffect(() => {
    // Only recalculate if data has actually changed
    const prev = prevDataRef.current;
    const logsChanged = prev.logs.length !== logs.length || 
      (logs.length > 0 && JSON.stringify(prev.logs) !== JSON.stringify(logs));
    const metricsChanged = prev.metrics.length !== metrics.length || 
      (metrics.length > 0 && JSON.stringify(prev.metrics) !== JSON.stringify(metrics));
    const alertsChanged = prev.alerts.length !== alerts.length || 
      (alerts.length > 0 && JSON.stringify(prev.alerts) !== JSON.stringify(alerts));

    if (logsChanged || metricsChanged || alertsChanged) {
      calculateServiceHealth(metrics, alerts, logs);
      prevDataRef.current = { logs, metrics, alerts };
    }
  }, [logs, metrics, alerts, calculateServiceHealth]);


  function handleRefresh() {
    refetchLogs();
    refetchMetrics();
    refetchAlerts();
  }

  const getStatusVariant = (status: string): "success" | "warning" | "error" => {
    switch (status) {
      case 'down':
        return 'error';
      case 'degraded':
        return 'warning';
      default:
        return 'success';
    }
  };

  const getSeverityVariant = (severity: string): "error" | "warning" | "default" => {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getLevelVariant = (level: string): "error" | "warning" | "default" => {
    switch (level) {
      case 'error':
      case 'fatal':
        return 'error';
      case 'warn':
        return 'warning';
      default:
        return 'default';
    }
  };


  if (loading) {
    return (
      <>
        <Navbar token={token} apiKey={apiKey} />
        <div className="min-h-screen bg-background p-8">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-4">Tracer Dashboard</h1>
            <p>Loading...</p>
          </div>
        </div>
      </>
    );
  }

  const services = Array.from(serviceHealth.values());
  const totalLogs = logs.length;
  const totalMetrics = metrics.length;
  const totalAlerts = alerts.length;

  return (
    <>
      <Navbar token={token} apiKey={apiKey} />
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold">Tracer Dashboard</h1>
              <p className="text-muted-foreground mt-1">Real-time observability for your services</p>
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="text-destructive">
                {error instanceof Error ? error.message : String(error)}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Services</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{services.length}</div>
              <p className="text-xs text-muted-foreground">
                {services.filter(s => s.status === 'healthy').length} healthy
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLogs}</div>
              <p className="text-xs text-muted-foreground">Last 100 logs</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAlerts}</div>
              <p className="text-xs text-muted-foreground">
                {alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length} critical
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Metrics</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMetrics}</div>
              <p className="text-xs text-muted-foreground">Last 200 metrics</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((health) => (
            <Card key={health.service} className="border-l-4 border-l-primary">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{health.service}</CardTitle>
                  <Badge variant={getStatusVariant(health.status)}>
                    {health.status && typeof health.status === 'string' ? health.status.toUpperCase() : 'UNKNOWN'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Error Rate</span>
                    <span className="font-semibold">{health.errorRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Active Alerts</span>
                    <Badge variant={health.activeAlerts > 0 ? 'error' : 'default'}>
                      {health.activeAlerts}
                    </Badge>
                  </div>
                  {health.lastLogTime && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Last Log</span>
                      <span className="font-semibold">
                        {health.lastLogTime 
                          ? `${Math.floor((Date.now() - health.lastLogTime.getTime()) / (1000 * 60))}m ago`
                          : 'Never'}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {metrics.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Error Rate Over Time</CardTitle>
                <CardDescription>Percentage of error logs by time window</CardDescription>
              </CardHeader>
              <CardContent>
                <ErrorRateChart metrics={metrics} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Latency (P95)</CardTitle>
                <CardDescription>95th percentile latency in milliseconds</CardDescription>
              </CardHeader>
              <CardContent>
                <LatencyChart metrics={metrics} />
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Log Count Over Time</CardTitle>
              <CardDescription>Total logs per time window</CardDescription>
            </CardHeader>
            <CardContent>
              <MetricsChart metrics={metrics} metricType="log_count" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Error Count Over Time</CardTitle>
              <CardDescription>Error logs per time window</CardDescription>
            </CardHeader>
            <CardContent>
              <MetricsChart metrics={metrics} metricType="error_count" />
            </CardContent>
          </Card>
        </div>

        {alerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Active Alerts</CardTitle>
              <CardDescription>{alerts.length} active alerts requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="border-l-4 border-l-destructive p-4 bg-muted/50 rounded-md"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={getSeverityVariant(alert.severity)}>
                            {alert.severity && typeof alert.severity === 'string' ? alert.severity.toUpperCase() : 'UNKNOWN'}
                          </Badge>
                          <Badge variant="outline">{alert.alertType}</Badge>
                        </div>
                        <p className="font-medium">{alert.message}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {alert.service} • {(() => {
                            const date = new Date(alert.createdAt);
                            return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent Logs</CardTitle>
            <CardDescription>Latest {logs.length} log entries</CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="mb-2">No logs available</p>
                <p className="text-sm">
                  Make sure logs are being sent to the API and the processor is running.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 border rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <Badge variant={getLevelVariant(log.level)} className="shrink-0">
                      {log.level && typeof log.level === 'string' ? log.level.toUpperCase() : 'UNKNOWN'}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{log.service}</span>
                        <span className="text-xs text-muted-foreground">
                          {(() => {
                            const date = new Date(log.timestamp);
                            return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
                          })()}
                        </span>
                      </div>
                      <p className="text-sm">{log.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
}
