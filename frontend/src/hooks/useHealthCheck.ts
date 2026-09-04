import { useEffect, useState } from 'react';
import { fetchHealth, isBackendHealthy, type ConnectionMode } from '../api/client';
import type { HealthResponse } from '../api/generated';

export function useHealthCheck() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [mode, setMode] = useState<ConnectionMode>('loading');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const h = await fetchHealth(2000);
      if (cancelled) return;
      setHealth(h);
      // Use the existing isBackendHealthy helper - API mode only when status ok and engine trained
      if (isBackendHealthy(h)) {
        setMode('api');
      } else {
        setMode('offline');
      }
      setChecked(true);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { health, mode, checked, setMode };
}
