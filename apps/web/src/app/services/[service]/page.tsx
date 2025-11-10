'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricsChart } from '@/components/charts/metrics-chart';
import { ErrorRateChart } from '@/components/charts/error-rate-chart';
import { LatencyChart } from '@/components/charts/latency-chart';
import { LogLevelDistribution } from '@/components/charts/log-level-distribution';
import { ThroughputChart } from '@/components/charts/throughput-chart';
import { ServiceComparisonChart } from '@/components/charts/service-comparison-chart';
import { ArrowLeft, Activity, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import { useServiceHealth, useServiceMetrics, useLogs } from '@/hooks/use-tracer-data';
import { Navbar } from '@/components/navbar';

export default function ServiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const service = params.service as string;
  const [apiKey, setApiKey] = useState<string>('');

  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('tracer_token');
    const storedKey = localStorage.getItem('tracer_api_key');
    if (!storedToken) {
      router.push('/login');
      return;
    }
    if (!storedKey) {
      router.push('/projects');
      return;
    }
    setToken(storedToken);
    setApiKey(storedKey);
  }, [router]);

  const { data: health, isLoading: healthLoading } = useServiceHealth(apiKey, service);
  const { data: metricsData, isLoading: metricsLoading } = useServiceMetrics(apiKey, service, 200);
  const { data: logsData, isLoading: logsLoading } = useLogs(apiKey, 100);

  const metrics = metricsData?.metrics || [];
  const logs = logsData?.logs.filter(l => l.service === service) || [];

  if (!apiKey) {
    return null;
  }

  const statusColor = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    down: 'bg-red-500',
  };

  return (
    <>
      <Navbar token={token} apiKey={apiKey} />
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.push('/services')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Services
            </Button>
            <div>
              <h1 className="text-4xl font-bold">{service}</h1>
              <p className="text-muted-foreground mt-1">Service details and metrics</p>
            </div>
          </div>

        {healthLoading ? (
          <div className="text-center py-12">Loading service data...</div>
        ) : health ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Status</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${statusColor[health.status] || statusColor.healthy}`} />
                    <div className="text-2xl font-bold">{health.status && typeof health.status === 'string' ? health.status.toUpperCase() : 'UNKNOWN'}</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{health.errorRate}%</div>
                  <p className="text-xs text-muted-foreground">Last 100 logs</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{health.activeAlerts}</div>
                  <p className="text-xs text-muted-foreground">Unresolved alerts</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Latency (P95)</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{health.metrics.latencyP95.toFixed(0)}ms</div>
                  <p className="text-xs text-muted-foreground">95th percentile</p>
                </CardContent>
              </Card>
            </div>

            {metrics.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Error Rate Over Time</CardTitle>
                    <CardDescription>Percentage of error logs by time window</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ErrorRateChart metrics={metrics} service={service} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Latency (P95)</CardTitle>
                    <CardDescription>95th percentile latency in milliseconds</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <LatencyChart metrics={metrics} service={service} />
                  </CardContent>
                </Card>
              </div>
            )}

            {metrics.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Log Count Over Time</CardTitle>
                    <CardDescription>Total logs per time window</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MetricsChart metrics={metrics} metricType="log_count" service={service} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Error Count Over Time</CardTitle>
                    <CardDescription>Error logs per time window</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MetricsChart metrics={metrics} metricType="error_count" service={service} />
                  </CardContent>
                </Card>
              </div>
            )}

            {logs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Log Level Distribution</CardTitle>
                  <CardDescription>Distribution of log levels for this service</CardDescription>
                </CardHeader>
                <CardContent>
                  <LogLevelDistribution logs={logs} />
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Service not found or no data available</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </>
  );
}

