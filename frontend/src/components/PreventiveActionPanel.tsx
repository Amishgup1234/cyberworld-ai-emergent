import { useState } from 'react';
import { ShieldCheck, Zap, ArrowLeftRight, Trash2, Activity } from 'lucide-react';
import type { TargetRankingEntry, SimulationResult, ScenarioFrame, NetworkNode } from '../api/generated';
import { fetchSimulateIsolate } from '../api/client';
import { offlineSimulateIsolation } from '../utils/simulation';

interface PreventiveActionPanelProps {
  targetRanking: TargetRankingEntry[];
  scenarioId: string;
  frameId: number;
  currentFrameData: ScenarioFrame | null | undefined;
  nodes: NetworkNode[];
  mode: 'api' | 'offline' | 'loading';
  simulationResult: SimulationResult | null;
  simulationHost: string | null; // kept for API compat, displayed via simulationResult.host
  simulationLoading: boolean;
  simulationError: string | null;
  onSimulateResult: (res: SimulationResult | null, host: string | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (err: string | null) => void;
}

export function PreventiveActionPanel({
  targetRanking,
  scenarioId,
  frameId,
  currentFrameData,
  nodes: _nodes,
  mode,
  simulationResult,
  simulationHost: _simulationHost,
  simulationLoading,
  simulationError,
  onSimulateResult,
  onLoadingChange,
  onErrorChange,
}: PreventiveActionPanelProps) {
  const [localHost, setLocalHost] = useState<string>('');

  const recommended = targetRanking && targetRanking.length > 0 ? targetRanking[0] : null;
  const selectedHost = localHost || recommended?.host || '';

  const handleSimulate = async () => {
    const host = selectedHost;
    if (!host) {
      onErrorChange('No host selected for preventive action');
      return;
    }
    onLoadingChange(true);
    onErrorChange(null);
    try {
      if (mode === 'offline' && currentFrameData) {
        const offlineRes = offlineSimulateIsolation(currentFrameData, host);
        onSimulateResult(offlineRes, host);
        onLoadingChange(false);
        return;
      }
      try {
        const res = await fetchSimulateIsolate(scenarioId, frameId, host, 'isolate_host');
        onSimulateResult(res, host);
      } catch (apiErr) {
        if (currentFrameData) {
          const offlineRes = offlineSimulateIsolation(currentFrameData, host);
          onSimulateResult(offlineRes, host);
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
    setLocalHost('');
  };

  const before = simulationResult?.before;
  const after = simulationResult?.after;
  const deltas = simulationResult?.deltas;

  return (
    <div className="w-full bg-navy-800 border border-orange-500/30 rounded-lg p-4 flex flex-col gap-3" data-testid="preventive-action-panel">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-orange-400" aria-hidden="true" />
        <h3 className="text-sm font-bold text-white">Preventive Action - Recommended</h3>
        <span className="ml-auto text-[13px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500">Containment</span>
      </div>

      <p className="text-[13px] text-gray-400">
        Top graph-ranked host is recommended for preventive simulation. One prominent control uses the existing API/offline isolation pipeline - clones frame, removes host edges, re-runs same pipeline - original replay immutable.
      </p>

      {/* Recommended host */}
      {recommended ? (
        <div className="bg-navy-700 rounded p-3 border border-orange-500/20" data-testid="preventive-recommended">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-white">Recommended target:</span>
            <span className="font-mono font-bold text-orange-400" data-testid="preventive-recommended-host">{recommended.host}</span>
            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500 text-[13px]">Rank #1</span>
            <span className="text-[13px] text-gray-400">Score {recommended.target_score.toFixed(2)}</span>
          </div>
          <div className="text-[13px] text-gray-400 mt-1">
            Incoming {recommended.incoming_activity} - novelty {recommended.edge_novelty.toFixed(2)} - trend {recommended.recent_risk_trend.toFixed(2)} - criticality {recommended.asset_criticality} - NetworkX graph-ranked - not a learned classifier
          </div>
          <div className="text-[13px] text-gray-500 mt-1">
            Host selection is data-derived from target_ranking - safe alias only - no raw IP. You may override via dropdown, but recommended host is pre-selected.
          </div>
          <label htmlFor="preventive-host-select" className="sr-only">Preventive host select</label>
          <select
            id="preventive-host-select"
            data-testid="preventive-host-select"
            value={selectedHost}
            onChange={(e) => setLocalHost(e.target.value)}
            className="mt-2 w-full bg-navy-800 border border-navy-700 text-white text-[13px] rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            aria-label="Preventive host select - recommended top ranked"
          >
            {targetRanking.map((r) => (
              <option key={r.host} value={r.host}>
                {r.host} - score {r.target_score.toFixed(1)} - {r.asset_criticality} - rank #{r.rank}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="text-[13px] text-gray-500 bg-navy-700 rounded p-3 border border-navy-700" data-testid="preventive-no-target">
          No target ranked at this frame - benign profile - no preventive action recommended yet
        </div>
      )}

      {/* Prominent Simulate Preventive Action control */}
      <button
        onClick={handleSimulate}
        disabled={simulationLoading || !selectedHost}
        data-testid="simulate-preventive-btn"
        aria-label="Simulate Preventive Action - isolate recommended host"
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed border border-orange-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 shadow-lg shadow-orange-500/20"
      >
        <Zap className="w-4 h-4" aria-hidden="true" />
        {simulationLoading ? 'Simulating Preventive Action...' : 'Simulate Preventive Action'}
      </button>
      <p className="text-[13px] text-gray-500 text-center">One analyst action - uses existing API/offline isolation pipeline - Estimated simulated effect - not causal proof</p>

      {simulationError && (
        <div className="text-[13px] text-coral-400 bg-coral-500/10 border border-coral-500 rounded p-2" role="alert" data-testid="preventive-error">
          Preventive simulation error: {simulationError}
        </div>
      )}

      {/* Single result card with all required fields */}
      {simulationResult && before && after && deltas && (
        <div className="bg-navy-700 border border-orange-500/30 rounded-lg p-4 flex flex-col gap-3" data-testid="preventive-result-card">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-400" aria-hidden="true" />
              Containment Result - Before/After
              <span className="text-[13px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500">Estimated simulated effect - not causal proof</span>
            </h4>
            <button
              onClick={handleClear}
              className="text-[13px] px-2 py-1 rounded bg-navy-800 border border-navy-700 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
              aria-label="Clear preventive result"
              data-testid="preventive-clear-btn"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <div className="bg-navy-800 rounded p-2 border border-navy-700">
              <span className="text-gray-400">Before - Raw risk (learned)</span>
              <div className="font-mono font-bold text-cyan-400" data-testid="preventive-before-raw">{before.raw_risk.toFixed(3)}</div>
            </div>
            <div className="bg-orange-500/10 rounded p-2 border border-orange-500/20">
              <span className="text-gray-400">After - Raw risk (simulated)</span>
              <div className="font-mono font-bold text-orange-400" data-testid="preventive-after-raw">{after.raw_risk.toFixed(3)}</div>
            </div>
            <div className="bg-navy-800 rounded p-2 border border-navy-700">
              <span className="text-gray-400">Before - Smoothed</span>
              <div className="font-mono font-bold text-purple-400" data-testid="preventive-before-smoothed">{before.smoothed_risk.toFixed(3)}</div>
            </div>
            <div className="bg-orange-500/10 rounded p-2 border border-orange-500/20">
              <span className="text-gray-400">After - Smoothed</span>
              <div className="font-mono font-bold text-orange-400" data-testid="preventive-after-smoothed">{after.smoothed_risk.toFixed(3)}</div>
            </div>
            <div className="bg-navy-800 rounded p-2 border border-navy-700">
              <span className="text-gray-400">Before - Warning</span>
              <div className={`font-bold ${before.warning ? 'text-coral-400' : 'text-cyan-400'}`} data-testid="preventive-before-warning">{before.warning ? 'Active' : 'Not active'}</div>
            </div>
            <div className="bg-orange-500/10 rounded p-2 border border-orange-500/20">
              <span className="text-gray-400">After - Warning</span>
              <div className={`font-bold ${after.warning ? 'text-coral-400' : 'text-cyan-400'}`} data-testid="preventive-after-warning">{after.warning ? 'Active' : 'Cleared'}</div>
            </div>
            <div className="bg-navy-800 rounded p-2 border border-navy-700">
              <span className="text-gray-400">Before - Stage</span>
              <div className="font-bold text-white" data-testid="preventive-before-stage">{before.stage}</div>
            </div>
            <div className="bg-orange-500/10 rounded p-2 border border-orange-500/20">
              <span className="text-gray-400">After - Stage</span>
              <div className="font-bold text-orange-400" data-testid="preventive-after-stage">{after.stage}</div>
              {before.stage !== after.stage && <span className="text-[13px] text-cyan-400" data-testid="preventive-stage-changed">Stage changed</span>}
            </div>
            <div className="bg-navy-800 rounded p-2 border border-navy-700">
              <span className="text-gray-400">Before - Top target</span>
              <div className="font-mono text-purple-400" data-testid="preventive-before-target">{before.target_ranking?.[0]?.host ?? 'None'} - {before.target_ranking?.[0]?.target_score.toFixed(1) ?? ''}</div>
            </div>
            <div className="bg-orange-500/10 rounded p-2 border border-orange-500/20">
              <span className="text-gray-400">After - Top target</span>
              <div className="font-mono text-orange-400" data-testid="preventive-after-target">{after.target_ranking?.[0]?.host ?? 'None'} - {after.target_ranking?.[0]?.target_score.toFixed(1) ?? ''}</div>
              {before.target_ranking?.[0]?.host !== after.target_ranking?.[0]?.host && <span className="text-[13px] bg-cyan-500/20 text-cyan-400 px-1 py-0.5 rounded" data-testid="preventive-ranking-changed">Ranking changed</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[13px]" data-testid="preventive-deltas">
            <div className="bg-navy-800 rounded p-2 border border-navy-700">
              <span className="text-gray-400">Raw delta</span>
              <div className="font-mono font-bold text-cyan-400">{deltas.raw_risk_delta.toFixed(3)}</div>
            </div>
            <div className="bg-navy-800 rounded p-2 border border-navy-700">
              <span className="text-gray-400">Risk reduction</span>
              <div className="font-mono font-bold text-cyan-400" data-testid="preventive-risk-reduction">{deltas.risk_reduction_percent?.toFixed(1)}%</div>
            </div>
            <div className="bg-navy-800 rounded p-2 border border-navy-700">
              <span className="text-gray-400 flex items-center gap-1"><ArrowLeftRight className="w-3 h-3" aria-hidden="true" />Stage changed</span>
              <span className={`font-bold ${deltas.stage_changed ? 'text-orange-400' : 'text-gray-400'}`}>{deltas.stage_changed ? 'Yes' : 'No'}</span>
            </div>
          </div>

          <div className="bg-navy-700 rounded p-2 border border-orange-500/20 flex flex-col gap-2" data-testid="preventive-removed-edges">
            <div className="flex items-center gap-2 text-[13px]">
              <Trash2 className="w-3.5 h-3.5 text-orange-400" aria-hidden="true" />
              <span className="font-medium text-orange-400">Removed edges - {simulationResult.removed_edges.length} edges - muted orange dashed</span>
              <span className="ml-auto text-gray-500">Host {simulationResult.host} - frame {simulationResult.frame_id}</span>
            </div>
            {simulationResult.removed_edges.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-auto">
                {simulationResult.removed_edges.slice(0, 8).map((e, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 text-[13px] px-2 py-1 rounded bg-orange-500/10 text-orange-400 border border-orange-500/30">
                    {e.source} -&gt; {e.target} ({e.protocol}) - removed
                  </span>
                ))}
                {simulationResult.removed_edges.length > 8 && <span className="text-[13px] text-gray-500">+{simulationResult.removed_edges.length - 8} more</span>}
              </div>
            ) : (
              <span className="text-[13px] text-gray-500">No active edges for this host at this frame - still simulated via ranking factor</span>
            )}
          </div>

          <div className="text-[13px] text-gray-500 text-center">
            Original frame {simulationResult.frame_id} unchanged - immutable - {simulationResult.label}
          </div>
          <div className="text-[13px] text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded p-1.5 text-center">
            Estimated simulated effect - not causal proof - recalculated graph features and risk inputs via same pipeline
          </div>
        </div>
      )}

      {!simulationResult && (
        <div className="text-[13px] text-gray-500 bg-navy-700 rounded p-2 border border-navy-700" data-testid="preventive-placeholder">
          Select the recommended host and click Simulate Preventive Action to see containment comparison. One analyst action - original replay remains unchanged.
        </div>
      )}

      <div className="text-[13px] text-gray-500">
        Simulation uses {mode === 'api' ? 'API POST /simulate/isolate-host' : 'offline offlineSimulateIsolation'} - same engine, not hardcoded - safe host-N aliases only
      </div>
    </div>
  );
}
