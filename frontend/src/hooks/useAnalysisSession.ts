import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScenarioFrame } from '../api/generated';

export type AnalysisPhase = 'baseline' | 'emerging-risk' | 'early-warning' | 'confirmation';

export type AnalysisSessionStatus =
  | 'empty'
  | 'ready'
  | 'running'
  | 'paused'
  | 'warning-review'
  | 'confirmation-review'
  | 'complete';

export type AnalysisMilestoneId = 'baseline' | 'emerging-risk' | 'early-warning' | 'confirmation';

export interface AnalysisMilestones {
  baselineFrame: number | null;
  emergingRiskFrame: number | null;
  warningFrame: number | null;
  confirmationFrame: number | null;
  warningLeadFrames: number | null;
  warningTarget: string | null;
  warningStage: string | null;
}

export interface AnalysisSnapshot {
  phase: AnalysisPhase;
  frameIndex: number;
  frameId: number;
  timestamp: string;
  rawRisk: number;
  smoothedRisk: number;
  threshold: number;
  warningActive: boolean;
  stage: string;
  target: string | null;
  confirmedEvent?: string;
  confirmedAttackType?: string;
  confirmedWarningLeadFrames?: number;
}

interface AnalysisSessionOptions {
  autoStart?: boolean;
  stepMs?: number;
}

const SAFE_HOST_ALIAS = /^host-\d+$/;

function safeHostAlias(value: unknown): string | null {
  return typeof value === 'string' && SAFE_HOST_ALIAS.test(value) ? value : null;
}

function deriveEmergingRiskFrame(frames: readonly ScenarioFrame[], warningFrame: number): number {
  if (warningFrame <= 1) return Math.max(0, warningFrame - 1);

  const baselineRisk = (frames[0] as unknown as Record<string, unknown>)?.signals
    ? (frames[0] as unknown as { signals: { smoothed_risk: number } }).signals.smoothed_risk ?? 0
    : 0;
  const warningThreshold = (frames[warningFrame] as unknown as Record<string, unknown>)?.signals
    ? (frames[warningFrame] as unknown as { signals: { threshold: number } }).signals.threshold ?? baselineRisk
    : baselineRisk;
  const riseThreshold = baselineRisk + Math.max(0, warningThreshold - baselineRisk) * 0.25;

  const detected = frames.slice(1, warningFrame).findIndex((frame) => {
    const sig = (frame as unknown as Record<string, unknown>)?.signals as { smoothed_risk?: number; slope?: number } | undefined;
    return (sig?.smoothed_risk ?? 0) >= riseThreshold && (sig?.slope ?? 0) > 0;
  });

  return detected >= 0 ? detected + 1 : Math.max(1, warningFrame - 2);
}

function deriveCompleteAnalysisMilestones(frames: readonly ScenarioFrame[]): AnalysisMilestones {
  const warningFrame = frames.findIndex((frame) => (frame as unknown as Record<string, unknown>)?.signals && (frame as unknown as { signals: { warning: boolean } }).signals.warning);
  const confirmationFrame = frames.findIndex((frame) => (frame as unknown as Record<string, unknown>)?.ground_truth && (frame as unknown as { ground_truth: { revealed: boolean } }).ground_truth.revealed);
  const normalizedWarningFrame = warningFrame >= 0 ? warningFrame : null;
  const normalizedConfirmationFrame = confirmationFrame >= 0 ? confirmationFrame : null;
  const warningSnapshot = normalizedWarningFrame === null ? null : frames[normalizedWarningFrame];
  const topTarget = (warningSnapshot as unknown as Record<string, unknown>)?.forecast
    ? (warningSnapshot as unknown as { forecast: { target_ranking?: { host: string }[] } }).forecast.target_ranking?.[0]?.host
    : null;

  return {
    baselineFrame: frames.length > 0 ? 0 : null,
    emergingRiskFrame:
      normalizedWarningFrame === null ? null : deriveEmergingRiskFrame(frames, normalizedWarningFrame),
    warningFrame: normalizedWarningFrame,
    confirmationFrame: normalizedConfirmationFrame,
    warningLeadFrames:
      normalizedWarningFrame !== null &&
      normalizedConfirmationFrame !== null &&
      normalizedConfirmationFrame > normalizedWarningFrame
        ? normalizedConfirmationFrame - normalizedWarningFrame
        : null,
    warningTarget: safeHostAlias(topTarget),
    warningStage: (warningSnapshot as unknown as Record<string, unknown>)?.forecast
      ? (warningSnapshot as unknown as { forecast: { stage: string } }).forecast.stage ?? null
      : null,
  };
}

