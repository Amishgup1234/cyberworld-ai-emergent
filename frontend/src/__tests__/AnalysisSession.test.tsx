import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioFrame } from '../api/generated';
import offlineBundle from '../../public/offline_bundle.json';
import {
  buildAnalysisSnapshot,
  deriveAnalysisMilestones,
  useAnalysisSession,
} from '../hooks/useAnalysisSession';

function makeFrames({
  count = 8,
  warningAt = 3,
  confirmationAt = 6,
}: {
  count?: number;
  warningAt?: number | null;
  confirmationAt?: number | null;
} = {}): ScenarioFrame[] {
  return Array.from({ length: count }, (_, index) => {
    const warning = warningAt !== null && index >= warningAt && index < confirmationAt!;
    const revealed = confirmationAt !== null && index >= confirmationAt;
    const smoothedRisk = 0.2 + index * 0.08;
    return {
      frame: index,
      timestamp: `2026-01-01T00:00:${String(index).padStart(2, '0')}Z`,
      flow_summary: {
        total_flows: 10,
        distinct_ports: 2,
        distinct_dest_ips: 2,
        predicted_malicious_count: warning ? 4 : 1,
        predicted_malicious_ratio: warning ? 0.4 : 0.1,
      },
      nodes: [],
      edges: [],
      signals: {
        raw_risk: smoothedRisk + 0.02,
        smoothed_risk: smoothedRisk,
        slope: index === 0 ? 0 : 0.08,
        threshold: 0.42,
        warning,
      },
      forecast: {
        raw_risk: smoothedRisk + 0.02,
        smoothed_risk: smoothedRisk,
        slope: index === 0 ? 0 : 0.08,
        warning,
        threshold: 0.42,
        stage: warning ? 'Credential Attack' : 'Normal',
        target_ranking: [
          {
            host: 'host-42',
            target_score: 9,
            incoming_activity: 2,
            edge_novelty: 0.8,
            recent_risk_trend: 0.9,
            asset_criticality: 'high',
          },
        ],
        evidence: [],
        mitre: [],
        engine_metadata: {
          model_family: 'random_forest',
          model_version: 'test',
          data_mode: 'synthetic',
          feature_count: 80,
          feature_schema_version: 'test',
          threshold: 0.42,
          claim_limitations: 'test only',
        },
      },
      ground_truth: {
        revealed,
        event: revealed ? 'Secret outcome' : 'Normal',
        attack_type: revealed ? 'Infiltration' : null,
      },
    } as ScenarioFrame;
  });
}

describe('analysis milestone derivation', () => {
  it('derives warning, transition, confirmation, lead, stage, and safe target from data', () => {
    const milestones = deriveAnalysisMilestones(makeFrames(), 7);

    expect(milestones).toEqual({
      baselineFrame: 0,
      emergingRiskFrame: 1,
      warningFrame: 3,
      confirmationFrame: 6,
      warningLeadFrames: 3,
      warningTarget: 'host-42',
      warningStage: 'Credential Attack',
    });
  });

  it('works when milestones occur at different positions and rejects unsafe aliases', () => {
    const frames = makeFrames({ count: 12, warningAt: 5, confirmationAt: 10 });
    frames[5].forecast.target_ranking[0].host = '192.168.1.10';
    const milestones = deriveAnalysisMilestones(frames, 11);

    expect(milestones.warningFrame).toBe(5);
    expect(milestones.confirmationFrame).toBe(10);
    expect(milestones.warningLeadFrames).toBe(5);
    expect(milestones.warningTarget).toBeNull();
  });

  it('returns nullable milestones when no warning or confirmation exists', () => {
    const milestones = deriveAnalysisMilestones(
      makeFrames({ count: 5, warningAt: null, confirmationAt: null })
    );

    expect(milestones.warningFrame).toBeNull();
    expect(milestones.emergingRiskFrame).toBeNull();
    expect(milestones.confirmationFrame).toBeNull();
    expect(milestones.warningLeadFrames).toBeNull();
  });

  it('keeps future warning and confirmation metadata hidden until each milestone is reached', () => {
    const frames = makeFrames();

    expect(deriveAnalysisMilestones(frames, 0)).toEqual({
      baselineFrame: 0,
      emergingRiskFrame: null,
      warningFrame: null,
      confirmationFrame: null,
      warningLeadFrames: null,
      warningTarget: null,
      warningStage: null,
    });

    expect(deriveAnalysisMilestones(frames, 3)).toMatchObject({
      warningFrame: 3,
      confirmationFrame: null,
      warningLeadFrames: null,
      warningTarget: 'host-42',
      warningStage: 'Credential Attack',
    });

    expect(deriveAnalysisMilestones(frames, 6)).toMatchObject({
      confirmationFrame: 6,
      warningLeadFrames: 3,
    });
  });

  it('matches the milestones in the shipped deterministic scenario bundle', () => {
    const frames = offlineBundle.scenario.frames as unknown as ScenarioFrame[];
    const milestones = deriveAnalysisMilestones(frames, frames.length - 1);

    expect(frames).toHaveLength(30);
    expect(milestones.emergingRiskFrame).toBe(6);
    expect(milestones.warningFrame).toBe(8);
    expect(milestones.confirmationFrame).toBe(20);
    expect(milestones.warningLeadFrames).toBe(12);
    expect(milestones.warningTarget).toBe('host-238');
    expect(milestones.warningStage).toBe('Credential Attack');
  });
});

