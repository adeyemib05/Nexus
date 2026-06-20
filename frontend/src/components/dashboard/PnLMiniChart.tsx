import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface PnLMiniChartProps {
  data: Array<{ timestamp: number; value: number }>;
  height?: number;
}

export default function PnLMiniChart({ data, height = 120 }: PnLMiniChartProps) {
  if (data.length < 2) {
    return (
      <div className="h-full flex items-center justify-center text-nexus-textMuted text-xs" style={{ height }}>
        Accumulating data...
      </div>
    );
  }

  const isPositive = data[data.length - 1].value >= data[0].value;
  const color = isPositive ? '#10B981' : '#EF4444';

  return (
    // Recharts needs an explicit pixel height on this wrapper, not just on ResponsiveContainer
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill="url(#pnlGrad)"
            dot={false}
            isAnimationActive
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
