import { TrendingUp } from 'lucide-react';
import type { ScenarioFrame } from '../api/generated';

interface TrajectoryPanelProps {
  frames: ScenarioFrame[];
  currentFrame: number;
}

export function TrajectoryPanel({ frames, currentFrame }: TrajectoryPanelProps) {
  const sliced = frames.slice(0, currentFrame + 1);

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg p-4 flex flex-col gap-3" data-testid="trajectory-panel">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-cyan-400" aria-hidden="true" />
        Trajectory Over Time
      </h3>

      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {frames.map((f, idx) => {
          const stage = f.forecast.stage;
          const isCurrent = idx === currentFrame;
          const isPast = idx <= currentFrame;
          const color =
            stage === 'Normal'
              ? 'bg-cyan-500'
              : stage === 'Reconnaissance'
                ? 'bg-yellow-500'
                : stage === 'Credential Attack'
                  ? 'bg-orange-500'
                  : stage === 'Compromise/Infiltration'
                    ? 'bg-coral-500'
                    : 'bg-red-500';
          return (
            <div
              key={f.frame}
              className={`flex flex-col items-center gap-1 min-w-8 flex-shrink-0 ${isPast ? 'opacity-100' : 'opacity-30'}`}
              title={`Frame ${f.frame}: ${stage} (raw ${f.signals.raw_risk.toFixed(2)})`}
              aria-label={`Frame ${f.frame} stage ${stage}`}
            >
              <div
                className={`w-1.5 rounded-full transition-all ${isCurrent ? 'h-10 ring-2 ring-white' : 'h-6'} ${color}`}
              />
              <span className="text-[13px] font-mono text-gray-400">{f.frame}</span>
              {isCurrent && <span className="w-2 h-2 rounded-full bg-white" aria-hidden="true"></span>}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 text-[13px]">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-1.5 rounded bg-cyan-500" aria-hidden="true"></span>
          <span className="text-cyan-400">Normal</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-1.5 rounded bg-yellow-500" aria-hidden="true"></span>
          <span className="text-yellow-400">Recon</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-1.5 rounded bg-orange-500" aria-hidden="true"></span>
          <span className="text-orange-400">Credential</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-1.5 rounded bg-coral-500" aria-hidden="true"></span>
          <span className="text-coral-400">Compromise</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-1.5 rounded bg-red-500" aria-hidden="true"></span>
          <span className="text-red-400">Impact</span>
        </span>
      </div>

      <div className="text-[13px] text-gray-400">
        Showing trajectory 0..{currentFrame} of 29 - current stage:{' '}
        <span className="font-bold text-white">{frames[currentFrame]?.forecast.stage}</span>
      </div>

      <div className="max-h-28 overflow-auto text-[13px] bg-navy-700 rounded p-2 border border-navy-700">
        {sliced.slice(-8).map((f) => (
          <div key={f.frame} className="flex items-center justify-between py-0.5">
            <span className="text-gray-500 font-mono">F{f.frame}</span>
            <span className="text-white">{f.forecast.stage}</span>
            <span className="font-mono text-gray-400">{f.signals.smoothed_risk.toFixed(2)} slope {f.signals.slope.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
