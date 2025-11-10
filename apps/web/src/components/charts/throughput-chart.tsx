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

interface ThroughputChartProps {
  metrics: Metric[];
  service?: string;
}

export function ThroughputChart({ metrics, service }: ThroughputChartProps) {
  // Use request_count or log_count as throughput indicator
  const throughputMetrics = metrics.filter(
    (m) => (m.metricType === 'request_count' || m.metricType === 'log_count') && (!service || m.service === service)
  );

  const chartData = throughputMetrics
    .sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime())
    .map((metric) => {
      const date = new Date(metric.windowStart);
      return {
        time: isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleTimeString(),
        throughput: metric.value,
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

  // Group by time if multiple services
  const services = Array.from(new Set(chartData.map((d) => d.service)));
  const groupedData = services.reduce((acc, svc) => {
    const serviceData = chartData.filter((d) => d.service === svc);
    serviceData.forEach((d) => {
      const existing = acc.find((item) => item.time === d.time);
      if (existing) {
        existing[svc] = d.throughput;
      } else {
        acc.push({ time: d.time, [svc]: d.throughput });
      }
    });
    return acc;
  }, [] as Array<Record<string, string | number>>);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={groupedData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis />
        <Tooltip formatter={(value: number) => `${value.toFixed(0)} req/s`} />
        {services.map((svc, index) => {
          const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
          return (
            <Area
              key={svc}
              type="monotone"
              dataKey={svc}
              name={svc}
              stackId="1"
              stroke={colors[index % colors.length]}
              fill={colors[index % colors.length]}
              fillOpacity={0.6}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

