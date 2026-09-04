import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface WarningBannerProps {
  warning: boolean;
  stage?: string;
  targetHost?: string;
  frameId?: number;
}

export function WarningBanner({ warning, stage, targetHost, frameId }: WarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed when warning goes false -> re-enable for next warning
  useEffect(() => {
    if (!warning) {
      setDismissed(false);
    }
  }, [warning]);

  if (!warning || dismissed) {
    return null;
  }

  const stageText = stage && stage !== 'Normal' ? stage : 'Elevated Risk';
  const hostText = targetHost ? ` - ${targetHost}` : '';

  return (
    <div
      className="w-full bg-gradient-to-r from-amber-500/25 via-amber-600/20 to-amber-700/20 border-y border-amber-500/30 px-4 py-2 flex items-center justify-between gap-3"
      role="status"
      aria-live="polite"
      aria-label="Early warning active"
      data-testid="warning-banner"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className="w-6 h-6 rounded bg-amber-500/30 border border-amber-400 flex items-center justify-center flex-shrink-0 animate-pulse"
          aria-hidden="true"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
          <span className="text-sm font-bold text-amber-400 flex items-center gap-2">
            <span>EARLY WARNING ACTIVE</span>
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true"></span>
            <span>Warning</span>
          </span>
          <span className="text-[13px] sm:text-sm text-amber-300">
            Warning: {stageText}
            {hostText}
          </span>
          {frameId !== undefined && (
            <span className="text-[13px] text-amber-400/70 font-mono">Frame {frameId} - before ground truth 20</span>
          )}
          <span className="inline-flex items-center gap-1 text-[13px] px-1.5 py-0.5 rounded bg-amber-500/40 text-white font-bold border border-amber-500/50">
            ELEVATED
          </span>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss warning banner"
        className="flex-shrink-0 p-1.5 rounded hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-amber-900/30"
        data-testid="warning-banner-dismiss"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
