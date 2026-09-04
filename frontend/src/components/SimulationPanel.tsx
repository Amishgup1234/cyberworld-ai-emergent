import { useState, useEffect } from 'react';
import { ShieldAlert, Zap, ArrowLeftRight, Trash2, Activity, TrendingDown, X } from 'lucide-react';
import type { NetworkNode, TargetRankingEntry, SimulationResult, ScenarioFrame } from '../api/generated';
import { fetchSimulateIsolate } from '../api/client';
import { offlineSimulateIsolation } from '../utils/simulation';

interface SimulationPanelProps {
  scenarioId: string;
  frameId: number;
  nodes: NetworkNode[];
  targetRanking: TargetRankingEntry[];
  currentFrameData?: ScenarioFrame | null;
  mode?: 'api' | 'offline' | 'loading';
  simulationResult: SimulationResult | null;
  simulationLoading: boolean;
  simulationError: string | null;
  onSimulateResult: (res: SimulationResult | null, host: string | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (err: string | null) => void;
}

export function SimulationPanel({
  scenarioId,
  frameId,
  nodes,
  targetRanking,
  currentFrameData,
  mode = 'api',
  simulationResult,
  simulationLoading,
  simulationError,
  onSimulateResult,
  onLoadingChange,
  onErrorChange,
}: SimulationPanelProps) {
  const [selectedHost, setSelectedHost] = useState<string>('');

  // Auto-select suspicious host from ranking if not set
  useEffect(() => {
    if (!selectedHost && targetRanking && targetRanking.length > 0) {
      const top = targetRanking[0]?.host;
      if (top && nodes.some((n) => n.id === top)) {
        setSelectedHost(top);
      }
    }
  }, [targetRanking, nodes, selectedHost]);

  // Also when nodes change, ensure selected still valid
  useEffect(() => {
    if (selectedHost && !nodes.some((n) => n.id === selectedHost)) {
      setSelectedHost(targetRanking[0]?.host || nodes[0]?.id || '');
    }
  }, [nodes, targetRanking, selectedHost]);

  const handleSimulate = async () => {
    if (!selectedHost) {
      onErrorChange('Please select a host to isolate');
      return;
    }
    onLoadingChange(true);
    onErrorChange(null);
    try {
      // If offline mode and we have frame data, use offline simulation directly
      if (mode === 'offline' && currentFrameData) {
        const offlineRes = offlineSimulateIsolation(currentFrameData, selectedHost);
        onSimulateResult(offlineRes, selectedHost);
        onLoadingChange(false);
        return;
      }
      // Try API first
      try {
        const res = await fetchSimulateIsolate(scenarioId, frameId, selectedHost, 'isolate_host');
        onSimulateResult(res, selectedHost);
      } catch (apiErr) {
        // Fallback to offline simulation if API fails and we have frame data
        if (currentFrameData) {
          const offlineRes = offlineSimulateIsolation(currentFrameData, selectedHost);
          onSimulateResult(offlineRes, selectedHost);
        } else {
          throw apiErr;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onErrorChange(msg);
      onSimulateResult(null, null);
    } finally {
      onLoadingChange(false);
    }
  };

  const handleClear = () => {
    onSimulateResult(null, null);
    onErrorChange(null);
  };

  const before = simulationResult?.before;
  const after = simulationResult?.after;
  const deltas = simulationResult?.deltas;

  return (
    <div className="bg-navy-800 border border-orange-500/30 rounded-lg p-4 flex flex-col gap-3" data-testid="simulation-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-400" aria-hidden="true" />
          What-if Isolation - Simulated
          <span className="text-[13px] font-normal text-orange-400 bg-orange-500/20 px-2 py-0.5 rounded border border-orange-500">Orange - simulation</span>
        </h3>
        {simulationResult && (
          <button
            onClick={handleClear}
            className="inline-flex items-center gap-1 text-[13px] px-2 py-1 rounded bg-navy-700 text-gray-400 border border-navy-700 hover:text-white hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Clear simulation"
          >
            <X className="w-3 h-3" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      <p className="text-[13px] text-gray-500">
        Clone the selected frame, remove or down-weight suspicious host&apos;s active edges, recalculate graph features and risk inputs, re-run same pipeline. Original replay unchanged - immutable.
      </p>

      {/* Host selection control */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end bg-navy-700 rounded p-3 border border-navy-700">
        <div className="flex flex-col gap-1 flex-1">
          <label htmlFor="host-select" className="text-[13px] font-medium text-gray-300">
            Host to isolate - suspicious host from ranking highlighted
          </label>
          <select
            id="host-select"
            data-testid="host-select"
            value={selectedHost}
            onChange={(e) => setSelectedHost(e.target.value)}
            className="w-full bg-navy-800 border border-navy-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Select host to isolate"
          >
            <option value="">-- Select host --</option>
            {nodes.map((n) => {
              const isTop = targetRanking[0]?.host === n.id;
              const isSuspicious = n.observed_state === 'suspicious' || targetRanking.some((r) => r.host === n.id && r.rank === 1);
              return (
                <option key={n.id} value={n.id}>
                  {n.id} - {n.role} - {n.criticality} {isTop ? '(Top ranked - most suspicious)' : ''} {isSuspicious ? '- suspicious' : '- observed'}
                </option>
              );
            })}
          </select>
          <span className="text-[13px] text-gray-500">
            Host selection - keyboard accessible - {nodes.length} hosts in current frame - use arrow keys and Enter
          </span>
        </div>
        <button
          onClick={handleSimulate}
          disabled={simulationLoading || !selectedHost}
          data-testid="simulate-btn"
          aria-label="Isolate selected host (simulated)"
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed border border-orange-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-navy-800"
        >
          <Zap className="w-4 h-4" aria-hidden="true" />
          {simulationLoading ? 'Simulating...' : 'Isolate Host (Simulated)'}
        </button>
      </div>

      {simulationError && (
        <div className="text-[13px] text-coral-400 bg-coral-500/10 border border-coral-500 rounded p-2" role="alert" data-testid="simulation-error">
          Simulation error: {simulationError}
        </div>
      )}

      {/* Before/After comparison */}
      {simulationResult && before && after && deltas && (
        <div className="flex flex-col gap-3 border-t border-navy-700 pt-3" data-testid="simulation-comparison">
          {/* Prominent simulated label */}
          <div className="bg-orange-500/10 border border-orange-500 rounded p-2 text-center" data-testid="simulation-label">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-orange-400">
              <Activity className="w-4 h-4" aria-hidden="true" />
              {simulationResult.label}
            </span>
            <p className="text-[13px] text-orange-400/80 mt-1">Simulated estimate - not causal proof - recalculated graph features and risk inputs via same pipeline - original replay unchanged</p>
            <p className="text-[13px] text-gray-500 mt-1">{simulationResult.limitations}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Before */}
            <div className="bg-navy-700 border border-navy-700 rounded p-3 flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-cyan-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" aria-hidden="true"></span>
                Before Isolation - Observed/Predicted
                <span className="ml-auto text-gray-500">Frame {simulationResult.frame_id}</span>
              </h4>
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <div className="bg-navy-800 rounded p-2">
                  <span className="text-gray-400">Raw risk - learned</span>
                  <div className="font-mono font-bold text-cyan-400">{before.raw_risk.toFixed(3)}</div>
                </div>
                <div className="bg-navy-800 rounded p-2">
                  <span className="text-gray-400">Smoothed - 5-frame EWMA</span>
                  <div className="font-mono font-bold text-purple-400">{before.smoothed_risk.toFixed(3)}</div>
                </div>
                <div className="bg-navy-800 rounded p-2">
                  <span className="text-gray-400">Slope</span>
                  <div className="font-mono text-white">{before.slope.toFixed(4)}</div>
                </div>
                <div className="bg-navy-800 rounded p-2">
                  <span className="text-gray-400">Warning</span>
                  <div className={`font-bold ${before.warning ? 'text-coral-400' : 'text-cyan-400'}`}>{before.warning ? 'Active' : 'Not active'}</div>
                </div>
                <div className="bg-navy-800 rounded p-2 col-span-2">
                  <span className="text-gray-400">Stage</span>
                  <div className="font-bold text-white">{before.stage}</div>
                </div>
              </div>
              <div className="text-[13px]">
                <span className="text-gray-400">Top target (before):</span>{' '}
                <span className="font-mono text-purple-400">
                  {before.target_ranking && before.target_ranking.length > 0 ? `${before.target_ranking[0].host} - score ${before.target_ranking[0].target_score.toFixed(2)} - rank #${before.target_ranking[0].rank}` : 'None'}
                </span>
              </div>
            </div>

            {/* After */}
            <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3 flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-orange-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-400" aria-hidden="true"></span>
                After Isolation - Simulated
                <span className="ml-auto text-orange-400/70">Orange - simulated</span>
              </h4>
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <div className="bg-navy-800 rounded p-2 border border-orange-500/20">
                  <span className="text-gray-400">Raw risk - simulated</span>
                  <div className="font-mono font-bold text-orange-400">{after.raw_risk.toFixed(3)}</div>
                </div>
                <div className="bg-navy-800 rounded p-2 border border-orange-500/20">
                  <span className="text-gray-400">Smoothed - simulated</span>
                  <div className="font-mono font-bold text-orange-400">{after.smoothed_risk.toFixed(3)}</div>
                </div>
                <div className="bg-navy-800 rounded p-2 border border-orange-500/20">
                  <span className="text-gray-400">Slope - simulated</span>
                  <div className="font-mono text-orange-400">{after.slope.toFixed(4)}</div>
                </div>
                <div className="bg-navy-800 rounded p-2 border border-orange-500/20">
                  <span className="text-gray-400">Warning - simulated</span>
                  <div className={`font-bold ${after.warning ? 'text-coral-400' : 'text-cyan-400'}`}>{after.warning ? 'Active (still)' : 'Cleared'}</div>
                </div>
                <div className="bg-navy-800 rounded p-2 col-span-2 border border-orange-500/20">
                  <span className="text-gray-400">Stage - simulated</span>
                  <div className="font-bold text-orange-400">{after.stage}</div>
                  {before.stage !== after.stage && <span className="text-[13px] text-cyan-400">Stage changed</span>}
                </div>
              </div>
              <div className="text-[13px]">
                <span className="text-gray-400">Top target (after):</span>{' '}
                <span className="font-mono text-orange-400">
                  {after.target_ranking && after.target_ranking.length > 0 ? `${after.target_ranking[0].host} - score ${after.target_ranking[0].target_score.toFixed(2)} - rank #${after.target_ranking[0].rank}` : 'None'}
                </span>
                {before.target_ranking && after.target_ranking && before.target_ranking[0]?.host !== after.target_ranking[0]?.host && (
                  <span className="ml-2 text-[13px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded">Ranking changed</span>
                )}
              </div>
            </div>
          </div>

          {/* Deltas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[13px]" data-testid="simulation-deltas">
            <div className="bg-navy-700 rounded p-2 flex flex-col gap-1 border border-navy-700">
              <span className="text-gray-400 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" aria-hidden="true" />
                Raw delta
              </span>
              <span className={`font-mono font-bold ${deltas.raw_risk_delta < 0 ? 'text-cyan-400' : 'text-orange-400'}`}>
                {deltas.raw_risk_delta > 0 ? '+' : ''}
                {deltas.raw_risk_delta.toFixed(3)}
              </span>
              <span className="text-gray-500">After minus before</span>
            </div>
            <div className="bg-navy-700 rounded p-2 flex flex-col gap-1 border border-navy-700">
              <span className="text-gray-400">Smoothed delta</span>
              <span className={`font-mono font-bold ${deltas.smoothed_risk_delta < 0 ? 'text-cyan-400' : 'text-orange-400'}`}>
                {deltas.smoothed_risk_delta > 0 ? '+' : ''}
                {deltas.smoothed_risk_delta.toFixed(3)}
              </span>
              <span className="text-gray-500">EWMA change</span>
            </div>
            <div className="bg-navy-700 rounded p-2 flex flex-col gap-1 border border-navy-700">
              <span className="text-gray-400">Risk reduction</span>
              <span className="font-mono font-bold text-cyan-400">{deltas.risk_reduction_percent?.toFixed(1)}%</span>
              <span className="text-gray-500">Percent</span>
            </div>
            <div className="bg-navy-700 rounded p-2 flex flex-col gap-1 border border-navy-700">
              <span className="text-gray-400 flex items-center gap-1">
                <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                Stage changed
              </span>
              <span className={`font-bold ${deltas.stage_changed ? 'text-orange-400' : 'text-gray-400'}`}>{deltas.stage_changed ? 'Yes' : 'No'}</span>
              <span className="text-gray-500">Rule-derived</span>
            </div>
          </div>

          {/* Removed edges */}
          <div className="bg-navy-700 rounded p-2 border border-orange-500/20 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px]">
              <Trash2 className="w-3.5 h-3.5 text-orange-400" aria-hidden="true" />
              <span className="font-medium text-orange-400">
                Removed edges - muted orange - {simulationResult.removed_edges.length} edges
              </span>
              <span className="ml-auto text-gray-500">
                Host {simulationResult.host} isolated - active edges removed/down-weighted
              </span>
            </div>
            {simulationResult.removed_edges.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-auto pr-1">
                {simulationResult.removed_edges.slice(0, 10).map((e, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 text-[13px] px-2 py-1 rounded bg-orange-500/10 text-orange-400 border border-orange-500/30" data-testid={`removed-edge-${idx}`}>
                    <span className="w-2 h-0.5 bg-orange-400 opacity-50" aria-hidden="true"></span>
                    {e.source} -&gt; {e.target} ({e.protocol}) - muted - removed - simulated
                  </span>
                ))}
                {simulationResult.removed_edges.length > 10 && (
                  <span className="text-[13px] text-gray-500">+ {simulationResult.removed_edges.length - 10} more</span>
                )}
              </div>
            ) : (
              <span className="text-[13px] text-gray-500">No active edges for this host - isolated host had no edges in this frame (still simulated, reduced risk via ranking factor)</span>
            )}
            <p className="text-[13px] text-gray-500">
              Muted orange dashed edge for removed simulated path - text and icon accompany color - original replay unchanged (immutable)
            </p>
          </div>

          {/* Changed target ranking detail */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[13px]">
            <div className="bg-navy-700 rounded p-2 border border-navy-700">
              <span className="text-gray-400">Before ranking top 3</span>
              <div className="flex flex-col gap-1 mt-1">
                {before.target_ranking?.slice(0, 3).map((r: import('../api/generated').TargetRankingEntry) => (
                  <span key={r.host} className="font-mono text-gray-300">
                    #{r.rank} {r.host} - {r.target_score.toFixed(1)} - {r.asset_criticality} - incoming {r.incoming_activity}
                  </span>
                )) || <span className="text-gray-500">No ranking</span>}
              </div>
            </div>
            <div className="bg-orange-500/5 rounded p-2 border border-orange-500/20">
              <span className="text-orange-400">After ranking top 3 - simulated</span>
              <div className="flex flex-col gap-1 mt-1">
                {after.target_ranking?.slice(0, 3).map((r: import('../api/generated').TargetRankingEntry) => (
                  <span key={r.host} className="font-mono text-orange-300">
                    #{r.rank} {r.host} - {r.target_score.toFixed(1)} - {r.asset_criticality} - incoming {r.incoming_activity}
                  </span>
                )) || <span className="text-gray-500">No ranking</span>}
              </div>
            </div>
          </div>

          <div className="text-[13px] text-gray-500 text-center">
            Visual language: Orange for simulation - Muted edge for removed simulated path - Text labels and icons accompany every color state
          </div>
        </div>
      )}

      {!simulationResult && !simulationError && (
        <div className="text-[13px] text-gray-500 bg-navy-700 rounded p-2 border border-navy-700">
          Select a host and click Isolate to simulate. The simulation clones the frame, removes the host&apos;s active edges, recalculates graph features and risk inputs, re-runs the same pipeline, and shows before/after without modifying the original replay. <span className="text-orange-400">Estimated simulated effect - not causal proof.</span>
        </div>
      )}
    </div>
  );
}
