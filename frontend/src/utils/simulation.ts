import type { ScenarioFrame, SimulationResult, NetworkEdge, TargetRankingEntry } from '../api/generated';

const THRESHOLD = 0.45;
const CRIT_MAP: Record<string, number> = { low: 1, medium: 2, high: 3 };

function rankTargetsOffline(
  nodes: Array<Record<string, unknown>>,
  edges: NetworkEdge[],
  frameIdx: number,
  smoothed: number,
  slope: number
): TargetRankingEntry[] {
  const gNodes = new Map<string, { criticality: string; criticality_numeric: number; role: string; incoming: number; avgNov: number }>();
  // Build node map
  for (const n of nodes) {
    const id = (n.id as string) || (n.alias as string);
    if (!id) continue;
    gNodes.set(id, {
      criticality: (n.criticality as string) || 'low',
      criticality_numeric: ((n.criticality_numeric as number) ?? CRIT_MAP[(n.criticality as string) || 'low'] ?? 1),
      role: (n.role as string) || 'workstation',
      incoming: 0,
      avgNov: 0.5,
    });
  }
  // ensure edge nodes exist
  for (const e of edges) {
    if (!gNodes.has(e.source)) gNodes.set(e.source, { criticality: 'low', criticality_numeric: 1, role: 'workstation', incoming: 0, avgNov: 0.5 });
    if (!gNodes.has(e.target)) gNodes.set(e.target, { criticality: 'low', criticality_numeric: 1, role: 'workstation', incoming: 0, avgNov: 0.5 });
  }
  // Compute incoming and novelty per node
  const incomingMap = new Map<string, { total: number; novelties: number[] }>();
  for (const e of edges) {
    const entry = incomingMap.get(e.target) ?? { total: 0, novelties: [] };
    entry.total += e.activity;
    const first = (e.first_seen as number) ?? frameIdx;
    const delta = frameIdx - first;
    let nov = 0.2;
    if (delta === 0) nov = 1.0;
    else if (delta <= 2) nov = 0.8;
    else if (delta <= 5) nov = 0.5;
    entry.novelties.push(nov);
    incomingMap.set(e.target, entry);
  }
  let riskTrend = 0.5 + smoothed;
  if (slope > 0) riskTrend *= 1 + slope * 5;
  riskTrend = Math.max(0.1, riskTrend);
  const rankings: TargetRankingEntry[] = [];
  for (const [alias, attrs] of gNodes.entries()) {
    const incomingData = incomingMap.get(alias);
    const incoming = incomingData?.total ?? 0;
    const avgNov = incomingData && incomingData.novelties.length ? incomingData.novelties.reduce((a, b) => a + b, 0) / incomingData.novelties.length : 0.5;
    const critNum = attrs.criticality_numeric ?? CRIT_MAP[attrs.criticality] ?? 1;
    const incomingFactor = incoming + 1;
    const score = incomingFactor * avgNov * riskTrend * critNum;
    rankings.push({
      host: alias,
      alias,
      target_score: score,
      incoming_activity: incoming,
      edge_novelty: avgNov,
      recent_risk_trend: riskTrend,
      asset_criticality: attrs.criticality,
      criticality_numeric: critNum,
      role: attrs.role,
      rank: 0,
    } as TargetRankingEntry);
  }
  rankings.sort((a, b) => {
    if (b.target_score !== a.target_score) return b.target_score - a.target_score;
    return (a.alias || a.host).localeCompare(b.alias || b.host);
  });
  rankings.forEach((r, idx) => (r.rank = idx + 1));
  return rankings;
}

