'use client';

import { useState, useMemo } from 'react';
import { Span } from '@/lib/api-client';

interface TraceFlameGraphProps {
  spans: Span[];
  traceStartTime: string;
  traceDuration: number;
}

interface SpanNode extends Span {
  children: SpanNode[];
  depth: number;
  startOffset: number; // Offset from trace start in ms
  width: number; // Duration in ms
}

export function TraceFlameGraph({ spans, traceStartTime, traceDuration }: TraceFlameGraphProps) {
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);
  const [hoveredSpan, setHoveredSpan] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);

  // Build span tree and calculate positions
  const spanTree = useMemo(() => {
    const spanMap = new Map<string, SpanNode>();
    const rootSpans: SpanNode[] = [];
    const traceStart = new Date(traceStartTime).getTime();

    // Create nodes
    spans.forEach(span => {
      const startTime = new Date(span.startTime);
      const endTime = span.endTime ? new Date(span.endTime) : null;
      
      if (isNaN(startTime.getTime())) {
        console.warn('Invalid startTime for span:', span.spanId, span.startTime);
        return;
      }
      
      const start = startTime.getTime();
      const end = endTime && !isNaN(endTime.getTime()) ? endTime.getTime() : start;
      const duration = span.duration || Math.max(end - start, 0.1); // Ensure minimum width

      spanMap.set(span.spanId, {
        ...span,
        children: [],
        depth: 0,
        startOffset: Math.max(0, start - traceStart), // Ensure non-negative
        width: Math.max(duration, 0.1), // Ensure minimum width
      });
    });

    // Build tree
    spanMap.forEach(span => {
      if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
        const parent = spanMap.get(span.parentSpanId);
        if (parent) {
          parent.children.push(span);
          span.depth = parent.depth + 1;
        } else {
          rootSpans.push(span);
        }
      } else {
        rootSpans.push(span);
      }
    });

    // Sort children by start time
    const sortChildren = (node: SpanNode) => {
      node.children.sort((a, b) => a.startOffset - b.startOffset);
      node.children.forEach(sortChildren);
    };
    rootSpans.forEach(sortChildren);

    return rootSpans;
  }, [spans, traceStartTime]);

  const maxDepth = useMemo(() => {
    const getMaxDepth = (nodes: SpanNode[]): number => {
      if (nodes.length === 0) return 0;
      return Math.max(...nodes.map(n => Math.max(n.depth, getMaxDepth(n.children))));
    };
    return getMaxDepth(spanTree);
  }, [spanTree]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'error': return '#ef4444';
      case 'ok': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getServiceColor = (service: string) => {
    const colors = [
      '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6',
      '#6366f1', '#a855f7', '#f97316', '#06b6d4', '#84cc16'
    ];
    let hash = 0;
    for (let i = 0; i < service.length; i++) {
      hash = service.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const renderSpan = (span: SpanNode, y: number): JSX.Element => {
    const isHovered = hoveredSpan === span.spanId;
    const isSelected = selectedSpan?.spanId === span.spanId;
    const leftPercent = (span.startOffset / traceDuration) * 100;
    const widthPercent = (span.width / traceDuration) * 100;
    const height = 24;
    const color = span.status === 'error' 
      ? getStatusColor(span.status)
      : getServiceColor(span.service);

    return (
      <g key={span.spanId}>
        <rect
          x={`${leftPercent}%`}
          y={y}
          width={`${widthPercent}%`}
          height={height}
          fill={isSelected ? color : isHovered ? `${color}dd` : color}
          stroke={isSelected ? '#000' : 'none'}
          strokeWidth={isSelected ? 2 : 0}
          rx={2}
          onMouseEnter={() => setHoveredSpan(span.spanId)}
          onMouseLeave={() => setHoveredSpan(null)}
          onClick={() => setSelectedSpan(span)}
          style={{ cursor: 'pointer' }}
        />
        {widthPercent > 5 && (
          <text
            x={`${leftPercent + widthPercent / 2}%`}
            y={y + height / 2}
            dy="0.35em"
            fill="white"
            fontSize="11"
            fontWeight="500"
            textAnchor="middle"
            pointerEvents="none"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
          >
            {span.name && typeof span.name === 'string' && span.name.length > 20 ? `${span.name.substring(0, 17)}...` : (span.name || 'Unnamed')}
          </text>
        )}
        {span.children.map((child, idx) => {
          const childY = y + height + 2;
          return renderSpan(child, childY);
        })}
      </g>
    );
  };

  const totalHeight = Math.max((maxDepth + 1) * 26 + 60, 100); // 26px per level (24px height + 2px gap) + 60px for timeline, min 100px

  return (
    <div className="w-full">
      {/* Timeline */}
      <div className="mb-4 bg-gray-100 rounded p-2">
        <div className="flex justify-between text-xs text-gray-600 mb-2">
          <span>0ms</span>
          <span>{traceDuration.toFixed(2)}ms</span>
        </div>
        <div className="relative h-2 bg-gray-300 rounded overflow-hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="absolute h-full border-l border-gray-400"
              style={{ left: `${(i / 10) * 100}%` }}
            />
          ))}
        </div>
      </div>

      {/* Flame Graph */}
      <div className="relative border rounded-lg overflow-auto bg-white" style={{ height: `${Math.min(totalHeight, 600)}px` }}>
        <svg
          width="100%"
          height={totalHeight}
          style={{ minWidth: '100%' }}
        >
          {spanTree.map((span, idx) => renderSpan(span, 10 + idx * 26))}
        </svg>
      </div>

      {/* Span Details */}
      {selectedSpan && (
        <div className="mt-4 bg-white border rounded-lg p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">{selectedSpan.name}</h3>
            <button
              onClick={() => setSelectedSpan(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Service:</span>
              <span className="ml-2 font-medium">{selectedSpan.service}</span>
            </div>
            <div>
              <span className="text-gray-600">Kind:</span>
              <span className="ml-2 font-medium">{selectedSpan.kind}</span>
            </div>
            <div>
              <span className="text-gray-600">Status:</span>
              <span className={`ml-2 px-2 py-1 rounded text-xs ${
                selectedSpan.status === 'error' ? 'bg-red-100 text-red-800' :
                selectedSpan.status === 'ok' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {selectedSpan.status}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Duration:</span>
              <span className="ml-2 font-medium">{selectedSpan.duration?.toFixed(2)}ms</span>
            </div>
            <div>
              <span className="text-gray-600">Start:</span>
              <span className="ml-2 font-medium">
                {(() => {
                  const date = new Date(selectedSpan.startTime);
                  return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleTimeString();
                })()}
              </span>
            </div>
            {selectedSpan.endTime && (
              <div>
                <span className="text-gray-600">End:</span>
                <span className="ml-2 font-medium">
                  {(() => {
                    const date = new Date(selectedSpan.endTime);
                    return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleTimeString();
                  })()}
                </span>
              </div>
            )}
          </div>
          {selectedSpan.attributes && Object.keys(selectedSpan.attributes).length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold mb-2">Attributes</h4>
              <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">
                {JSON.stringify(selectedSpan.attributes, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: getStatusColor('error') }} />
          <span>Error</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: getStatusColor('ok') }} />
          <span>Success</span>
        </div>
        <div className="text-gray-600">
          Colors represent services (errors shown in red)
        </div>
      </div>
    </div>
  );
}

