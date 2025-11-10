'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { LogLevelDistribution } from '@/components/charts/log-level-distribution';
import { Search, Filter, RefreshCw } from 'lucide-react';
import { useSearchLogs, useServices } from '@/hooks/use-tracer-data';
import { Navbar } from '@/components/navbar';

export default function LogsPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState<string>('');
  const [token, setToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>('');

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

  const { data: servicesData } = useServices(apiKey);
  const services = servicesData?.services || [];

  const { data: searchData, isLoading, refetch } = useSearchLogs(apiKey, {
    query: searchQuery || undefined,
    level: selectedLevel || undefined,
    service: selectedService || undefined,
    limit: 200,
  });

  const logs = searchData?.logs || [];

  if (!apiKey) {
    return null;
  }

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

  return (
    <>
      <Navbar token={token} apiKey={apiKey} />
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-4xl font-bold">Logs Explorer</h1>
            <p className="text-muted-foreground mt-1">Search and filter logs across all services</p>
          </div>

        <Card>
          <CardHeader>
            <CardTitle>Search & Filter</CardTitle>
            <CardDescription>Search logs by message, service, or level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Search Query</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Service</Label>
                <Select value={selectedService} onValueChange={setSelectedService}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Services" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Services</SelectItem>
                  {services.map((service) => (
                      <SelectItem key={service} value={service}>
                      {service}
                      </SelectItem>
                  ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Log Level</Label>
                <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Levels</SelectItem>
                    <SelectItem value="debug">Debug</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warn">Warn</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="fatal">Fatal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={() => refetch()} className="w-full">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {logs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Log Level Distribution</CardTitle>
              <CardDescription>Distribution of log levels in current results</CardDescription>
            </CardHeader>
            <CardContent>
              <LogLevelDistribution logs={logs} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Logs ({logs.length})</CardTitle>
            <CardDescription>Recent logs matching your filters</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">Loading logs...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No logs found</div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={getLevelVariant(log.level)}>{log.level && typeof log.level === 'string' ? log.level.toUpperCase() : 'UNKNOWN'}</Badge>
                          <span className="text-sm font-medium">{log.service}</span>
                          <span className="text-xs text-muted-foreground">
                            {(() => {
                              const date = new Date(log.timestamp);
                              return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
                            })()}
                          </span>
                        </div>
                        <p className="text-sm">{log.message}</p>
                        {log.metadata && (
                          <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
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

