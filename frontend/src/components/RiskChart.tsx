import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Dot } from 'recharts';
import type { ScenarioFrame } from '../api/generated';

interface RiskChartProps {
  frames: ScenarioFrame[];
  currentFrame: number;
}

export function RiskChart({ frames, currentFrame }: RiskChartProps) {
  const data = frames.map((f) => ({
    frame: f.frame,
    raw: f.signals.raw_risk,
    smoothed: f.signals.smoothed_risk,
    threshold: f.signals.threshold,
    warning: f.signals.warning,
  }));

  const current = frames[currentFrame];

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg p-4 flex flex-col gap-3" data-testid="risk-chart">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Risk Over Time - Recharts</h3>
        <span className="text-[13px] text-gray-400">
          Frame {currentFrame} / {frames.length - 1} - threshold {current?.signals.threshold.toFixed(2)}
        </span>
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
            {/* chart ticks 10px exempt: explicitly documented micro ticks, not regular operational text */}
            <XAxis
              dataKey="frame"
              stroke="#6b7280"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              label={{ value: 'Frame (chronological)', position: 'insideBottom', offset: -5, fill: '#6b7280', fontSize: 10 }}
            />
            {/* chart ticks 10px exempt: Y axis ticks, not regular text */}
            <YAxis
              domain={[0, 1]}
              stroke="#6b7280"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              label={{ value: 'Risk', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 10 }}
            />
            {/* chart tooltip 12px exempt: Recharts tooltip, documented micro-caption */}
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '6px', fontSize: '12px' }}
              labelStyle={{ color: '#e5e7eb' }}
              itemStyle={{ color: '#e5e7eb' }}
            />
            <ReferenceLine y={current?.signals.threshold ?? 0.45} stroke="#f97316" strokeDasharray="6 3" label={{ value: 'Threshold', fill: '#fb923c', fontSize: 10, position: 'right' }} />
            <Line type="monotone" dataKey="raw" stroke="#22d3ee" strokeWidth={1.5} dot={false} name="Raw risk (learned)" />
            <Line type="monotone" dataKey="smoothed" stroke="#a855f7" strokeWidth={2} dot={false} name="Smoothed EWMA (rule-derived)" />
            {/* Warning markers */}
            <Line
              type="monotone"
              dataKey="warning"
              stroke="transparent"
              dot={(props: { cx?: number; cy?: number; payload?: { warning: boolean; frame: number; smoothed: number }; index?: number }) => {
                if (!props.payload?.warning) return <g key={props.index} />;
                return <Dot key={props.index} cx={props.cx} cy={props.cy} r={3} fill="#f87171" stroke="#fff" strokeWidth={1} />;
              }}
              name="Warning"
            />
            {/* Current frame indicator */}
            {data[currentFrame] && (
              <ReferenceLine
                x={currentFrame}
                stroke="#22d3ee"
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-cyan-400" aria-hidden="true"></span>
          <span className="text-cyan-400">Raw risk - learned</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-purple-400" aria-hidden="true"></span>
          <span className="text-purple-400">Smoothed EWMA - rule-derived</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-orange-400 border-dashed border-t border-orange-400" style={{ borderStyle: 'dashed' }} aria-hidden="true"></span>
          <span className="text-orange-400">Threshold 0.45 (frozen)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-coral-400" aria-hidden="true"></span>
          <span className="text-coral-400">Warning marker</span>
        </span>
      </div>
    </div>
  );
}