describe('analysis snapshot leakage boundary', () => {
  it('does not expose future event or attack type before ground truth is revealed', () => {
    const frames = makeFrames();
    const before = buildAnalysisSnapshot(frames, 3);
    const after = buildAnalysisSnapshot(frames, 6);

    expect(before?.phase).toBe('early-warning');
    expect(before?.confirmedEvent).toBeUndefined();
    expect(before?.confirmedAttackType).toBeUndefined();
    expect(before?.confirmedWarningLeadFrames).toBeUndefined();
    expect(JSON.stringify(before)).not.toContain('Secret outcome');
    expect(JSON.stringify(before)).not.toContain('Infiltration');

    expect(after?.phase).toBe('confirmation');
    expect(after?.confirmedEvent).toBe('Secret outcome');
    expect(after?.confirmedAttackType).toBe('Infiltration');
    expect(after?.confirmedWarningLeadFrames).toBe(3);
  });
});

describe('useAnalysisSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-starts and pauses at warning and confirmation milestones', () => {
    const frames = makeFrames();
    const { result } = renderHook(() =>
      useAnalysisSession(frames, { autoStart: true, stepMs: 100 })
    );

    expect(result.current.status).toBe('running');
    for (let step = 0; step < 3; step += 1) {
      act(() => vi.advanceTimersByTime(100));
    }
    expect(result.current.currentFrame).toBe(3);
    expect(result.current.status).toBe('warning-review');
    expect(result.current.milestones.confirmationFrame).toBeNull();
    expect(result.current.milestones.warningLeadFrames).toBeNull();

    act(() => result.current.continueAnalysis());
    for (let step = 0; step < 3; step += 1) {
      act(() => vi.advanceTimersByTime(100));
    }
    expect(result.current.currentFrame).toBe(6);
    expect(result.current.status).toBe('confirmation-review');
    expect(result.current.milestones.confirmationFrame).toBe(6);
    expect(result.current.milestones.warningLeadFrames).toBe(3);
  });

  it('pauses for a warning or confirmation that occurs at the initial frame', () => {
    const warningFrames = makeFrames({ count: 5, warningAt: 0, confirmationAt: 3 });
    const warningHook = renderHook(() =>
      useAnalysisSession(warningFrames, { autoStart: true, stepMs: 100 })
    );
    expect(warningHook.result.current.currentFrame).toBe(0);
    expect(warningHook.result.current.status).toBe('warning-review');

    warningHook.unmount();
    const confirmationFrames = makeFrames({ count: 5, warningAt: null, confirmationAt: 0 });
    const confirmationHook = renderHook(() =>
      useAnalysisSession(confirmationFrames, { autoStart: true, stepMs: 100 })
    );
    expect(confirmationHook.result.current.currentFrame).toBe(0);
    expect(confirmationHook.result.current.status).toBe('confirmation-review');
  });

  it('supports pause, resume, restart, and locked milestone navigation', () => {
    const frames = makeFrames();
    const { result } = renderHook(() =>
      useAnalysisSession(frames, { autoStart: false, stepMs: 100 })
    );

    expect(result.current.status).toBe('ready');
    expect(result.current.goToMilestone('early-warning')).toBe(false);

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.pause());
    expect(result.current.currentFrame).toBe(1);
    expect(result.current.status).toBe('paused');

    act(() => result.current.continueAnalysis());
    for (let step = 0; step < 2; step += 1) {
      act(() => vi.advanceTimersByTime(100));
    }
    expect(result.current.status).toBe('warning-review');
    expect(result.current.highestReachedFrame).toBe(3);

    act(() => {
      expect(result.current.goToMilestone('baseline')).toBe(true);
    });
    expect(result.current.currentFrame).toBe(0);
    expect(result.current.status).toBe('paused');

    act(() => result.current.restart());
    expect(result.current.currentFrame).toBe(0);
    expect(result.current.highestReachedFrame).toBe(0);
    expect(result.current.status).toBe('ready');
  });

  it('returns an empty safe state for a scenario with no frames', () => {
    const { result } = renderHook(() => useAnalysisSession([], { autoStart: true }));

    expect(result.current.status).toBe('empty');
    expect(result.current.snapshot).toBeNull();
    expect(result.current.goToMilestone('baseline')).toBe(false);
    expect(result.current.goToMilestone('confirmation')).toBe(false);
  });
});
