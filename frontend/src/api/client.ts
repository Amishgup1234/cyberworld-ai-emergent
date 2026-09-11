/**
 * CyberWorld AI — API client
 * Talks to /api/* on the same origin (Vite proxies in dev; ingress in prod).
 */

const BASE = "/api";

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} @ ${url}`);
  return (await r.json()) as T;
}

export type ScenarioMeta = { id: string; name: string; summary: string; family: string; frame_count: number };

export type Node = {
  id: string; label: string; kind: string; x: number; y: number;
  base: string; escalate_at?: number; peak?: string; ip: string; tier: string;
  risk: string;
};
export type Edge = {
  from: string; to: string; intensity: number;
  malicious?: boolean; predicted?: boolean; appears_at?: number; visible: boolean;
};
export type Stage = { stage: string; color: string; activate_at: number; target: number; prob: number; done: boolean };
export type Technique = { id: string; name: string; conf: number; active_at: number; active: boolean; current_conf: number };
export type MitreCol = { tactic: string; techniques: Technique[] };
export type XaiSignal = { name: string; weight: number; dir: "up" | "down"; context: string; active_at: number; active: boolean };
export type TargetPred = { host: string; pct: number; eta_min: number; color: string };
export type LogLine = { at: number; t: string; tag: string; color: string; text: string };

export type Kpis = {
  active_threat_vectors: number;
  forecast_confidence: number;
  lead_time_sec: number;
  twin_nodes: number;
  twin_edges: number;
  critical_nodes: number;
  warn_nodes: number;
  twin_fidelity: number;
};

export type FrameState = {
  frame: number; frame_count: number; stages_done: number;
  stages: Stage[]; nodes: Node[]; edges: Edge[]; mitre: MitreCol[];
  xai: XaiSignal[]; targets: TargetPred[]; logs: LogLine[]; kpis: Kpis;
  computed_at: string;
};

export type Mitigation = { id: string; label: string; delta: number; icon: string };

export type ScenarioFull = ScenarioMeta & {
  nodes: Node[]; edges: Edge[]; stages: Stage[]; mitre: MitreCol[];
  xai: XaiSignal[]; mitigations: Mitigation[];
  target_pool: { host: string; peak: number; activate_at: number; eta_base: number; color: string }[];
  log_seed: { at: number; tag: string; color: string; text: string }[];
};

export type Tenant = { id: string; name: string; region: string; operator: string; tier: string };

export type SimResult = {
  frame: number; baseline_risk: number; delta_pct: number; new_risk: number;
  applied: Mitigation[];
};

export type Incident = {
  id: string; scenario_id: string; scenario_name: string;
  tenant_id: string | null; frame: number; title: string;
  operator: string | null; notes: string | null;
  mitigation_ids: string[]; created_at: string;
  snapshot: {
    kpis: Kpis; targets: TargetPred[]; stages: Stage[];
    mitre_active: { tactic: string; id: string; name: string; conf: number }[];
    xai_active: XaiSignal[]; simulation: SimResult;
  };
};

export const api = {
  health: () => j<{ status: string; scenarios_loaded: number }>(`${BASE}/health`),
  listScenarios: () => j<ScenarioMeta[]>(`${BASE}/scenarios`),
  getScenario: (id: string) => j<ScenarioFull>(`${BASE}/scenarios/${encodeURIComponent(id)}`),
  getFrame: (id: string, frame: number) => j<FrameState>(`${BASE}/scenarios/${encodeURIComponent(id)}/frame/${frame}`),
  listTenants: () => j<Tenant[]>(`${BASE}/tenants`),
  simulate: (scenario_id: string, frame: number, mitigation_ids: string[]) =>
    j<SimResult>(`${BASE}/simulate`, { method: "POST", body: JSON.stringify({ scenario_id, frame, mitigation_ids }) }),
  createIncident: (payload: {
    scenario_id: string; tenant_id?: string | null; frame: number; title: string;
    operator?: string; notes?: string; mitigation_ids: string[];
  }) => j<Incident>(`${BASE}/incidents`, { method: "POST", body: JSON.stringify(payload) }),
  listIncidents: (tenant_id?: string) =>
    j<Incident[]>(`${BASE}/incidents${tenant_id ? `?tenant_id=${encodeURIComponent(tenant_id)}` : ""}`),
};
