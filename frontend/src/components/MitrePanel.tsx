import { Shield, ExternalLink } from 'lucide-react';
import type { MitreTechnique } from '../api/generated';

interface MitrePanelProps {
  techniques: MitreTechnique[];
  mitreVersion: string;
}

const techniqueMeta: Record<string, { tactic: string; color: string }> = {
  T1046: { tactic: 'Discovery', color: 'text-cyan-400 border-cyan-500 bg-cyan-500/10' },
  T1110: { tactic: 'Credential Access', color: 'text-orange-400 border-orange-500 bg-orange-500/10' },
  T1021: { tactic: 'Lateral Movement', color: 'text-purple-400 border-purple-500 bg-purple-500/10' },
  T1498: { tactic: 'Impact', color: 'text-coral-400 border-coral-500 bg-coral-500/10' },
};

export function MitrePanel({ techniques, mitreVersion }: MitrePanelProps) {
  const allTechniques: Array<{ id: string; name: string; rule: string; confidence: string; stage: string }> = [
    {
      id: 'T1046',
      name: 'Network Service Discovery',
      rule: 'Port diversity >15 plus predicted suspicious activity (model-predicted ratio >0.08)',
      confidence: 'possible - observed scanning only, not confirmed reconnaissance - requires analyst review',
      stage: 'Reconnaissance',
    },
    {
      id: 'T1110',
      name: 'Brute Force',
      rule: 'Predicted malicious ratio >0.25 plus repeated authentication-like activity (high SYN, port diversity)',
      confidence: 'likely - brute force pattern observed via predicted ratio, not confirmed compromise - requires analyst review',
      stage: 'Credential Attack',
    },
    {
      id: 'T1021',
      name: 'Remote Services',
      rule: 'Predicted ratio high + host-to-host activity + EWMA risk above threshold with positive trend',
      confidence: 'possible - infiltration-like pattern predicted, simulated estimate - not causal proof',
      stage: 'Compromise/Infiltration',
    },
    {
      id: 'T1498',
      name: 'Network Denial of Service',
      rule: 'High flow bytes/packets per second plus predicted malicious ratio >0.30',
      confidence: 'possible - volume anomaly predicted, not confirmed impact - requires analyst review',
      stage: 'Impact/Disruption',
    },
  ];

  const activeIds = new Set(techniques.map((t) => t.technique_id));

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg p-4 flex flex-col gap-3" data-testid="mitre-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-coral-400" aria-hidden="true" />
          MITRE ATT&CK Mapping
          <span className="text-[13px] font-normal text-gray-400">- versioned - local pinned</span>
        </h3>
        <span className="text-[13px] px-2 py-1 rounded bg-navy-700 text-gray-400 border border-navy-700 font-mono" data-testid="mitre-version">
          Pinned v{mitreVersion}
        </span>
      </div>

      <p className="text-[13px] text-gray-500">
        Pinned local MITRE ATT&CK mapping v{mitreVersion} - technique ID, name, evidence rule, cautious confidence. Not causal proof. Stored with technique ID, name, evidence rule, and cautious confidence wording.
      </p>

      <div className="grid gap-2">
        {allTechniques.map((tech) => {
          const isActive = activeIds.has(tech.id);
          const meta = techniqueMeta[tech.id];
          const techData = techniques.find((t) => t.technique_id === tech.id) || {
            technique_id: tech.id,
            name: tech.name,
            evidence_rule: tech.rule,
            confidence: tech.confidence,
            stage: tech.stage,
          };
          return (
            <div
              key={tech.id}
              className={`rounded border p-2.5 flex flex-col gap-1.5 ${isActive ? meta.color : 'bg-navy-700 border-navy-700 opacity-60'}`}
              data-testid={`mitre-${tech.id}`}
              aria-label={`MITRE ${tech.id} ${tech.name} - ${isActive ? 'active in current stage' : 'inactive'}`}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-mono font-bold text-[13px] px-1.5 py-0.5 rounded bg-white/10 border border-current">
                    {tech.id}
                  </span>
                  <span className="text-sm font-medium">{tech.name}</span>
                </span>
                <span className={`text-[13px] px-2 py-0.5 rounded-full border ${isActive ? 'bg-white/10 border-current' : 'bg-navy-800 border-navy-700 text-gray-400'}`}>
                  {isActive ? 'Active - observed' : 'Inactive'}
                </span>
              </div>

              <div className="text-[13px] text-gray-300" data-testid={`mitre-${tech.id}-rule`}>
                <span className="text-gray-400">Evidence rule:</span> {techData.evidence_rule}
              </div>
              <div className="text-[13px]" data-testid={`mitre-${tech.id}-confidence`}>
                <span className="text-gray-400">Confidence:</span>{' '}
                <span className="text-orange-400">{techData.confidence}</span>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-gray-400">Stage:</span>{' '}
                <span className="px-1.5 py-0.5 rounded bg-navy-800 text-gray-300 text-[13px]">{techData.stage || tech.stage}</span>
                <span className={`ml-auto text-[13px] flex items-center gap-1 ${isActive ? 'text-cyan-400' : 'text-gray-500'}`}>
                  {isActive ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-cyan-400" aria-hidden="true"></span> Requires analyst review
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-gray-500" aria-hidden="true"></span> No evidence in frame
                    </>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <a
        href="https://attack.mitre.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[13px] text-cyan-400 hover:text-cyan-300 mt-1"
      >
        <ExternalLink className="w-3 h-3" aria-hidden="true" />
        <span>ATT&CK v{mitreVersion} - local pinned mapping</span>
      </a>

      {techniques.length === 0 && (
        <div className="text-[13px] text-gray-400 bg-navy-700 rounded p-2 border border-navy-700">
          No MITRE techniques active in Normal stage - benign profile. Monitoring for scanning, brute force, or DoS patterns.
        </div>
      )}
    </div>
  );
}
