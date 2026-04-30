"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface FunnelChartProps {
  data: Array<{ stage: string; count: number }>;
}

export function FunnelChart({ data }: FunnelChartProps) {
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="stage"
            className="text-xs"
            tick={{ fill: "currentColor", opacity: 0.7 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            className="text-xs"
            allowDecimals={false}
            tick={{ fill: "currentColor", opacity: 0.7 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              color: "var(--popover-foreground)",
            }}
          />
          <Bar
            dataKey="count"
            fill="var(--primary)"
            radius={[6, 6, 0, 0]}
            maxBarSize={80}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
