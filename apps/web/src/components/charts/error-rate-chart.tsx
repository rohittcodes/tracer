'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Metric {
  id: number;
  service: string;
  metricType: string;
  value: number;
  windowStart: string;
  windowEnd: string;
}

interface ErrorRateChartProps {
  metrics: Metric[];
  service?: string;
}

export function ErrorRateChart({ metrics, service }: ErrorRateChartProps) {
  const errorCounts = metrics.filter(
    (m) => m.metricType === 'error_count' && (!service || m.service === service)
  );
  const logCounts = metrics.filter(
    (m) => m.metricType === 'log_count' && (!service || m.service === service)
  );

  const serviceMap = new Map<string, { errors: number; logs: number; time: string }>();

  errorCounts.forEach((m) => {
    const key = `${m.service}-${m.windowStart}`;
    if (!serviceMap.has(key)) {
      const date = new Date(m.windowStart);
      serviceMap.set(key, { errors: 0, logs: 0, time: isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleTimeString() });
    }
    const entry = serviceMap.get(key);
    if (entry) {
      entry.errors = m.value;
    }
  });

  logCounts.forEach((m) => {
    const key = `${m.service}-${m.windowStart}`;
    if (!serviceMap.has(key)) {
      const date = new Date(m.windowStart);
      serviceMap.set(key, { errors: 0, logs: 0, time: isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleTimeString() });
    }
    const entry = serviceMap.get(key);
    if (entry) {
      entry.logs = m.value;
    }
  });

  const chartData = Array.from(serviceMap.values())
    .filter((d) => d.logs > 0)
    .map((d) => ({
      time: d.time,
      errorRate: (d.errors / d.logs) * 100,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis />
        <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
        <Area
          type="monotone"
          dataKey="errorRate"
          stroke="#ef4444"
          fill="#ef4444"
          fillOpacity={0.2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}


