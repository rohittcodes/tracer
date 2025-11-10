'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, AlertTriangle, TrendingUp, ArrowRight } from 'lucide-react';
import { useServices, useServiceHealth } from '@/hooks/use-tracer-data';
import { Navbar } from '@/components/navbar';

export default function ServicesPage() {
  const router = useRouter();
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

  const { data: servicesData, isLoading } = useServices(apiKey);
  const services = servicesData?.services || [];

  if (!apiKey) {
    return null;
  }

  return (
    <>
      <Navbar token={token} apiKey={apiKey} />
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-4xl font-bold">Services</h1>
            <p className="text-muted-foreground mt-1">Overview of all monitored services</p>
          </div>

        {isLoading ? (
          <div className="text-center py-12">Loading services...</div>
        ) : services.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">No services found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service} service={service} apiKey={apiKey} />
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

function ServiceCard({ service, apiKey }: { service: string; apiKey: string }) {
  const router = useRouter();
  const { data: health, isLoading } = useServiceHealth(apiKey, service);

  const statusColor = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    down: 'bg-red-500',
  };

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push(`/services/${service}`)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">{service}</CardTitle>
          {isLoading ? (
            <div className="h-3 w-3 rounded-full bg-gray-400 animate-pulse" />
          ) : (
            <div className={`h-3 w-3 rounded-full ${statusColor[health?.status || 'down']}`} />
          )}
        </div>
        <CardDescription>
          {isLoading ? 'Loading...' : (health?.status && typeof health.status === 'string' ? health.status.toUpperCase() : 'UNKNOWN')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
          </div>
        ) : health ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Error Rate</span>
              <span className="font-medium">{health.errorRate}%</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active Alerts</span>
              <Badge variant={health.activeAlerts > 0 ? 'destructive' : 'default'}>
                {health.activeAlerts}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Logs</span>
              <span className="font-medium">{health.totalLogs}</span>
            </div>
            <Button variant="outline" className="w-full mt-4" onClick={(e) => {
              e.stopPropagation();
              router.push(`/services/${service}`);
            }}>
              View Details <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No data available</p>
        )}
      </CardContent>
    </Card>
  );
}