export function deriveAnalysisMilestones(
  frames: readonly ScenarioFrame[],
  visibleThroughFrame = 0
): AnalysisMilestones {
  const complete = deriveCompleteAnalysisMilestones(frames);
  const hasReached = (frame: number | null) => frame !== null && frame <= visibleThroughFrame;
  const warningReached = hasReached(complete.warningFrame);
  const confirmationReached = hasReached(complete.confirmationFrame);

  return {
    baselineFrame: complete.baselineFrame,
    emergingRiskFrame: hasReached(complete.emergingRiskFrame) ? complete.emergingRiskFrame : null,
    warningFrame: warningReached ? complete.warningFrame : null,
    confirmationFrame: confirmationReached ? complete.confirmationFrame : null,
    warningLeadFrames: confirmationReached ? complete.warningLeadFrames : null,
    warningTarget: warningReached ? complete.warningTarget : null,
    warningStage: warningReached ? complete.warningStage : null,
  };
}

export function buildAnalysisSnapshot(
  frames: readonly ScenarioFrame[],
  requestedFrame: number,
  milestones: AnalysisMilestones = deriveAnalysisMilestones(frames, requestedFrame)
): AnalysisSnapshot | null {
  if (frames.length === 0) return null;

  const frameIndex = Math.max(0, Math.min(requestedFrame, frames.length - 1));
  const frame = frames[frameIndex] as unknown as Record<string, unknown>;
  // Guard for malformed frames (invalid-data test)
  if (!frame || !(frame as unknown as { signals?: unknown }).signals || !(frame as unknown as { forecast?: unknown }).forecast || !(frame as unknown as { ground_truth?: unknown }).ground_truth) {
    return null;
  }
  const typed = frame as unknown as ScenarioFrame;
  const confirmationReached =
    milestones.confirmationFrame !== null && frameIndex >= milestones.confirmationFrame;
  const warningReached = milestones.warningFrame !== null && frameIndex >= milestones.warningFrame;
  const emergingReached =
    milestones.emergingRiskFrame !== null && frameIndex >= milestones.emergingRiskFrame;
  const topTarget = typed.forecast.target_ranking?.[0]?.host;

  const phase: AnalysisPhase = confirmationReached
    ? 'confirmation'
    : warningReached
      ? 'early-warning'
      : emergingReached
        ? 'emerging-risk'
        : 'baseline';

  const snapshot: AnalysisSnapshot = {
    phase,
    frameIndex,
    frameId: typed.frame,
    timestamp: typed.timestamp,
    rawRisk: typed.signals.raw_risk,
    smoothedRisk: typed.signals.smoothed_risk,
    threshold: typed.signals.threshold,
    warningActive: typed.signals.warning,
    stage: typed.forecast.stage,
    target: safeHostAlias(topTarget),
  };

  // Never copy future ground-truth fields into the public snapshot. They become
  // available only when the current frame itself carries a revealed truth.
  if (confirmationReached && typed.ground_truth.revealed) {
    snapshot.confirmedEvent = typed.ground_truth.event;
    const attackType = typed.ground_truth.attack_type;
    if (typeof attackType === 'string' && attackType.length > 0) {
      snapshot.confirmedAttackType = attackType;
    }
    if (milestones.warningLeadFrames !== null) {
      snapshot.confirmedWarningLeadFrames = milestones.warningLeadFrames;
    }
  }

  return snapshot;
}

function frameForMilestone(
  milestone: AnalysisMilestoneId,
  milestones: AnalysisMilestones
): number | null {
  switch (milestone) {
    case 'baseline':
      return milestones.baselineFrame;
    case 'emerging-risk':
      return milestones.emergingRiskFrame;
    case 'early-warning':
      return milestones.warningFrame;
    case 'confirmation':
      return milestones.confirmationFrame;
  }
}

