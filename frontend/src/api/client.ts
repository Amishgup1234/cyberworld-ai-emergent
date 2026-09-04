// Typed fetch client using generated.ts types, with health check and offline fallback logic
import type {
  HealthResponse,
  ScenarioDetail,
  ScenarioSummary,
  ForecastResponse,
  EvaluationMetrics,
  EngineMetadata,
} from './generated';

export type ConnectionMode = 'api' | 'offline' | 'loading';

export interface OfflineBundle {
  scenario: ScenarioDetail;
  metrics: EvaluationMetrics;
  metadata: Record<string, unknown>;
  engine_metadata: EngineMetadata;
  disclosure: string;
  claim_limitations: string;
  generated_at: string;
}

const HEALTH_TIMEOUT_MS = 2000;

function parseJsonSanitized<T>(text: string): T {
  const sanitized = text.replace(/\bInfinity\b/g, '1.0').replace(/\b-NaN\b/g, 'null').replace(/\bNaN\b/g, 'null');
  return JSON.parse(sanitized) as T;
}

async function getResponseJsonText<T>(res: Response): Promise<T> {
  // Mock-friendly: handle both real Response with text() and vitest mocks with only json()
  if (typeof (res as unknown as { text?: unknown }).text === 'function') {
    const text = await res.text();
    return parseJsonSanitized<T>(text);
  }
  // fallback for test mocks that only implement json()
  const j = await (res as unknown as { json: () => Promise<unknown> }).json();
  // j may already be object - but ensure sanitization via stringify/parse for Infinity in object case
  const txt = JSON.stringify(j);
  return parseJsonSanitized<T>(txt);
}

export async function fetchHealth(timeoutMs = HEALTH_TIMEOUT_MS): Promise<HealthResponse | null> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/v1/health', { signal: controller.signal });
    if (!res.ok) return null;
    const data = await getResponseJsonText<HealthResponse>(res);
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

export async function fetchScenarioList(): Promise<ScenarioSummary[]> {
  const res = await fetch('/api/v1/scenarios');
  if (!res.ok) throw new Error(`scenarios list failed ${res.status}`);
  return getResponseJsonText<ScenarioSummary[]>(res);
}

export async function fetchScenarioDetail(scenarioId: string): Promise<ScenarioDetail> {
  const res = await fetch(`/api/v1/scenarios/${encodeURIComponent(scenarioId)}`);
  if (!res.ok) throw new Error(`scenario detail failed ${res.status}`);
  return getResponseJsonText<ScenarioDetail>(res);
}

export async function fetchMetrics(): Promise<EvaluationMetrics> {
  const res = await fetch('/api/v1/metrics');
  if (!res.ok) throw new Error(`metrics failed ${res.status}`);
  return getResponseJsonText<EvaluationMetrics>(res);
}

export async function fetchForecast(
  scenarioId: string,
  frameId: number
): Promise<ForecastResponse> {
  const res = await fetch('/api/v1/forecast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario_id: scenarioId, frame_id: frameId }),
  });
  if (!res.ok) throw new Error(`forecast failed ${res.status}`);
  return getResponseJsonText<ForecastResponse>(res);
}

export async function fetchSimulateIsolate(
  scenarioId: string,
  frameId: number,
  host: string,
  action: string = 'isolate_host'
): Promise<import('./generated').SimulationResult> {
  const res = await fetch('/api/v1/simulate/isolate-host', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario_id: scenarioId, frame_id: frameId, host, action }),
  });
  if (!res.ok) {
    let detail = `simulate failed ${res.status}`;
    try {
      const j = await getResponseJsonText<Record<string, unknown>>(res);
      detail = (j.detail as string) || detail;
    } catch {
      // ignore JSON parse error, use default detail
    }
    const err = new Error(detail);
    // attach status for caller checks
    (err as unknown as Record<string, unknown>).status = res.status;
    throw err;
  }
  return getResponseJsonText<import('./generated').SimulationResult>(res);
}

export async function fetchOfflineBundle(): Promise<OfflineBundle> {
  const res = await fetch('/offline_bundle.json');
  if (!res.ok) throw new Error(`offline bundle fetch failed ${res.status}`);
  const bundle = await getResponseJsonText<OfflineBundle>(res);
  // offline_bundle.json has scenario at top level under .scenario
  // Also data/demo/cyberworld_replay.json could be fallback but public/offline_bundle is primary
  if (!bundle.scenario && (bundle as unknown as Record<string, unknown>).scenario === undefined) {
    // Try to interpret as ScenarioDetail directly
    const asScenario = bundle as unknown as ScenarioDetail;
    if (asScenario.frames) {
      return {
        scenario: asScenario as unknown as ScenarioDetail,
        metrics: (asScenario as unknown as Record<string, unknown>).metrics as EvaluationMetrics || (bundle as unknown as Record<string, unknown>).metrics as EvaluationMetrics,
        metadata: (asScenario as unknown as Record<string, unknown>).metadata as Record<string, unknown> || {},
        engine_metadata: (asScenario.engine_metadata as EngineMetadata) || (asScenario as unknown as Record<string, unknown>).engine_metadata as EngineMetadata,
        disclosure: (asScenario as unknown as Record<string, unknown>).disclosure as string || '',
        claim_limitations: (asScenario as unknown as Record<string, unknown>).claim_limitations as string || '',
        generated_at: new Date().toISOString(),
      };
    }
  }
  return bundle;
}

export function isBackendHealthy(health: HealthResponse | null): boolean {
  if (!health) return false;
  return health.status === 'ok' && health.engine === 'trained';
}
