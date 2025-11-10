'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Metric {
  id: number;
  service: string;
  metricType: string;
  value: number;
  windowStart: string;
  windowEnd: string;
}

interface LatencyChartProps {
  metrics: Metric[];
  service?: string;
}

export function LatencyChart({ metrics, service }: LatencyChartProps) {
  const latencyMetrics = metrics.filter(
    (m) => m.metricType === 'latency_p95' && (!service || m.service === service)
  );

  const chartData = latencyMetrics
    .sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime())
    .map((metric) => {
      const date = new Date(metric.windowStart);
      return {
        time: isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleTimeString(),
        latency: metric.value,
        service: metric.service,
      };
    });

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available
      </div>
    );
  }

  const services = Array.from(new Set(chartData.map((d) => d.service)));

  const groupedData = services.reduce((acc, svc) => {
    const serviceData = chartData.filter((d) => d.service === svc);
    serviceData.forEach((d) => {
      const existing = acc.find((item) => item.time === d.time);
      if (existing) {
        existing[svc] = d.latency;
      } else {
        acc.push({ time: d.time, [svc]: d.latency });
      }
    });
    return acc;
  }, [] as Array<Record<string, string | number>>);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={groupedData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis />
        <Tooltip formatter={(value: number) => `${value.toFixed(2)}ms`} />
        {services.map((svc) => (
          <Line
            key={svc}
            type="monotone"
            dataKey={svc}
            name={svc}
            stroke={getServiceColor(svc)}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function getServiceColor(service: string): string {
  const colors = [
    '#3b82f6',
    '#ef4444',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
  ];
  if (!service || typeof service !== 'string') {
    return colors[0];
  }
  const index = service.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[Math.abs(index) % colors.length];
}