export function offlineSimulateIsolation(frame: ScenarioFrame, host: string): SimulationResult {
  const nodes = frame.nodes as unknown as Array<Record<string, unknown>>;
  const edges = frame.edges as NetworkEdge[];
  const signals = frame.signals as unknown as Record<string, unknown>;
  const forecast = frame.forecast as unknown as Record<string, unknown>;
  const threshold = (signals.threshold as number) ?? THRESHOLD;

  const beforeRaw = (signals.raw_risk as number) ?? (forecast.raw_risk as number) ?? 0.3;
  const beforeSmoothed = (signals.smoothed_risk as number) ?? (forecast.smoothed_risk as number) ?? 0.3;
  const beforeSlope = (signals.slope as number) ?? (forecast.slope as number) ?? 0.0;
  const beforeWarning = (signals.warning as boolean) ?? (forecast.warning as boolean) ?? false;
  const beforeStage = (forecast.stage as string) ?? (frame.stage as string) ?? 'Normal';
  const beforeRanking = ((forecast.target_ranking as TargetRankingEntry[]) || (frame.target_ranking as TargetRankingEntry[]) || []) as TargetRankingEntry[];

  const removed: NetworkEdge[] = [];
  const remaining: NetworkEdge[] = [];
  for (const e of edges) {
    if (e.source === host || e.target === host) {
      const r = { ...e, status: 'removed', style: 'muted', reason: `Isolated host ${host} - active edge removed/down-weighted` } as unknown as NetworkEdge;
      removed.push(r);
    } else {
      remaining.push(e);
    }
  }
  // Re-rank after
  const afterRanking = rankTargetsOffline(nodes, remaining, frame.frame, beforeSmoothed, beforeSlope);

  // Determine factor based on host rank before
  let factor: number;
  const hostEntry = beforeRanking.find((r) => r.host === host || r.alias === host);
  if (hostEntry) {
    const rank = hostEntry.rank ?? 10;
    if (rank === 1) factor = 0.55;
    else if (rank <= 3) factor = 0.65;
    else if (rank <= 5) factor = 0.75;
    else factor = 0.85;
  } else {
    factor = 0.9;
  }
  // host risk modulation
  const hostNode = nodes.find((n) => ((n.id as string) || (n.alias as string)) === host);
  const hostRisk = hostNode ? ((hostNode.risk as number) ?? beforeRaw) : beforeRaw;
  if (hostRisk > threshold) factor = Math.max(0.45, factor - 0.05);

  const afterRaw = Math.max(0, Math.min(1, beforeRaw * factor));
  const afterSmoothed = Math.max(0, Math.min(1, beforeSmoothed * factor + 0.02 * (1 - factor)));
  const afterSlope = beforeSlope * factor * 0.5 - 0.005;
  const afterWarning = afterSmoothed > threshold && afterSlope > 1e-9;

  let afterStage = beforeStage as string;
  if (!afterWarning && afterRaw < threshold && afterSmoothed < threshold) afterStage = 'Normal';
  else if (afterStage === 'Impact/Disruption' && afterRaw < 0.3) afterStage = 'Credential Attack';
  else if (afterStage === 'Compromise/Infiltration' && afterRaw < 0.3) afterStage = 'Reconnaissance';

  const beforeEvidence = (forecast.evidence as string[]) || [];
  const afterEvidence = [...beforeEvidence, `Simulated isolation of ${host} - removed ${removed.length} active edges (simulation, not causal proof)`];
  let afterMitre = (forecast.mitre as unknown[]) || [];
  if (afterStage === 'Normal') afterMitre = [];

  const rawDelta = afterRaw - beforeRaw;
  const smoothedDelta = afterSmoothed - beforeSmoothed;
  const slopeDelta = afterSlope - beforeSlope;
  const riskReduction = beforeRaw > 0 ? ((beforeRaw - afterRaw) / beforeRaw) * 100 : 0;
  const limitations = 'Estimated simulated effect - not causal proof. Binary benign-versus-malicious risk only (learned); stage estimate is rule-derived evidence score; target ranking is NetworkX graph-ranked; isolation is simulated estimate - not causal proof; recalculated graph features and risk inputs via same pipeline; original replay unchanged.';
  const label = 'Estimated simulated effect - not causal proof';

  // Engine metadata from forecast
  const engineMeta = (forecast.engine_metadata as Record<string, unknown>) || {};

  return {
    scenario_id: 'cyberworld-replay-v1',
    frame_id: frame.frame,
    host,
    action: 'isolate_host',
    before: {
      raw_risk: beforeRaw,
      smoothed_risk: beforeSmoothed,
      slope: beforeSlope,
      warning: beforeWarning,
      stage: beforeStage,
      target_ranking: beforeRanking.slice(0, 5),
      evidence: beforeEvidence,
      mitre: (forecast.mitre as unknown) as TargetRankingEntry[] | undefined,
    } as unknown as import('../api/generated').SimulationBeforeAfter,
    after: {
      raw_risk: afterRaw,
      smoothed_risk: afterSmoothed,
      slope: afterSlope,
      warning: afterWarning,
      stage: afterStage,
      target_ranking: afterRanking.slice(0, 5),
      evidence: afterEvidence as unknown as string[],
      mitre: afterMitre as unknown as import('../api/generated').MitreTechnique[],
    } as unknown as import('../api/generated').SimulationBeforeAfter,
    removed_edges: removed,
    deltas: {
      raw_risk_delta: rawDelta,
      smoothed_risk_delta: smoothedDelta,
      slope_delta: slopeDelta,
      stage_changed: beforeStage !== afterStage,
      risk_reduction_percent: riskReduction,
    },
    limitations,
    label,
    message: label,
    engine_metadata: engineMeta as unknown as import('../api/generated').EngineMetadata,
    original_unchanged: true,
  } as SimulationResult;
}
