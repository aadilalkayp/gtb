import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@gtb/shared";

export interface WeightPoint {
  date: Date | string;
  weightKg: number;
}

/**
 * Weight trend chart (portal + staff fitness pages). Same recharts styling as
 * the scan progress chart; the dashed reference line is the target weight.
 */
export function WeightChart({
  points,
  targetKg,
  height = 192,
}: {
  points: WeightPoint[];
  targetKg?: number | null;
  height?: number;
}) {
  const data = points.map((p) => ({ label: formatDate(p.date), weight: p.weightKg }));
  const values = points.map((p) => p.weightKg).concat(targetKg ? [targetKg] : []);
  const min = Math.floor(Math.min(...values) - 2);
  const max = Math.ceil(Math.max(...values) + 2);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gradWeight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            domain={[min, max]}
            tickLine={false}
            axisLine={false}
            width={40}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip
            formatter={(v) => [`${v} kg`, "Weight"]}
            contentStyle={{
              background: "hsl(var(--surface))",
              borderRadius: 10,
              border: "1px solid hsl(var(--border))",
              fontSize: 13,
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}
          />
          {targetKg != null && (
            <ReferenceLine
              y={targetKg}
              stroke="hsl(var(--success))"
              strokeDasharray="4 4"
              label={{
                value: `Target ${targetKg} kg`,
                position: "insideBottomRight",
                fontSize: 11,
                fill: "hsl(var(--muted-foreground))",
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="weight"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            fill="url(#gradWeight)"
            dot={{ r: 3, fill: "hsl(var(--primary))" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
