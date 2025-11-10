'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { useAlerts, useServices } from '@/hooks/use-tracer-data';
import { Navbar } from '@/components/navbar';

export default function AlertsPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState<string>('');
  const [showResolved, setShowResolved] = useState(false);

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

  const { data: alertsData, isLoading, refetch } = useAlerts(apiKey, !showResolved, 100);
  const alerts = alertsData?.alerts || [];

  if (!apiKey) {
    return null;
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-600';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
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

  const activeAlerts = alerts.filter(a => !a.resolved);
  const resolvedAlerts = alerts.filter(a => a.resolved);

  return (
    <>
      <Navbar token={token} apiKey={apiKey} />
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold">Alerts</h1>
              <p className="text-muted-foreground mt-1">Monitor and manage system alerts</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={showResolved ? 'default' : 'outline'}
                onClick={() => setShowResolved(!showResolved)}
              >
                {showResolved ? 'Hide Resolved' : 'Show Resolved'}
              </Button>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeAlerts.length}</div>
              <p className="text-xs text-muted-foreground">Requiring attention</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                {activeAlerts.filter(a => a.severity === 'critical').length}
              </div>
              <p className="text-xs text-muted-foreground">Critical alerts</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resolved</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{resolvedAlerts.length}</div>
              <p className="text-xs text-muted-foreground">Resolved alerts</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Alerts ({alerts.length})</CardTitle>
            <CardDescription>
              {showResolved ? 'All alerts including resolved' : 'Active alerts only'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">Loading alerts...</div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {showResolved ? 'No alerts found' : 'No active alerts'}
              </div>
            ) : (
              <div className="space-y-4">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`h-3 w-3 rounded-full ${getSeverityColor(alert.severity)}`} />
                          <Badge variant={getSeverityVariant(alert.severity)}>
                            {alert.severity && typeof alert.severity === 'string' ? alert.severity.toUpperCase() : 'UNKNOWN'}
                          </Badge>
                          <Badge variant={alert.resolved ? 'default' : 'destructive'}>
                            {alert.alertType}
                          </Badge>
                          <span className="text-sm font-medium">{alert.service}</span>
                          {alert.resolved && (
                            <Badge variant="outline" className="bg-green-100">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Resolved
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm mb-2">{alert.message}</p>
                        <span className="text-xs text-muted-foreground">
                          {(() => {
                            const date = new Date(alert.createdAt);
                            return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
                          })()}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/services/${alert.service}`)}
                      >
                        View Service <ArrowRight className="ml-2 h-3 w-3" />
                      </Button>
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

