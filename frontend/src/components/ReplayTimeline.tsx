import { Play, Pause, RotateCcw, Clock } from 'lucide-react';
import type { PlaybackSpeed } from '../hooks/useReplayController';

interface ReplayTimelineProps {
  currentFrame: number;
  totalFrames: number;
  timestamp: string;
  isPlaying: boolean;
  speed: PlaybackSpeed;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  onFrameChange: (frame: number) => void;
}

export function ReplayTimeline({
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
}: ReplayTimelineProps) {
  const progress = totalFrames > 1 ? (currentFrame / (totalFrames - 1)) * 100 : 0;
  const warningPos = (8 / 29) * 100; // 27.5%
  const truthPos = (20 / 29) * 100; // 68.9%

  return (
    <div
      className="flex items-center gap-1 sm:gap-1.5 bg-cyber-950/80 sm:bg-navy-900/80 px-2 py-1 rounded border border-cyber-800 sm:border-navy-700 max-w-full min-w-0 overflow-hidden"
      data-testid="replay-timeline"
    >
      <button
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
        className="inline-flex items-center justify-center gap-1 w-6 h-6 sm:w-auto sm:px-2 sm:py-1 rounded bg-cyber-800 sm:bg-navy-700 hover:bg-cyber-700 sm:hover:bg-navy-700/80 text-slate-300 hover:text-white border border-cyber-700 sm:border-navy-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-navy-800"
        data-testid="play-pause-btn"
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" /> : <Play className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />}
        <span className="hidden sm:inline text-[13px]">{isPlaying ? 'Pause' : 'Play'}</span>
      </button>

      <button
        onClick={onRestart}
        aria-label="Restart replay from beginning"
        className="inline-flex items-center justify-center gap-1 w-6 h-6 sm:w-auto sm:px-2 sm:py-1 rounded bg-cyber-800 sm:bg-navy-700 hover:bg-cyber-700 sm:hover:bg-navy-700/80 text-slate-400 hover:text-white border border-cyber-700 sm:border-navy-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-navy-800"
        data-testid="restart-btn"
      >
        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="hidden sm:inline text-[13px]">Restart</span>
      </button>

      <div className="flex items-center gap-0.5 p-0.5 rounded bg-cyber-800 sm:bg-navy-700 border border-cyber-700 sm:border-navy-700">
        {([0.5, 1, 2] as PlaybackSpeed[]).map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            aria-label={`Set speed to ${s}x`}
            aria-pressed={speed === s}
            className={`px-1.5 py-0.5 rounded text-[13px] font-mono font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              speed === s
                ? 'bg-cyber-cyan/20 text-cyber-cyan border-cyber-cyan/30 font-bold'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
            data-testid={`speed-${s}x`}
          >
            {s}x
          </button>
        ))}
      </div>

      <span className="text-[13px] font-mono font-semibold text-cyan-400 hidden sm:inline" data-testid="frame-display">
        Frame {currentFrame}/{totalFrames - 1}
      </span>
      <span className="text-[13px] font-mono font-semibold text-cyan-400 sm:hidden" aria-hidden="true">
        {currentFrame}/{totalFrames - 1}
      </span>

      {/* Scrubber track responsive - contained inside replay-timeline, single width not double */}
      <div
        className="relative hidden sm:grid w-24 lg:w-28 min-[1350px]:w-32 xl:w-36 h-2 shrink-0 place-items-center"
        data-testid="scrubber-container"
      >
        {/* Visual bar with progress and markers - background */}
        <div
          className="col-start-1 row-start-1 w-full h-2 bg-cyber-800 sm:bg-navy-700 rounded overflow-hidden pointer-events-none"
          aria-hidden="true"
        >
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyber-cyan to-cyber-amber transition-all duration-300"
            style={{ width: `${progress}%` }}
            data-testid="scrubber-bar"
          />
          {/* Warning marker at 27.5% */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
            style={{ left: `${warningPos}%` }}
            title="Warning threshold at frame 8"
            aria-label="Warning threshold at frame 8"
          />
          {/* Ground truth marker at 68.9% */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-rose-400"
            style={{ left: `${truthPos}%` }}
            title="Ground truth at frame 20"
            aria-label="Ground truth at frame 20"
          />
        </div>
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={currentFrame}
          onChange={(e) => onFrameChange(parseInt(e.target.value, 10))}
          aria-label="Replay frame slider"
          className="col-start-1 row-start-1 w-full accent-cyan-500 cursor-pointer bg-transparent focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
          data-testid="frame-slider"
          id="scrubber-track"
        />
      </div>
      {/* Mobile fallback: simple range visible only below sm */}
      <input
        type="range"
        min={0}
        max={totalFrames - 1}
        value={currentFrame}
        onChange={(e) => onFrameChange(parseInt(e.target.value, 10))}
        aria-label="Replay frame slider mobile"
        className="w-24 accent-cyan-500 cursor-pointer sm:hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
        data-testid="frame-slider-mobile"
      />

      <span
        className="text-[13px] font-mono text-slate-400 hidden min-[1350px]:inline shrink-0"
        data-testid="timestamp-display"
      >
        {timestamp}
      </span>
      {/* decorative micro-caption exempt: tiny pill badge, not regular operational text */}
      <span
        className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyber-cyan border border-cyan-800 font-mono hidden min-[1350px]:inline shrink-0"
        data-testid="current-frame-pill"
      >
        Current Frame
      </span>
      <span className="hidden min-[1350px]:inline-flex items-center gap-1 text-[13px] text-gray-500 ml-1 shrink-0">
        <Clock className="w-3 h-3" aria-hidden="true" />
      </span>
    </div>
  );
}
