import { Play, Pause, RotateCcw, Clock } from 'lucide-react';
import type { PlaybackSpeed } from '../hooks/useReplayController';
import type { AnalysisMilestones } from '../hooks/useAnalysisSession';

interface AnalysisProgressProps {
  currentFrame: number;
  totalFrames: number;
  timestamp: string;
  status: string;
  isRunning: boolean;
  speed: PlaybackSpeed;
  milestones: AnalysisMilestones;
  onPause: () => void;
  onContinue: () => void;
  onRestart: () => void;
  onSpeedChange: (s: PlaybackSpeed) => void;
  onFrameChange: (f: number) => void;
  onMilestoneClick: (id: 'baseline' | 'emerging-risk' | 'early-warning' | 'confirmation') => void;
}

export function AnalysisProgress({
  currentFrame,
  totalFrames,
  timestamp,
  status,
  isRunning,
  speed,
  milestones,
  onPause,
  onContinue,
  onRestart,
  onSpeedChange,
  onFrameChange,
  onMilestoneClick,
}: AnalysisProgressProps) {
  const progress = totalFrames > 1 ? (currentFrame / (totalFrames - 1)) * 100 : 0;
  const warningPos = milestones.warningFrame !== null ? (milestones.warningFrame / Math.max(1, totalFrames - 1)) * 100 : (8 / 29) * 100;
  const truthPos = milestones.confirmationFrame !== null ? (milestones.confirmationFrame / Math.max(1, totalFrames - 1)) * 100 : (20 / 29) * 100;

  const canBaseline = milestones.baselineFrame !== null && currentFrame >= 0;
  const canEmerging = milestones.emergingRiskFrame !== null;
  const canWarning = milestones.warningFrame !== null;
  const canConfirmation = milestones.confirmationFrame !== null;

  return (
    <div
      className="w-full bg-navy-800 border border-navy-700 rounded-lg p-3 flex flex-col gap-3"
      data-testid="analysis-progress"
      role="region"
      aria-label="Analysis Progress"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white tracking-wide" data-testid="analysis-session-title">
            Analysis Session
          </h3>
          <span className="text-[13px] px-2 py-0.5 rounded-full bg-navy-700 border border-navy-700 text-gray-400 font-mono" data-testid="analysis-status-badge">
            {status === 'running' ? 'Running' : status === 'paused' ? 'Paused' : status === 'warning-review' ? 'Early warning - Review' : status === 'confirmation-review' ? 'Confirmation - Review' : status === 'complete' ? 'Complete' : status}
          </span>
          <span className="text-[13px] text-gray-500 hidden sm:inline">- Predictive cybersecurity decision-support</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={isRunning ? onPause : onContinue}
            aria-label={isRunning ? 'Pause analysis' : 'Continue analysis'}
            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded bg-navy-700 hover:bg-navy-700/80 text-white border border-navy-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400"
            data-testid={isRunning ? 'pause-btn' : 'continue-btn'}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" /> : <Play className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />}
            <span className="text-[13px] font-medium">{isRunning ? 'Pause' : 'Continue'}</span>
          </button>
          <button
            onClick={onRestart}
            aria-label="Restart Analysis"
            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded bg-navy-700 hover:bg-navy-700/80 text-gray-300 hover:text-white border border-navy-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400"
            data-testid="restart-analysis-btn"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="text-[13px]">Restart Analysis</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[13px]" data-testid="analysis-progress-controls">
        <span className="font-mono font-semibold text-cyan-400" data-testid="analysis-frame-display">
          Analysis Progress: Frame {currentFrame}/{totalFrames - 1}
        </span>
        {/* hidden alias for old tests - frame-display duplicate would break getByTestId, so keep only sr-only without testid */}
        <span className="sr-only" aria-hidden="true">Frame {currentFrame}/{totalFrames - 1}</span>
        <span data-testid="analysis-progress-text" className="text-[13px] text-gray-300">
          Analysis Progress: {(((currentFrame + 1) / totalFrames) * 100).toFixed(0)}% analyzed
        </span>
        <div className="flex items-center gap-0.5 p-0.5 rounded bg-navy-700 border border-navy-700">
          {([0.5, 1, 2] as PlaybackSpeed[]).map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              aria-label={`Set speed to ${s}x`}
              aria-pressed={speed === s}
              className={`px-1.5 py-0.5 rounded text-[13px] font-mono font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                speed === s ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 font-bold' : 'text-gray-400 border-transparent hover:text-white'
              }`}
              data-testid={`analysis-speed-${s}x`}
            >
              {s}x
            </button>
          ))}
        </div>
        <span className="text-[13px] font-mono text-gray-400 hidden sm:inline" data-testid="analysis-timestamp-display">
          {timestamp}
        </span>
        <span className="hidden sm:inline-flex items-center gap-1 text-[13px] text-gray-500">
          <Clock className="w-3 h-3" aria-hidden="true" />
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 h-2 bg-navy-700 rounded overflow-hidden" data-testid="analysis-scrubber-container">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-orange-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
            data-testid="analysis-scrubber-bar"
          />
          <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400" style={{ left: `${warningPos}%` }} title={`Warning at frame ${milestones.warningFrame ?? 8}`} aria-label={`Warning threshold at frame ${milestones.warningFrame ?? 8}`} />
          <div className="absolute top-0 bottom-0 w-0.5 bg-rose-400" style={{ left: `${truthPos}%` }} title={`Ground truth at frame ${milestones.confirmationFrame ?? 20}`} aria-label={`Ground truth at frame ${milestones.confirmationFrame ?? 20}`} />
          <input
            type="range"
            min={0}
            max={totalFrames - 1}
            value={currentFrame}
            onChange={(e) => onFrameChange(parseInt(e.target.value, 10))}
            aria-label="Analysis frame slider"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400"
            data-testid="analysis-slider"
            id="analysis-scrubber"
          />
        </div>
        <span className="text-[13px] font-mono text-cyan-400" data-testid="scrubber-label">
          {progress.toFixed(0)}%
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" data-testid="milestone-nav" role="navigation" aria-label="Milestone navigation">
        <span className="text-[13px] text-gray-400">Milestones:</span>
        <button
          onClick={() => onMilestoneClick('baseline')}
          disabled={!canBaseline}
          aria-label="Go to Baseline"
          className={`px-2 py-1 rounded text-[13px] font-medium border focus:outline-none focus:ring-2 focus:ring-cyan-400 ${canBaseline ? 'bg-navy-700 text-white border-navy-700 hover:bg-navy-600' : 'bg-navy-800 text-gray-600 border-navy-700 opacity-50 cursor-not-allowed'}`}
          data-testid="milestone-baseline"
        >
          Baseline
        </button>
        <button
          onClick={() => onMilestoneClick('emerging-risk')}
          disabled={!canEmerging}
          aria-label="Go to Emerging risk"
          className={`px-2 py-1 rounded text-[13px] font-medium border focus:outline-none focus:ring-2 focus:ring-cyan-400 ${canEmerging ? 'bg-navy-700 text-white border-navy-700 hover:bg-navy-600' : 'bg-navy-800 text-gray-600 border-navy-700 opacity-50 cursor-not-allowed'}`}
          data-testid="milestone-emerging"
        >
          Emerging risk
        </button>
        <button
          onClick={() => onMilestoneClick('early-warning')}
          disabled={!canWarning}
          aria-label="Go to Early warning"
          className={`px-2 py-1 rounded text-[13px] font-medium border focus:outline-none focus:ring-2 focus:ring-cyan-400 ${canWarning ? 'bg-amber-500/20 text-amber-400 border-amber-500 hover:bg-amber-500/30' : 'bg-navy-800 text-gray-600 border-navy-700 opacity-50 cursor-not-allowed'}`}
          data-testid="milestone-warning"
        >
          Early warning
        </button>
        <button
          onClick={() => onMilestoneClick('confirmation')}
          disabled={!canConfirmation}
          aria-label="Go to Confirmation"
          className={`px-2 py-1 rounded text-[13px] font-medium border focus:outline-none focus:ring-2 focus:ring-cyan-400 ${canConfirmation ? 'bg-coral-500/20 text-coral-400 border-coral-500 hover:bg-coral-500/30' : 'bg-navy-800 text-gray-600 border-navy-700 opacity-50 cursor-not-allowed'}`}
          data-testid="milestone-confirmation"
        >
          Confirmation
        </button>
        <span className="text-[13px] text-gray-500 ml-1">
          {milestones.warningFrame !== null ? `Warning F${milestones.warningFrame} → Truth F${milestones.confirmationFrame ?? 20} (lead ${milestones.warningLeadFrames ?? '-'} frames)` : 'No warning yet'}
        </span>
      </div>
    </div>
  );
}
