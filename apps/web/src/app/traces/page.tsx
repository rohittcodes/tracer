'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTraces } from '@/hooks/use-tracer-data';
import { Navbar } from '@/components/navbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function TracesPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState<string>('');
  const [token, setToken] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    hasErrors?: boolean;
    minDuration?: number;
    maxDuration?: number;
    spanName?: string;
    spanAttributeKey?: string;
    spanAttributeValue?: string;
  }>({});

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

  const { data, isLoading, error } = useTraces(apiKey, undefined, 100, {
    ...filters,
    spanAttributes: filters.spanAttributeKey && filters.spanAttributeValue
      ? { [filters.spanAttributeKey]: filters.spanAttributeValue }
      : undefined,
  });

  if (!apiKey) {
    return null;
  }

  if (isLoading) {
    return (
      <>
        <Navbar token={token} apiKey={apiKey} />
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12">Loading traces...</div>
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
              Error loading traces: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          </div>
        </div>
      </>
    );
  }

  const traces = data.traces || [];

  return (
    <>
      <Navbar token={token} apiKey={apiKey} />
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Traces</h1>
          </div>

          {/* Search Filters */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="text-lg font-semibold mb-4">Search Filters</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-1">
                  Has Errors
                </Label>
                <Select
                  value={filters.hasErrors === undefined ? '' : String(filters.hasErrors)}
                  onValueChange={(value) => setFilters({
                    ...filters,
                    hasErrors: value === '' ? undefined : value === 'true',
                  })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Duration (ms)
                </Label>
                <input
                  type="number"
                  value={filters.minDuration || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    minDuration: e.target.value ? parseFloat(e.target.value) : undefined,
                  })}
                  placeholder="0"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Duration (ms)
                </Label>
                <input
                  type="number"
                  value={filters.maxDuration || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    maxDuration: e.target.value ? parseFloat(e.target.value) : undefined,
                  })}
                  placeholder="∞"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-1">
                  Span Name
                </Label>
                <input
                  type="text"
                  value={filters.spanName || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    spanName: e.target.value || undefined,
                  })}
                  placeholder="e.g., GET /api/users"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-1">
                  Span Attribute Key
                </Label>
                <input
                  type="text"
                  value={filters.spanAttributeKey || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    spanAttributeKey: e.target.value || undefined,
                  })}
                  placeholder="e.g., http.method"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-1">
                  Span Attribute Value
                </Label>
                <input
                  type="text"
                  value={filters.spanAttributeValue || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    spanAttributeValue: e.target.value || undefined,
                  })}
                  placeholder="e.g., GET"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => setFilters({})}
                  className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {traces.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500">No traces found</p>
              <p className="text-sm text-gray-400 mt-2">
                Traces will appear here when you use the SDK with tracing enabled
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trace ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Service
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Spans
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Errors
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Start Time
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {traces.map((trace) => (
                    <tr
                      key={trace.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/traces/${trace.traceId}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm font-mono text-blue-600">
                          {trace.traceId && typeof trace.traceId === 'string' ? trace.traceId.substring(0, 16) : trace.traceId}...
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {trace.service}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {trace.spanCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {trace.errorCount > 0 ? (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                            {trace.errorCount}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {trace.duration ? `${trace.duration.toFixed(2)}ms` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {(() => {
                          const date = new Date(trace.startTime);
                          return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

