import { Target, Crown, Network } from 'lucide-react';
import type { TargetRankingEntry } from '../api/generated';

interface TargetPanelProps {
  ranking: TargetRankingEntry[];
  predictedPath: Record<string, unknown> | null | undefined;
}

export function TargetPanel({ ranking, predictedPath }: TargetPanelProps) {
  const top = ranking[0];

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg p-4 flex flex-col gap-3" data-testid="target-panel">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <Target className="w-4 h-4 text-purple-400" aria-hidden="true" />
        Target Ranking - NetworkX Graph-Ranked
        <span className="text-[13px] font-normal text-gray-400">- not learned classifier</span>
      </h3>

      {top ? (
        <div className="bg-navy-700 border border-purple-500/30 rounded p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-purple-400" aria-hidden="true" />
            <span className="text-sm font-bold text-white">
              Top target: {top.host}
            </span>
            <span className="text-[13px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500">
              Rank #{top.rank ?? 1} - graph-ranked
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <div className="flex flex-col">
              <span className="text-gray-400">Target score</span>
              <span className="font-mono font-bold text-purple-400">{top.target_score.toFixed(2)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-400">Criticality</span>
              <span className={`font-medium ${top.asset_criticality === 'high' ? 'text-coral-400' : top.asset_criticality === 'medium' ? 'text-orange-400' : 'text-cyan-400'}`}>
                {top.asset_criticality} ({top.criticality_numeric ?? '-'})
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-400">Incoming activity</span>
              <span className="font-mono text-white">{top.incoming_activity}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-400">Edge novelty</span>
              <span className="font-mono text-white">{top.edge_novelty.toFixed(2)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-400">Risk trend</span>
              <span className="font-mono text-white">{top.recent_risk_trend.toFixed(2)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-400">Role</span>
              <span className="text-white">{top.role ?? 'workstation'}</span>
            </div>
          </div>

          {predictedPath && (
            <div className="text-[13px] bg-purple-500/10 border border-purple-500/30 rounded p-2">
              <div className="flex items-center gap-1.5 text-purple-400 font-medium">
                <Network className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Predicted path - purple dashed</span>
              </div>
              <div className="font-mono text-gray-300 mt-1">
                {(predictedPath.source as string) || '?'} -&gt; {(predictedPath.target as string) || top.host}{' '}
                <span className="text-purple-400">[{(predictedPath.protocol as string) || 'TCP'}]</span>
              </div>
              <div className="text-gray-500 text-[13px]">Style: dashed - model prediction, not observed</div>
            </div>
          )}

          <p className="text-[13px] text-gray-500">
            Score = suspicious incoming * edge novelty * recent risk trend * asset criticality
          </p>
        </div>
      ) : (
        <div className="text-[13px] text-gray-400">No ranking available</div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-medium text-gray-400">Ranking list (top {Math.min(5, ranking.length)}):</span>
        <div className="max-h-32 overflow-auto flex flex-col gap-1 pr-1">
          {ranking.slice(0, 5).map((entry) => (
            <div
              key={entry.host}
              className={`flex items-center justify-between text-[13px] px-2 py-1 rounded border ${
                entry.rank === 1 ? 'bg-purple-500/10 border-purple-500/30' : 'bg-navy-700 border-navy-700'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[13px] font-bold ${entry.rank === 1 ? 'bg-purple-500 text-white' : 'bg-navy-800 text-gray-400 border border-navy-700'}`}>
                  {entry.rank}
                </span>
                <span className="font-mono text-white">{entry.host}</span>
                <span className={`text-[13px] px-1.5 py-0.5 rounded ${entry.asset_criticality === 'high' ? 'bg-coral-500/20 text-coral-400' : entry.asset_criticality === 'medium' ? 'bg-orange-500/20 text-orange-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                  {entry.asset_criticality}
                </span>
              </span>
              <span className="font-mono text-gray-300">{entry.target_score.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <span className="text-[13px] text-gray-500">Graph-ranked via NetworkX - not a learned target classifier</span>
      </div>
    </div>
  );
}
