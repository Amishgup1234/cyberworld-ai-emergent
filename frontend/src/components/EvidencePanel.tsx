import { Eye, BarChart3, AlertCircle, Info } from 'lucide-react';
import type { EvaluationMetrics } from '../api/generated';

interface EvidencePanelProps {
  evidence: string[];
  metrics: EvaluationMetrics | null;
}

export function EvidencePanel({ evidence, metrics }: EvidencePanelProps) {
  const topFeatures = metrics?.feature_importance?.top_features as Array<{ feature: string; importance: number }> | undefined;
  const importanceDesc = metrics?.feature_importance?.description || 'Global Random Forest feature_importances_ - not causal';

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg p-4 flex flex-col gap-4" data-testid="evidence-panel">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <Eye className="w-4 h-4 text-cyan-400" aria-hidden="true" />
        Explainability
        <span className="text-[13px] font-normal text-gray-400">- separate observed and importance sections</span>
      </h3>

      {/* Observed evidence - distinct section */}
      <div className="flex flex-col gap-2" data-testid="observed-evidence-section" aria-labelledby="observed-evidence-heading">
        <div className="flex items-center gap-2">
          <span id="observed-evidence-heading" className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500 text-[13px] font-medium">
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            Observed Evidence
          </span>
          <span className="text-[13px] text-gray-500">Deterministic - per frame - for active warning</span>
        </div>
        <p className="text-[13px] text-gray-500 flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>Deterministic observed evidence for active warning per frame (port diversity, SYN, predicted ratio model-predicted, bytes/s, etc.). Model-predicted and observable only, never raw Label. Never described as causality.</span>
        </p>
        <ul className="space-y-1.5 max-h-40 overflow-auto pr-1" data-testid="observed-evidence-list">
          {evidence.length === 0 ? (
            <li className="text-[13px] text-gray-500">No evidence - normal frame - observed benign activity</li>
          ) : (
            evidence.map((e, idx) => (
              <li
                key={idx}
                className="text-[13px] text-gray-200 bg-navy-700 border border-navy-700 rounded px-2.5 py-1.5 flex items-start gap-2"
                data-testid={`evidence-item-${idx}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0" aria-hidden="true"></span>
                <span>{e}</span>
              </li>
            ))
          )}
        </ul>
        <p className="text-[13px] text-cyan-400/70">Observed - cyan - deterministic evidence from current frame only - distinguishes observed from predicted</p>
      </div>

      {/* Global model importance - distinct section */}
      <div className="flex flex-col gap-2 border-t border-navy-700 pt-3" data-testid="global-importance-section" aria-labelledby="global-importance-heading">
        <div className="flex items-center gap-2">
          <span id="global-importance-heading" className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/20 text-purple-400 border border-purple-500 text-[13px] font-medium">
            <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
            Global Model Importance
          </span>
          <span className="text-[13px] text-gray-500">Random Forest - not causal - separate from observed evidence</span>
        </div>
        <p className="text-[13px] text-gray-500">{importanceDesc} - Never describe importance as causality. This is global model importance, not per-frame causal proof.</p>

        {topFeatures && topFeatures.length > 0 ? (
          <div className="space-y-1" data-testid="importance-list">
            {topFeatures.slice(0, 6).map((f, idx) => (
              <div key={f.feature} className="flex items-center gap-2 text-[13px]" data-testid={`importance-item-${idx}`}>
                <span className="w-6 text-gray-500 font-mono">{idx + 1}.</span>
                <span className="flex-1 text-gray-300 truncate">{f.feature}</span>
                <span className="font-mono text-purple-400">{f.importance.toFixed(3)}</span>
                <div className="w-16 h-1.5 bg-navy-700 rounded overflow-hidden" aria-hidden="true">
                  <div
                    className="h-full bg-purple-500"
                    style={{ width: `${Math.min(100, f.importance * 400)}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="text-[13px] text-gray-500">Showing top 6 of {topFeatures.length} - full importance in artifacts/metrics.json - not causal</p>
          </div>
        ) : (
          <p className="text-[13px] text-gray-500">Importance not available - Logistic Regression would show standardized coefficient contributions - also not causal</p>
        )}

        <div className="text-[13px] text-orange-400 bg-orange-500/10 border border-orange-500/30 rounded p-2 flex gap-2" data-testid="importance-disclaimer">
          <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <div>
            <span className="font-bold">Important - not causal proof:</span> Importance is associative, not causal proof. Stage and ranking are rule-derived / graph-ranked. Observed evidence is deterministic per-frame. Never describe importance as causality.
          </div>
        </div>
      </div>
    </div>
  );
}
