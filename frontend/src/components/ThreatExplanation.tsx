import { ShieldCheck, Activity, Target, FileText, Shield } from 'lucide-react';
import type { ScenarioFrame, EvaluationMetrics } from '../api/generated';

interface ThreatExplanationProps {
  frame: ScenarioFrame;
  metrics: EvaluationMetrics | null;
}

export function ThreatExplanation({ frame, metrics }: ThreatExplanationProps) {
  const signals = frame.signals;
  const forecast = frame.forecast;
  const topTarget = forecast.target_ranking?.[0];
  const isWarning = signals.warning;
  const riskLabel = isWarning ? 'Warning - learned risk above threshold' : signals.smoothed_risk > signals.threshold ? 'Elevated - learned risk above threshold' : 'Normal - learned risk below threshold';
  const measuredNote = metrics ? `Measured F1 macro ${(metrics.f1 as unknown as { macro: number }).macro?.toFixed(3) ?? ''} - not invented` : 'Measured metrics unavailable';

  return (
    <div className="w-full bg-navy-800 border border-navy-700 rounded-lg p-4 flex flex-col gap-3" data-testid="threat-explanation" role="region" aria-label="Threat explanation - data-derived">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          Threat Explanation - Data-derived
          <span className="text-[13px] font-normal text-gray-400">- concise, rule-based, graph-ranked, measured</span>
        </h3>
        <span className="text-[13px] px-2 py-0.5 rounded-full bg-navy-700 border border-navy-700 text-gray-400 font-mono">
          Frame {frame.frame} - {frame.timestamp} - {isWarning ? 'Early warning' : 'Baseline'}
        </span>
      </div>

      <p className="text-[13px] text-gray-400">
        Consolidated from the same replay engine that produces the 30-frame scenario (seed 42). Learned output is binary benign-versus-malicious risk only. Stage is rule-derived. Target is NetworkX graph-ranked. Ground truth gated until frame 20. Isolation is simulated - not causal proof.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Learned Risk */}
        <div className="bg-navy-700 rounded p-3 border border-navy-700 flex flex-col gap-1" data-testid="threat-risk">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-white">
            <Activity className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            Learned Risk - Binary
            <span className="ml-auto text-[13px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">Learned</span>
          </div>
          <div className="text-[13px] font-mono">
            <span className="text-gray-400">Raw:</span> <span className="text-cyan-400 font-bold">{signals.raw_risk.toFixed(3)}</span>{' '}
            <span className="text-gray-400">Smoothed (5-frame EWMA):</span> <span className="text-purple-400 font-bold">{signals.smoothed_risk.toFixed(3)}</span>{' '}
            <span className="text-gray-400">Slope:</span> <span className={signals.slope > 0 ? 'text-orange-400 font-bold' : 'text-gray-300'}>{signals.slope > 0 ? '+' : ''}{signals.slope.toFixed(4)}</span>
          </div>
          <div className="text-[13px] text-gray-400">
            Threshold {signals.threshold.toFixed(2)} - {riskLabel} - {isWarning ? 'Early warning active - before ground truth' : 'No warning - benign profile'} - <span className="text-cyan-400">{measuredNote}</span>
          </div>
          <div className="text-[13px] flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${isWarning ? 'bg-coral-400' : 'bg-cyan-400'}`} aria-hidden="true"></span>
            <span className={isWarning ? 'text-coral-400 font-bold' : 'text-cyan-400'}>{isWarning ? 'Warning - text+icon coral' : 'Normal - text+icon cyan'}</span>
            <span className="text-gray-500">- color not alone</span>
          </div>
        </div>

        {/* Rule-derived Stage */}
        <div className="bg-navy-700 rounded p-3 border border-navy-700 flex flex-col gap-1" data-testid="threat-stage">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-white">
            <FileText className="w-3.5 h-3.5 text-yellow-400" aria-hidden="true" />
            Stage - Rule-derived
            <span className="ml-auto text-[13px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Rule-derived estimate</span>
          </div>
          <div className="text-[13px]">
            <span className="text-gray-400">Current:</span> <span className="font-bold text-white px-2 py-0.5 rounded bg-navy-800 border border-navy-700">{forecast.stage}</span>{' '}
            {forecast.stage_evidence_score && <span className="text-gray-400">Evidence score: {String(forecast.stage_evidence_score).slice(0, 80)}</span>}
          </div>
          <div className="text-[13px] text-gray-400">
            Evidence: {forecast.evidence?.slice(0, 2).join(' - ') || 'No evidence - benign profile'} - deterministic observed evidence, not invented
          </div>
          <div className="text-[13px] text-gray-500">Stage logic: PortScan + port diversity - Reconnaissance; Patator + repeated auth - Credential Attack; Infiltration - Compromise; DoS/DDoS - Impact/Disruption</div>
        </div>

        {/* Graph-ranked Target */}
        <div className="bg-navy-700 rounded p-3 border border-navy-700 flex flex-col gap-1" data-testid="threat-target">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-white">
            <Target className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
            Target - Graph-ranked
            <span className="ml-auto text-[13px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">NetworkX graph-ranked</span>
          </div>
          {topTarget ? (
            <div className="text-[13px]">
              <span className="text-gray-400">Top:</span> <span className="font-mono font-bold text-purple-400">{topTarget.host}</span>{' '}
              <span className="text-gray-400">Score {topTarget.target_score.toFixed(2)}</span>{' '}
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500 text-[13px]">Rank #1</span>
            </div>
          ) : (
            <div className="text-[13px] text-gray-500">No target ranked - benign profile</div>
          )}
          <div className="text-[13px] text-gray-400">
            {topTarget ? `Incoming ${topTarget.incoming_activity} - novelty ${topTarget.edge_novelty.toFixed(2)} - trend ${topTarget.recent_risk_trend.toFixed(2)} - criticality ${topTarget.asset_criticality}` : 'Ranking not applicable at baseline'}
          </div>
          <div className="text-[13px] text-gray-500">Formula: suspicious incoming activity * edge novelty * recent risk trend * asset criticality - not a learned classifier</div>
          {forecast.predicted_path && (
            <div className="text-[13px] text-purple-400">
              Predicted path: {(forecast.predicted_path as unknown as { source: string; target: string }).source} - {(forecast.predicted_path as unknown as { source: string; target: string }).target} <span className="text-gray-500">- purple dashed - animated</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Observed Evidence */}
        <div className="bg-navy-700 rounded p-3 border border-navy-700 flex flex-col gap-1" data-testid="threat-evidence">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-white">
            <FileText className="w-3 h-3 text-cyan-400" aria-hidden="true" />
            Observed Evidence - Deterministic
            <span className="ml-auto text-[13px] px-1 py-0.5 rounded bg-slate-700 text-gray-300 border border-slate-600">Observed</span>
          </div>
          <ul className="text-[13px] text-gray-300 list-disc list-inside">
            {(forecast.evidence?.slice(0, 3) || ['No observed evidence at baseline - benign profile']).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <div className="text-[13px] text-gray-500">Global importance (if Random Forest): see Technical Proof - associative, not causal proof</div>
        </div>

        {/* MITRE */}
        <div className="bg-navy-700 rounded p-3 border border-navy-700 flex flex-col gap-1" data-testid="threat-mitre">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-white">
            <ShieldCheck className="w-3 h-3 text-amber-400" aria-hidden="true" />
            MITRE ATT&CK - Pinned
            <span className="ml-auto text-[13px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">v13.1</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(forecast.mitre?.slice(0, 4) || []).map((m) => (
              <span key={m.technique_id} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-navy-800 border border-navy-700 text-[13px]">
                <span className="font-mono font-bold text-white">{m.technique_id}</span>
                <span className="text-gray-300">{m.name}</span>
                <span className="text-[13px] text-gray-500 hidden sm:inline">- {m.confidence?.slice(0, 30)}</span>
              </span>
            ))}
            {(!forecast.mitre || forecast.mitre.length === 0) && <span className="text-[13px] text-gray-500">No MITRE mapping at baseline - Normal</span>}
          </div>
          <div className="text-[13px] text-gray-500">Techniques: T1046 Network Service Discovery, T1110 Brute Force, T1021 Remote Services, T1498 Network DoS - confidence wording requires analyst review</div>
        </div>
      </div>

      <div className="text-[13px] text-gray-500 bg-navy-900 rounded p-2 border border-navy-700">
        <span className="font-bold text-white">Why this matters:</span> At frame {frame.frame}, smoothed risk {signals.smoothed_risk.toFixed(3)} vs threshold {signals.threshold.toFixed(2)} with slope {signals.slope.toFixed(4)} indicates {isWarning ? 'positive trend - early warning before ground truth 20 - review stage and target' : 'stable - benign profile - no action yet'}. {topTarget ? `Top graph-ranked host ${topTarget.host} should be reviewed for preventive simulation - Estimated simulated effect, not causal proof.` : ''} Ground truth {frame.ground_truth.revealed ? `revealed: ${frame.ground_truth.event} - ${frame.ground_truth.attack_type ?? ''}` : 'still gated - hidden until 20 - leakage-safe'}.
      </div>

      <div className="flex flex-wrap gap-2 text-[13px]">
        <span className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">Learned: binary risk only</span>
        <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">Rule-derived: stage estimate</span>
        <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">Graph-ranked: NetworkX target</span>
        <span className="px-2 py-1 rounded bg-slate-700 text-gray-300 border border-slate-600">Measured: F1 and latency from metrics.json</span>
        <span className="px-2 py-1 rounded bg-orange-500/10 text-orange-400 border border-orange-500/30">Simulated: not causal proof</span>
      </div>
    </div>
  );
}
