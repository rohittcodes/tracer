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

interface ServiceComparisonChartProps {
  metrics: Metric[];
  metricType: string;
  services?: string[];
}

export function ServiceComparisonChart({ metrics, metricType, services }: ServiceComparisonChartProps) {
  const filteredMetrics = metrics.filter(
    (m) => m.metricType === metricType && (!services || services.includes(m.service))
  );

  // Group by time window and service
  const timeMap = new Map<string, Map<string, number>>();
  
  filteredMetrics.forEach((metric) => {
    const date = new Date(metric.windowStart);
    const timeKey = isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleTimeString();
    if (!timeMap.has(timeKey)) {
      timeMap.set(timeKey, new Map());
    }
    const serviceMap = timeMap.get(timeKey);
    if (serviceMap) {
      serviceMap.set(metric.service, metric.value);
    }
  });

  // Get all unique services
  const allServices = Array.from(new Set(filteredMetrics.map(m => m.service)));
  const servicesToShow = services || allServices;

  // Convert to chart data format
  const chartData = Array.from(timeMap.entries())
    .map(([time, serviceMap]) => {
      const dataPoint: Record<string, string | number> = { time };
      servicesToShow.forEach(service => {
        dataPoint[service] = serviceMap.get(service) || 0;
      });
      return dataPoint;
    })
    .sort((a, b) => (a.time as string).localeCompare(b.time as string));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available
      </div>
    );
  }

  const colors = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis />
        <Tooltip />
        {servicesToShow.map((service, index) => (
          <Line
            key={service}
            type="monotone"
            dataKey={service}
            name={service}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

