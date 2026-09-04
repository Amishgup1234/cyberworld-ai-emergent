import { BarChart3, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import type { EvaluationMetrics } from '../api/generated';

interface MetricsPanelProps {
  metrics: EvaluationMetrics | null;
}

export function MetricsPanel({ metrics }: MetricsPanelProps) {
  if (!metrics) {
    return (
      <div className="bg-navy-800 border border-navy-700 rounded-lg p-4" data-testid="metrics-panel">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          Model Evaluation - Held-Out Friday
        </h3>
        <p className="text-[13px] text-gray-500 mt-2">Metrics not available - run Phase 04 pipeline</p>
      </div>
    );
  }

  const f1Macro = metrics.f1?.macro ?? metrics.f1?.benign ?? 0;
  const f1Malicious = metrics.f1?.malicious ?? 0;
  const recallMal = metrics.recall?.malicious ?? metrics.recall?.attack_recall ?? 0;
  const fpr = metrics.fpr ?? 0;
  const prAuc = metrics.pr_auc ?? metrics.average_precision ?? 0;
  const rocAuc = metrics.roc_auc ?? 0;
  const p95 = metrics.latency?.p95_ms ?? metrics.latency?.p95 ?? 0;
  const cm = metrics.confusion_matrix;
  const gates = metrics.target_gates as Record<string, unknown> | undefined;
  const honest = metrics.honest_metrics as Record<string, unknown> | undefined;

  const gateF1 = (gates?.f1_ge_0_90 as boolean) ?? (gates?.['f1_ge_0.90'] as boolean) ?? false;
  const gateRecall = (gates?.recall_ge_0_90 as boolean) ?? (gates?.['recall_ge_0.90'] as boolean) ?? false;
  const gateFpr = (gates?.fpr_le_0_05 as boolean) ?? (gates?.['fpr_le_0.05'] as boolean) ?? false;
  const gateLatency = (gates?.latency_lt_500ms as boolean) ?? (gates?.['latency_lt_500ms'] as boolean) ?? false;

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg p-4 flex flex-col gap-3" data-testid="metrics-panel">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
        Model Evaluation - Measured - Friday Holdout
        <span className="text-[13px] font-normal text-gray-400">- honest, not inflated</span>
      </h3>

      <div className="grid grid-cols-3 gap-2 text-[13px]">
        <div className="bg-navy-700 rounded p-2 flex flex-col gap-1 border border-navy-700">
          <span className="text-gray-400">Binary F1 macro</span>
          <span className={`text-lg font-mono font-bold ${gateF1 ? 'text-cyan-400' : 'text-orange-400'}`}>{typeof f1Macro === 'number' ? f1Macro.toFixed(3) : String(f1Macro)}</span>
          <span className={`inline-flex items-center gap-1 text-[13px] ${gateF1 ? 'text-cyan-400' : 'text-orange-400'}`}>
            {gateF1 ? <CheckCircle className="w-3 h-3" aria-hidden="true" /> : <XCircle className="w-3 h-3" aria-hidden="true" />}
            Target &ge;0.90 {gateF1 ? 'PASS' : 'MISS - measured shown'}
          </span>
        </div>
        <div className="bg-navy-700 rounded p-2 flex flex-col gap-1 border border-navy-700">
          <span className="text-gray-400">Attack recall</span>
          <span className={`text-lg font-mono font-bold ${gateRecall ? 'text-cyan-400' : 'text-coral-400'}`}>
            {typeof recallMal === 'number' ? recallMal.toFixed(3) : String(recallMal)}
          </span>
          <span className={`inline-flex items-center gap-1 text-[13px] ${gateRecall ? 'text-cyan-400' : 'text-coral-400'}`}>
            {gateRecall ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            Target &ge;0.90 {gateRecall ? 'PASS' : 'MISS'}
          </span>
        </div>
        <div className="bg-navy-700 rounded p-2 flex flex-col gap-1 border border-navy-700">
          <span className="text-gray-400">False positive rate</span>
          <span className={`text-lg font-mono font-bold ${gateFpr ? 'text-cyan-400' : 'text-coral-400'}`}>{typeof fpr === 'number' ? fpr.toFixed(4) : String(fpr)}</span>
          <span className={`inline-flex items-center gap-1 text-[13px] ${gateFpr ? 'text-cyan-400' : 'text-coral-400'}`}>
            {gateFpr ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            Target &le;0.05 {gateFpr ? 'PASS' : 'MISS'}
          </span>
        </div>
        <div className="bg-navy-700 rounded p-2 flex flex-col gap-1 border border-navy-700">
          <span className="text-gray-400">F1 malicious</span>
          <span className="text-lg font-mono font-bold text-purple-400">{typeof f1Malicious === 'number' ? f1Malicious.toFixed(3) : String(f1Malicious)}</span>
          <span className="text-gray-500">Benign vs malicious</span>
        </div>
        <div className="bg-navy-700 rounded p-2 flex flex-col gap-1 border border-navy-700">
          <span className="text-gray-400">PR-AUC</span>
          <span className="text-lg font-mono font-bold text-cyan-400">{typeof prAuc === 'number' ? prAuc.toFixed(3) : String(prAuc)}</span>
          <span className="text-gray-500">Average precision</span>
        </div>
        <div className="bg-navy-700 rounded p-2 flex flex-col gap-1 border border-navy-700">
          <span className="text-gray-400">ROC-AUC</span>
          <span className="text-lg font-mono font-bold text-cyan-400">{typeof rocAuc === 'number' ? rocAuc.toFixed(3) : String(rocAuc)}</span>
          <span className="text-gray-500">Discrimination</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div className="bg-navy-700 rounded p-2.5 flex flex-col gap-1 border border-navy-700">
          <span className="text-gray-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            Latency p95
          </span>
          <span className={`text-lg font-mono font-bold ${gateLatency ? 'text-cyan-400' : 'text-orange-400'}`}>{typeof p95 === 'number' ? p95.toFixed(1) : String(p95)} ms</span>
          <span className={`inline-flex items-center gap-1 ${gateLatency ? 'text-cyan-400' : 'text-orange-400'}`}>
            {gateLatency ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            Target &lt;500ms {gateLatency ? 'PASS' : 'MISS'}
          </span>
          <span className="text-gray-500">Local forecast API - measured</span>
        </div>
        <div className="bg-navy-700 rounded p-2.5 flex flex-col gap-1 border border-navy-700">
          <span className="text-gray-400">Confusion matrix 2x2</span>
          {cm && cm.length === 2 ? (
            <div className="grid grid-cols-2 gap-1 font-mono text-[13px]">
              <span className="text-gray-500">TN</span>
              <span className="text-white font-bold">{cm[0][0]}</span>
              <span className="text-gray-500">FP</span>
              <span className="text-coral-400 font-bold">{cm[0][1]}</span>
              <span className="text-gray-500">FN</span>
              <span className="text-orange-400 font-bold">{cm[1][0]}</span>
              <span className="text-gray-500">TP</span>
              <span className="text-cyan-400 font-bold">{cm[1][1]}</span>
            </div>
          ) : (
            <span className="text-gray-500">Not available</span>
          )}
          <span className="text-gray-500">[[TN,FP],[FN,TP]] - honest</span>
        </div>
      </div>

      {honest && (
        <div className="text-[13px] text-gray-400 bg-navy-700 rounded p-2 border border-navy-700">
          <span className="font-medium text-gray-300">Honest metrics:</span>{' '}
          {Object.entries(honest)
            .slice(0, 4)
            .map(([k, v]) => `${k} ${typeof v === 'number' ? (v as number).toFixed(3) : String(v)}`)
            .join(' - ')}
        </div>
      )}

      <div className="bg-orange-500/10 border border-orange-500/30 rounded p-2.5 flex gap-2">
        <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-[13px]">
          <span className="font-bold text-orange-400">Claim limitations - must be visible:</span>
          <p className="text-gray-300 mt-1">{metrics.claim_limitations || metrics.limitations || 'Binary benign-versus-malicious risk only (learned); stage estimate is rule-derived evidence score; target ranking is NetworkX graph-ranked; isolation is simulated estimate - not causal proof'}</p>
          <p className="text-gray-500 mt-1">If a target is missed, UI displays measured value and removes claim that implies target was achieved.</p>
        </div>
      </div>

      <div className="text-[13px] text-gray-500">
        Samples: train Tue+Wed {metrics.samples?.train} - validation Thu {metrics.samples?.validation} - test Fri {metrics.samples?.test} - Monday benign baseline only - seed 42 deterministic
      </div>
    </div>
  );
}