export function useAnalysisSession(
  frames: readonly ScenarioFrame[],
  { autoStart = true, stepMs = 800 }: AnalysisSessionOptions = {}
) {
  const completeMilestones = useMemo(() => deriveCompleteAnalysisMilestones(frames), [frames]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [highestReachedFrame, setHighestReachedFrame] = useState(0);
  const [status, setStatus] = useState<AnalysisSessionStatus>(
    frames.length === 0
      ? 'empty'
      : completeMilestones.confirmationFrame === 0
        ? 'confirmation-review'
        : completeMilestones.warningFrame === 0
          ? 'warning-review'
          : autoStart
            ? 'running'
            : 'ready'
  );
  const warningReviewed = useRef(completeMilestones.warningFrame === 0);
  const confirmationReviewed = useRef(completeMilestones.confirmationFrame === 0);

  const milestones = useMemo(
    () => deriveAnalysisMilestones(frames, highestReachedFrame),
    [frames, highestReachedFrame]
  );

  useEffect(() => {
    setCurrentFrame(0);
    setHighestReachedFrame(0);
    warningReviewed.current = completeMilestones.warningFrame === 0;
    confirmationReviewed.current = completeMilestones.confirmationFrame === 0;
    setStatus(
      frames.length === 0
        ? 'empty'
        : completeMilestones.confirmationFrame === 0
          ? 'confirmation-review'
          : completeMilestones.warningFrame === 0
            ? 'warning-review'
            : autoStart
              ? 'running'
              : 'ready'
    );
  }, [autoStart, completeMilestones.confirmationFrame, completeMilestones.warningFrame, frames]);

  useEffect(() => {
    if (status !== 'running' || frames.length === 0) return;

    const timer = window.setTimeout(() => {
      const nextFrame = Math.min(currentFrame + 1, frames.length - 1);
      setCurrentFrame(nextFrame);
      setHighestReachedFrame((previous) => Math.max(previous, nextFrame));

      if (completeMilestones.confirmationFrame === nextFrame && !confirmationReviewed.current) {
        confirmationReviewed.current = true;
        setStatus('confirmation-review');
        return;
      }

      if (completeMilestones.warningFrame === nextFrame && !warningReviewed.current) {
        warningReviewed.current = true;
        setStatus('warning-review');
        return;
      }

      if (nextFrame >= frames.length - 1) {
        setStatus('complete');
      }
    }, Math.max(50, stepMs));

    return () => window.clearTimeout(timer);
  }, [
    completeMilestones.confirmationFrame,
    completeMilestones.warningFrame,
    currentFrame,
    frames.length,
    status,
    stepMs,
  ]);

  const start = useCallback(() => {
    if (frames.length > 0) setStatus('running');
  }, [frames.length]);

  const pause = useCallback(() => {
    setStatus((previous) => (previous === 'running' ? 'paused' : previous));
  }, []);

  const continueAnalysis = useCallback(() => {
    setStatus((previous) => {
      if (frames.length === 0) return 'empty';
      if (currentFrame >= frames.length - 1) return 'complete';
      if (
        previous === 'ready' ||
        previous === 'paused' ||
        previous === 'warning-review' ||
        previous === 'confirmation-review'
      ) {
        return 'running';
      }
      return previous;
    });
  }, [currentFrame, frames.length]);

  const restart = useCallback(() => {
    warningReviewed.current = completeMilestones.warningFrame === 0;
    confirmationReviewed.current = completeMilestones.confirmationFrame === 0;
    setCurrentFrame(0);
    setHighestReachedFrame(0);
    setStatus(
      frames.length === 0
        ? 'empty'
        : completeMilestones.confirmationFrame === 0
          ? 'confirmation-review'
          : completeMilestones.warningFrame === 0
            ? 'warning-review'
            : 'ready'
    );
  }, [completeMilestones.confirmationFrame, completeMilestones.warningFrame, frames.length]);

  const goToMilestone = useCallback(
    (milestone: AnalysisMilestoneId): boolean => {
      if (frames.length === 0) return false;
      const targetFrame = frameForMilestone(milestone, milestones);
      if (targetFrame === null || targetFrame > highestReachedFrame) return false;
      setCurrentFrame(targetFrame);
      setStatus('paused');
      return true;
    },
    [frames.length, highestReachedFrame, milestones]
  );

  const goToFrame = useCallback(
    (frame: number) => {
      if (frames.length === 0) return;
      const clamped = Math.max(0, Math.min(frames.length - 1, frame));
      setCurrentFrame(clamped);
      setHighestReachedFrame((prev) => Math.max(prev, clamped));
      setStatus((prev) => {
        if (prev === 'empty') return 'empty';
        if (prev === 'running' || prev === 'warning-review' || prev === 'confirmation-review' || prev === 'ready') return 'paused';
        return prev;
      });
    },
    [frames.length]
  );

  const nextFrame = useCallback(() => {
    if (frames.length === 0) return;
    goToFrame(currentFrame + 1);
  }, [currentFrame, frames.length, goToFrame]);

  const prevFrame = useCallback(() => {
    if (frames.length === 0) return;
    goToFrame(currentFrame - 1);
  }, [currentFrame, frames.length, goToFrame]);

  const snapshot = useMemo(
    () => buildAnalysisSnapshot(frames, currentFrame, milestones),
    [currentFrame, frames, milestones]
  );

  return {
    currentFrame,
    highestReachedFrame,
    status,
    isRunning: status === 'running',
    milestones,
    snapshot,
    start,
    pause,
    continueAnalysis,
    restart,
    goToMilestone,
    goToFrame,
    nextFrame,
    prevFrame,
  };
}
