'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useServiceMap } from '@/hooks/use-tracer-data';
import { Navbar } from '@/components/navbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function ServiceMapPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState<string>('');
  const [token, setToken] = useState<string | null>(null);
  const [hours, setHours] = useState<number>(24);

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

  const { data, isLoading, error } = useServiceMap(apiKey, hours);

  if (!apiKey) {
    return null;
  }

  if (isLoading) {
    return (
      <>
        <Navbar token={token} apiKey={apiKey} />
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12">Loading service map...</div>
          </div>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Navbar token={token} apiKey={apiKey} />
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12 text-red-600">
              Error loading service map: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          </div>
        </div>
      </>
    );
  }

  const { services, dependencies } = data;

  // Calculate service health
  const getServiceHealth = (service: typeof services[0]) => {
    const errorRate = service.totalCalls > 0 ? (service.totalErrors / service.totalCalls) * 100 : 0;
    if (errorRate > 10) return 'down';
    if (errorRate > 5 || service.avgLatency > 1000) return 'degraded';
    return 'healthy';
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-yellow-500';
      case 'down': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <>
      <Navbar token={token} />
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Service Map</h1>
            <div className="flex items-center gap-4">
              <Label className="text-sm text-gray-600 flex items-center gap-2">
                Time Window:
                <Select
                  value={String(hours)}
                  onValueChange={(value) => setHours(Number(value))}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Last 1 hour</SelectItem>
                    <SelectItem value="6">Last 6 hours</SelectItem>
                    <SelectItem value="24">Last 24 hours</SelectItem>
                    <SelectItem value="168">Last 7 days</SelectItem>
                  </SelectContent>
                </Select>
              </Label>
            </div>
          </div>

          {services.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500">No service dependencies found</p>
              <p className="text-sm text-gray-400 mt-2">
                Service map will appear here when you have traces with cross-service calls
              </p>
            </div>
          ) : (
            <>
              {/* Service Map Visualization */}
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Service Dependencies</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {services.map((service) => {
                    const health = getServiceHealth(service);
                    const errorRate = service.totalCalls > 0 
                      ? ((service.totalErrors / service.totalCalls) * 100).toFixed(1)
                      : '0';
                    
                    return (
                      <div
                        key={service.name}
                        className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-lg">{service.name}</h3>
                          <div className={`w-3 h-3 rounded-full ${getHealthColor(health)}`} />
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <div>Total Calls: {typeof service.totalCalls === 'number' ? service.totalCalls.toLocaleString() : '0'}</div>
                          <div>Errors: {service.totalErrors} ({errorRate}%)</div>
                          <div>Avg Latency: {typeof service.avgLatency === 'number' && !isNaN(service.avgLatency) ? service.avgLatency.toFixed(2) : '0.00'}ms</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dependency Graph */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Dependency Graph</h2>
                {dependencies.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No dependencies found in the selected time window
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dependencies.map((dep, idx) => {
                      const errorRate = dep.callCount > 0 
                        ? ((dep.errorCount / dep.callCount) * 100).toFixed(1)
                        : '0';
                      const isError = dep.errorCount > 0;
                      
                      return (
                        <div
                          key={`${dep.from}-${dep.to}-${idx}`}
                          className="flex items-center gap-4 p-3 border rounded hover:bg-gray-50"
                        >
                          <div className="font-medium text-blue-600">{dep.from}</div>
                          <div className="flex-1 flex items-center">
                            <div className={`h-0.5 flex-1 ${isError ? 'bg-red-400' : 'bg-gray-300'}`} />
                            <div className="px-2 text-xs text-gray-500">
                              {dep.callCount} calls
                              {dep.errorCount > 0 && (
                                <span className="ml-1 text-red-600">({dep.errorCount} errors)</span>
                              )}
                            </div>
                            <div className={`h-0.5 flex-1 ${isError ? 'bg-red-400' : 'bg-gray-300'}`} />
                          </div>
                          <div className="font-medium text-green-600">{dep.to}</div>
                          <div className="text-xs text-gray-500 w-20 text-right">
                            {typeof dep.avgDuration === 'number' && !isNaN(dep.avgDuration) ? dep.avgDuration.toFixed(0) : '0'}ms avg
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

