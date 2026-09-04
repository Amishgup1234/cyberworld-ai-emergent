import { useCallback, useEffect, useRef, useState } from 'react';

export type PlaybackSpeed = 0.5 | 1 | 2;

export function useReplayController(frameCount: number, initialSpeed: PlaybackSpeed = 1) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(initialSpeed);
  const intervalRef = useRef<number | null>(null);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const restart = useCallback(() => {
    setCurrentFrame(0);
    setIsPlaying(false);
  }, []);
  const toggle = useCallback(() => setIsPlaying((p) => !p), []);

  const goToFrame = useCallback(
    (frame: number) => {
      const clamped = Math.max(0, Math.min(frameCount - 1, frame));
      setCurrentFrame(clamped);
    },
    [frameCount]
  );

  const nextFrame = useCallback(() => {
    setCurrentFrame((prev) => {
      if (prev >= frameCount - 1) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [frameCount]);

  const prevFrame = useCallback(() => {
    setCurrentFrame((prev) => Math.max(0, prev - 1));
  }, []);

  // Keyboard accessibility: space for play/pause, r for restart, arrows
  // Isolated from WorkspaceTabs and interactive controls - see WorkspaceTabs.tsx handleKeyDown stopPropagation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Ignore when focus is inside interactive controls (button, select, tabs, slider, contenteditable)
      // This prevents workspace tab navigation (ArrowRight/Left/Home/End) and Space/R on focused tabs/buttons
      // from also triggering global replay shortcuts. Slider's own Arrow handling remains via native input behavior.
      const interactiveSelector = 'button, select, input, textarea, [role="tab"], [role="tablist"], [contenteditable="true"]';
      if (target instanceof HTMLElement) {
        try {
          if (target.closest(interactiveSelector)) return;
        } catch {
          // ignore if closest not supported
        }
        // Also keep existing INPUT/TEXTAREA check (redundant but keep for safety)
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        // Also ignore if target is a button or select
        try {
          if (target.closest('button') || target.closest('select') || target.closest('[role="tab"]')) return;
        } catch {
          // ignore
        }
      } else {
        // If target is not HTMLElement, try closest if available
        try {
          const maybeClosest = (target as unknown as { closest?: (s: string) => Element | null }).closest;
          if (maybeClosest && maybeClosest.call(target as unknown as Element, 'button, select, input, textarea, [role="tab"]')) return;
        } catch {
          // fallback: allow global shortcuts
        }
      }
      // Preserve global shortcuts when focus is on body or non-interactive element
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'r' || e.key === 'R') {
        restart();
      } else if (e.key === 'ArrowRight') {
        nextFrame();
      } else if (e.key === 'ArrowLeft') {
        prevFrame();
      }
    };
    // Use capture phase so we see Space before document bubble handlers that may set defaultPrevented
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [toggle, restart, nextFrame, prevFrame]);

  // Interval for auto-play
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    const baseMs = 1200;
    const intervalMs = baseMs / speed;
    intervalRef.current = window.setInterval(() => {
      setCurrentFrame((prev) => {
        if (prev >= frameCount - 1) {
          setIsPlaying(false);
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, speed, frameCount]);

  // Reset when frameCount changes
  useEffect(() => {
    setCurrentFrame((prev) => Math.min(prev, Math.max(0, frameCount - 1)));
  }, [frameCount]);

  return {
    currentFrame,
    isPlaying,
    speed,
    setSpeed,
    play,
    pause,
    restart,
    toggle,
    goToFrame,
    nextFrame,
    prevFrame,
  };
}
