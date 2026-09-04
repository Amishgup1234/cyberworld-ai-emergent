import { useEffect, useState } from 'react';
import type { ScenarioDetail, EvaluationMetrics } from '../api/generated';
import { fetchMetrics, fetchOfflineBundle, fetchScenarioDetail } from '../api/client';
import type { ConnectionMode } from '../api/client';

export interface ScenarioData {
  scenario: ScenarioDetail | null;
  metrics: EvaluationMetrics | null;
  loading: boolean;
  error: string | null;
}

export function useScenarioData(mode: ConnectionMode) {
  const [data, setData] = useState<ScenarioData>({
    scenario: null,
    metrics: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (mode === 'loading') return;
    let cancelled = false;
    async function load() {
      setData((prev) => ({ ...prev, loading: true, error: null }));
      try {
        if (mode === 'api') {
          // try API first
          try {
            const detail = await fetchScenarioDetail('cyberworld-replay-v1');
            const metrics = await fetchMetrics();
            if (cancelled) return;
            setData({ scenario: detail, metrics, loading: false, error: null });
            return;
          } catch {
            // fallback to offline if API fails
            const bundle = await fetchOfflineBundle();
            if (cancelled) return;
            setData({
              scenario: bundle.scenario,
              metrics: bundle.metrics,
              loading: false,
              error: null,
            });
            return;
          }
        } else {
          // offline mode directly
          const bundle = await fetchOfflineBundle();
          if (cancelled) return;
          setData({
            scenario: bundle.scenario,
            metrics: bundle.metrics,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (cancelled) return;
        setData({
          scenario: null,
          metrics: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load scenario',
        });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return data;
}
