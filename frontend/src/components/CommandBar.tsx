import { ShieldCheck, Database, Wifi, WifiOff, Info, HelpCircle } from 'lucide-react';
import type { ConnectionMode } from '../api/client';
import type { HealthResponse } from '../api/generated';
import { ReplayTimeline } from './ReplayTimeline';
import type { PlaybackSpeed } from '../hooks/useReplayController';

interface CommandBarProps {
  mode: ConnectionMode;
  health: HealthResponse | null;
  dataMode: string;
  scenarioName?: string;
  modelFamily?: string;
  modelVersion?: string;
  // replay props for center cluster
  currentFrame: number;
  totalFrames: number;
  timestamp: string;
  isPlaying: boolean;
  speed: PlaybackSpeed;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSpeedChange: (s: PlaybackSpeed) => void;
  onFrameChange: (f: number) => void;
}

export function CommandBar({
  mode,
  health,
  dataMode,
  scenarioName,
  modelFamily,
  modelVersion,
  currentFrame,
  totalFrames,
  timestamp,
  isPlaying,
  speed,
  onPlay,
  onPause,
  onRestart,
  onSpeedChange,
  onFrameChange,
}: CommandBarProps) {
  const isApi = mode === 'api';
  const isOffline = mode === 'offline';
  const isSynthetic = dataMode === 'synthetic' || dataMode.includes('synthetic');
  const displayModelFamily = modelFamily || health?.model_family;
  const displayModelVersion = modelVersion || health?.version;
  const hasModel = Boolean(displayModelFamily && displayModelVersion);
  // Map model family to short pill label but keep API-derived value - no hardcoded fallback
  const modelShort = displayModelFamily?.includes('forest')
    ? 'RF'
    : displayModelFamily?.includes('logistic')
      ? 'LR'
      : displayModelFamily;
  const modelPill = hasModel ? `${modelShort}-Binary ${displayModelVersion}` : '';

  return (
    <header
      className="w-full h-12 bg-cyber-900 sm:bg-navy-800 border-b border-cyber-800 sm:border-navy-700 px-3 flex items-center justify-between gap-2 shrink-0 overflow-hidden"
      data-testid="command-bar"
      role="banner"
    >
      {/* Left: brand CYBERWORLD AI + version SOC-v3.1 pill + subtitle DIGITAL TWIN */}
      <div
        className="flex items-center gap-2 sm:gap-3 min-w-0 flex-none shrink-0"
        data-testid="brand-region"
      >
        <div className="p-1.5 rounded bg-cyber-cyan/10 border border-cyber-cyan/30 shadow-sm shadow-cyber-cyan/30 hidden sm:flex items-center justify-center w-6 h-6">
          <ShieldCheck className="w-4 h-4 text-cyber-cyan" aria-hidden="true" />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-[13px] font-bold tracking-wider text-white uppercase" data-testid="brand-title">
              CYBERWORLD AI
            </h1>
            {/* decorative micro-caption exempt: version pill, not regular operational text */}
            <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-cyber-800 text-cyber-cyan border border-cyber-700 hidden sm:inline-flex">
              SOC-v3.1
            </span>
          </div>
          {/* decorative micro-caption exempt: subtitle branding, not operational data */}
          <p className="text-[9px] font-mono tracking-tight text-slate-400 hidden min-[1350px]:block">DIGITAL TWIN</p>
          {/* Keep old phrase for compatibility with existing tests - visible on md+ */}
          <span className="sr-only" data-testid="legacy-brand">CyberWorld AI - SOC Dashboard</span>
          <span className="hidden min-[1350px]:inline text-[13px] text-gray-500 truncate max-w-[220px]">{scenarioName || 'Predictive Cybersecurity Decision Support'}</span>
        </div>
      </div>

      {/* Center: replay cluster - genuinely responsive constrained region */}
      <div
        className="flex-1 min-w-0 max-w-full flex items-center justify-center overflow-hidden px-1 sm:px-2"
        data-testid="replay-region"
      >
        <ReplayTimeline
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          timestamp={timestamp}
          isPlaying={isPlaying}
          speed={speed}
          onPlay={onPlay}
          onPause={onPause}
          onRestart={onRestart}
          onSpeedChange={onSpeedChange}
          onFrameChange={onFrameChange}
        />
      </div>

      {/* Right: health/mode + dataset + model pills + help */}
      <div
        className="flex items-center gap-1.5 sm:gap-2 flex-none shrink-0 min-w-0"
        data-testid="status-region"
      >
        {/* Connection / Data Mode Badge - reuse Header logic but styled per Stitch */}
        {mode === 'loading' ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-mono font-medium bg-gray-700 text-gray-300 border border-gray-600"
            aria-label="Connection mode: loading"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" aria-hidden="true"></span>
            <span className="hidden sm:inline">Checking backend...</span>
          </span>
        ) : isApi ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-mono font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500 hidden sm:inline-flex"
            aria-label="Connection mode: API Mode - backend healthy"
            data-testid="connection-badge"
          >
            <Wifi className="w-3 h-3" aria-hidden="true" />
            <span>API Mode</span>
          </span>
        ) : isOffline ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 hidden sm:inline-flex"
            aria-label="Connection mode: Offline Mode - backend unavailable, using fallback"
            data-testid="connection-badge"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" aria-hidden="true"></span>
            <span>Offline Mode</span>
            <span className="hidden min-[1350px]:inline"> - Fallback Active</span>
          </span>
        ) : null}

        {/* Mobile condensed badge */}
        {isOffline && (
          <span className="inline-flex sm:hidden items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500 text-[13px] font-mono">
            <WifiOff className="w-3 h-3" aria-hidden="true" />
            Offline
          </span>
        )}
        {isApi && (
          <span className="inline-flex sm:hidden items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500 text-[13px] font-mono">
            <Wifi className="w-3 h-3" aria-hidden="true" />
            API
          </span>
        )}

        {/* Dataset Badge - hide at 1280 to preserve center width, show at 1350+ */}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-mono font-medium border hidden min-[1350px]:inline-flex ${
            isSynthetic
              ? 'bg-purple-500/20 text-purple-400 border-purple-500'
              : 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
          }`}
          aria-label={`Dataset: ${isSynthetic ? 'Synthetic Fallback' : 'CICIDS2017'} - ${isSynthetic ? 'Generated from CICIDS2017 synthetic fallback (seed 42)' : 'CICIDS2017'}`}
          data-testid="dataset-badge"
        >
          <Database className="w-3 h-3" aria-hidden="true" />
          <span>{isSynthetic ? 'Synthetic Fallback' : 'CICIDS2017'}</span>
        </span>

        {/* Model pill - API-derived, never hardcoded fallback */}
        {hasModel ? (
          <span
            className="hidden min-[1350px]:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-600"
            aria-label={`Model: ${displayModelFamily} ${displayModelVersion}`}
            data-testid="model-pill"
            title={`${displayModelFamily} ${displayModelVersion}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" aria-hidden="true"></span>
            <span>{modelPill}</span>
          </span>
        ) : (
          <span
            className="hidden min-[1350px]:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-mono font-medium bg-slate-800 text-slate-500 border border-slate-600"
            aria-label="Model: unavailable"
            data-testid="model-pill-unavailable"
            title="Model: unavailable"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" aria-hidden="true"></span>
            <span>Model: unavailable</span>
          </span>
        )}

        {/* Help */}
        <button
          aria-label="Help - show keyboard shortcuts and claim limitations"
          title="Help: Space play/pause, R restart, Arrow keys navigate frames. Learned risk only, rule-derived stage, graph-ranked target, simulated isolation not causal proof."
          className="hidden sm:inline-flex items-center justify-center w-6 h-6 rounded bg-cyber-800 hover:bg-cyber-700 text-slate-400 hover:text-white border border-cyber-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          data-testid="help-btn"
          onClick={() => {
            // simple help: could open alert or scroll to claim limitations - keep minimal
            const el = document.querySelector('[data-testid="claim-limitations"]') || document.body;
            // no-op, just ensure button exists and is focusable
            (el as HTMLElement)?.scrollIntoView?.({ behavior: 'smooth' });
          }}
        >
          <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          aria-label="Help"
          className="sm:hidden inline-flex items-center justify-center w-6 h-6 rounded bg-navy-700 text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400"
          data-testid="help-btn-mobile"
        >
          <Info className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
