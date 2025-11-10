'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTrace } from '@/hooks/use-tracer-data';
import { Navbar } from '@/components/navbar';
import { TraceFlameGraph } from '@/components/trace-flame-graph';

export default function TraceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const traceId = params.traceId as string;
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

  const { data, isLoading, error } = useTrace(apiKey, traceId);

  if (!apiKey) {
    return null;
  }

  if (isLoading) {
    return (
      <>
        <Navbar token={token} apiKey={apiKey} />
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12">Loading trace...</div>
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
              Error loading trace: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          </div>
        </div>
      </>
    );
  }

  const { trace, logs } = data;

  // Build span tree
  if (!trace.spans || trace.spans.length === 0) {
    return (
      <>
        <Navbar token={token} apiKey={apiKey} />
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12 text-yellow-600">
              This trace has no spans.
            </div>
          </div>
        </div>
      </>
    );
  }
  
  const spanMap = new Map(trace.spans.map(s => [s.spanId, s]));
  const rootSpan = trace.spans.find(s => !s.parentSpanId) || (trace.spans.length > 0 ? trace.spans[0] : null);
  if (!rootSpan) {
    return (
      <>
        <Navbar token={token} apiKey={apiKey} />
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12 text-yellow-600">
              This trace has no valid spans.
            </div>
          </div>
        </div>
      </>
    );
  }
  
  const traceStartTime = new Date(trace.startTime);
  if (isNaN(traceStartTime.getTime())) {
    return (
      <>
        <Navbar token={token} apiKey={apiKey} />
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12 text-red-600">
              Invalid trace start time.
            </div>
          </div>
        </div>
      </>
    );
  }
  
  const minTime = trace.spans.reduce((min, s) => {
    const startTime = new Date(s.startTime);
    if (isNaN(startTime.getTime())) return min;
    const start = startTime.getTime();
    return start < min ? start : min;
  }, traceStartTime.getTime());
  const maxTime = trace.spans.reduce((max, s) => {
    const endTime = s.endTime ? new Date(s.endTime) : new Date(s.startTime);
    if (isNaN(endTime.getTime())) return max;
    const end = endTime.getTime();
    return end > max ? end : max;
  }, traceStartTime.getTime());
  const totalDuration = Math.max(maxTime - minTime, 0.1); // Ensure minimum duration

  const buildSpanTree = (parentId?: string): typeof trace.spans => {
    return trace.spans
      .filter(s => (parentId ? s.parentSpanId === parentId : !s.parentSpanId))
      .sort((a, b) => {
        const aTime = new Date(a.startTime).getTime();
        const bTime = new Date(b.startTime).getTime();
        if (isNaN(aTime) || isNaN(bTime)) return 0;
        return aTime - bTime;
      });
  };

  const getSpanPosition = (span: typeof trace.spans[0]) => {
    const startTime = new Date(span.startTime);
    const endTime = span.endTime ? new Date(span.endTime) : startTime;
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return { left: '0%', width: '0.5%' };
    }
    const start = startTime.getTime();
    const end = endTime.getTime();
    const left = totalDuration > 0 ? ((start - minTime) / totalDuration) * 100 : 0;
    const width = totalDuration > 0 ? ((end - start) / totalDuration) * 100 : 0.5;
    return { left: `${Math.max(0, left)}%`, width: `${Math.max(width, 0.5)}%` };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'error': return 'bg-red-500';
      case 'ok': return 'bg-green-500';
      default: return 'bg-gray-400';
    }
  };

  const renderSpan = (span: typeof trace.spans[0], depth: number = 0) => {
    const children = buildSpanTree(span.spanId);
    const position = getSpanPosition(span);
    const duration = span.duration || 0;

    return (
      <div key={span.spanId} className="mb-1">
        <div
          className="flex items-center h-8 hover:bg-gray-100 rounded"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <div className="flex-1 relative h-6 bg-gray-200 rounded overflow-hidden">
            <div
              className={`absolute h-full ${getStatusColor(span.status)} rounded`}
              style={{ left: position.left, width: position.width }}
              title={`${span.name} (${typeof duration === 'number' && !isNaN(duration) ? duration.toFixed(2) : '0.00'}ms)`}
            >
              <div className="absolute inset-0 flex items-center px-2 text-xs text-white font-medium truncate">
                {span.name}
              </div>
            </div>
          </div>
          <div className="ml-4 text-xs text-gray-600 w-24 text-right">
            {typeof duration === 'number' && !isNaN(duration) ? duration.toFixed(2) : '0.00'}ms
          </div>
          <div className="ml-4 text-xs text-gray-500 w-32">
            {span.service}
          </div>
          <div className="ml-4 text-xs text-gray-400 w-20">
            {span.kind}
          </div>
        </div>
        {children.map(child => renderSpan(child, depth + 1))}
      </div>
    );
  };

  return (
    <>
      <Navbar token={token} />
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <button
              onClick={() => router.back()}
              className="text-blue-600 hover:text-blue-800 mb-4"
            >
              ← Back
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Trace: {traceId}</h1>
            <div className="mt-2 text-sm text-gray-600">
              Service: {trace.service} • {trace.spanCount} spans • {trace.errorCount} errors
              {trace.duration && ` • ${trace.duration.toFixed(2)}ms total`}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Flame Graph</h2>
            <TraceFlameGraph
              spans={trace.spans}
              traceStartTime={trace.startTime}
              traceDuration={totalDuration}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Spans ({trace.spans.length})</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {trace.spans.map(span => (
                  <div
                    key={span.spanId}
                    className="border rounded p-3 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{span.name}</span>
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(span.status)} text-white`}>
                        {span.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Service: {span.service}</div>
                      <div>Kind: {span.kind}</div>
                      {span.duration && typeof span.duration === 'number' && <div>Duration: {span.duration.toFixed(2)}ms</div>}
                      {span.parentSpanId && typeof span.parentSpanId === 'string' && span.parentSpanId.length > 0 && <div>Parent: {span.parentSpanId.substring(0, 8)}...</div>}
                    </div>
                    {span.attributes && Object.keys(span.attributes).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-sm text-gray-500 cursor-pointer">Attributes</summary>
                        <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                          {JSON.stringify(span.attributes, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Logs ({logs.length})</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">No logs for this trace</div>
                ) : (
                  logs.map(log => (
                    <div
                      key={log.id}
                      className="border rounded p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs px-2 py-1 rounded ${
                          log.level === 'error' || log.level === 'fatal' ? 'bg-red-100 text-red-800' :
                          log.level === 'warn' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {log.level}
                        </span>
                        <span className="text-xs text-gray-500">
                          {(() => {
                            const date = new Date(log.timestamp);
                            return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleTimeString();
                          })()}
                        </span>
                      </div>
                      <div className="text-sm">{log.message}</div>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer">Metadata</summary>
                          <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

