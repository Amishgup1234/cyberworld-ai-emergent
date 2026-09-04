import { AlertTriangle, ShieldCheck, Activity, TrendingUp } from 'lucide-react';

interface RiskCardProps {
  rawRisk: number;
  smoothedRisk: number;
  slope: number;
  threshold: number;
  warning: boolean;
}

export function RiskCard({ rawRisk, smoothedRisk, slope, threshold, warning }: RiskCardProps) {
  const isWarningActive = warning && smoothedRisk > threshold && slope > 0;
  const riskLabel = isWarningActive ? 'Warning' : smoothedRisk > threshold ? 'Elevated' : 'Normal';

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg p-4 flex flex-col gap-3" data-testid="risk-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          Risk - Learned Model
        </h3>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-bold border ${
            isWarningActive
              ? 'bg-coral-500/20 text-coral-400 border-coral-500'
              : smoothedRisk > threshold
                ? 'bg-orange-500/20 text-orange-400 border-orange-500'
                : 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
          }`}
          aria-label={`Risk status: ${riskLabel}`}
        >
          {isWarningActive ? (
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>{riskLabel}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div className="bg-navy-700 rounded p-2.5 flex flex-col gap-1">
          <span className="text-gray-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400" aria-hidden="true"></span>
            Raw risk - learned
          </span>
          <span className="text-lg font-mono font-bold text-cyan-400">{rawRisk.toFixed(3)}</span>
          <span className="text-gray-500">Malicious probability (Random Forest)</span>
        </div>
        <div className="bg-navy-700 rounded p-2.5 flex flex-col gap-1">
          <span className="text-gray-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-400" aria-hidden="true"></span>
            Smoothed - 5-frame EWMA
          </span>
          <span className={`text-lg font-mono font-bold ${isWarningActive ? 'text-coral-400' : 'text-purple-400'}`}>
            {smoothedRisk.toFixed(3)}
          </span>
          <span className="text-gray-500">Alpha 0.4 - rule-derived</span>
        </div>
        <div className="bg-navy-700 rounded p-2.5 flex flex-col gap-1">
          <span className="text-gray-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" aria-hidden="true" />
            Slope - 5-frame trend
          </span>
          <span className={`text-lg font-mono font-bold ${slope > 0 ? 'text-orange-400' : 'text-gray-300'}`}>
            {slope > 0 ? '+' : ''}
            {slope.toFixed(4)}
          </span>
          <span className="text-gray-500">Positive required for warning</span>
        </div>
        <div className="bg-navy-700 rounded p-2.5 flex flex-col gap-1">
          <span className="text-gray-400">Threshold - frozen Thursday</span>
          <span className="text-lg font-mono font-bold text-gray-200">{threshold.toFixed(2)}</span>
          <span className="text-gray-500">Warning needs smoothed &gt; thr + slope &gt;0</span>
        </div>
      </div>

      {isWarningActive && (
        <div
          className="flex items-start gap-2 p-2.5 rounded border bg-coral-500/10 border-coral-500 text-coral-400 text-[13px]"
          role="alert"
          aria-label="Early warning active"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <span className="font-bold">Early warning active - before ground truth</span>
            <p className="text-coral-400/80 mt-0.5">Smoothed risk above threshold with positive slope - review stage and target panels.</p>
          </div>
        </div>
      )}

      {!isWarningActive && smoothedRisk > threshold && slope <= 0 && (
        <div className="text-[13px] text-gray-400 p-2 rounded bg-navy-700 border border-navy-700">
          Smoothed above threshold but slope not positive - warning not triggered (requires both).
        </div>
      )}
    </div>
  );
}
