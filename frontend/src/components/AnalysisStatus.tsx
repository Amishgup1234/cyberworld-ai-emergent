import { ShieldCheck, Activity, AlertTriangle, FlaskConical, CheckCircle } from 'lucide-react';

export type AnalysisPhase = 'baseline' | 'emerging-risk' | 'early-warning' | 'response' | 'confirmation';

interface AnalysisStatusProps {
  phase: AnalysisPhase;
  warningActive: boolean;
  stage: string;
  targetHost: string | null;
  frameIndex: number;
  confirmationRevealed: boolean;
}

const phaseConfig: Record<AnalysisPhase, { label: string; desc: string; color: string; icon: typeof ShieldCheck }> = {
  baseline: {
    label: 'Baseline',
    desc: 'Normal network - benign profile',
    color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500',
    icon: ShieldCheck,
  },
  'emerging-risk': {
    label: 'Emerging risk',
    desc: 'Smoothed risk rising - slope positive',
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500',
    icon: Activity,
  },
  'early-warning': {
    label: 'Early warning',
    desc: 'Warning threshold crossed before ground truth',
    color: 'bg-amber-500/20 text-amber-400 border-amber-500',
    icon: AlertTriangle,
  },
  response: {
    label: 'Response',
    desc: 'Simulate preventive action on top target',
    color: 'bg-orange-500/20 text-orange-400 border-orange-500',
    icon: FlaskConical,
  },
  confirmation: {
    label: 'Confirmation',
    desc: 'Ground truth revealed - held-out outcome',
    color: 'bg-coral-500/20 text-coral-400 border-coral-500',
    icon: CheckCircle,
  },
};

export function AnalysisStatus({ phase, warningActive, stage, targetHost, frameIndex, confirmationRevealed }: AnalysisStatusProps) {
  const phases: AnalysisPhase[] = ['baseline', 'emerging-risk', 'early-warning', 'response', 'confirmation'];
  const currentIdx = phases.indexOf(phase);

  return (
    <div
      className="w-full bg-navy-800 border border-navy-700 rounded-lg p-3 flex flex-col gap-2"
      data-testid="analysis-status"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" aria-hidden="true"></span>
          Analysis State
        </h4>
        <span className="text-[13px] text-gray-400">
          Frame {frameIndex} - {warningActive ? `Warning active - ${stage}${targetHost ? ` - ${targetHost}` : ''}` : stage} - {confirmationRevealed ? 'Ground truth revealed' : 'Gated'}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5" data-testid="analysis-phases">
        {phases.map((p, idx) => {
          const cfg = phaseConfig[p];
          const Icon = cfg.icon;
          const isActive = p === phase;
          const isPast = idx < currentIdx;
          return (
            <div
              key={p}
              className={`flex flex-col items-center gap-1 p-2 rounded border text-center ${isActive ? cfg.color + ' border-2 font-bold shadow' : isPast ? 'bg-navy-700 text-gray-300 border-navy-700 opacity-80' : 'bg-navy-700/40 text-gray-500 border-navy-700'}`}
              data-testid={`phase-${p}`}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`${cfg.label} - ${cfg.desc} - ${isActive ? 'current' : isPast ? 'completed' : 'pending'}`}
            >
              <Icon className={`w-4 h-4 ${isActive ? '' : 'opacity-60'}`} aria-hidden="true" />
              <span className="text-[13px] font-semibold leading-tight">{cfg.label}</span>
              <span className="text-[13px] leading-tight hidden sm:block">{cfg.desc}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-current animate-pulse' : isPast ? 'bg-emerald-500' : 'bg-gray-600'}`} aria-hidden="true"></span>
            </div>
          );
        })}
      </div>
      <p className="text-[13px] text-gray-500">
        CyberWorld AI analyzes chronological network flows to predict rising malicious risk, explain observed evidence and global importance, show MITRE mapping, and compare preventive-action simulation before held-out ground truth.
        <span className="ml-1 text-gray-400">Workflow: Analysis Session - Risk model - Temporal state - Stage estimate - Target ranking - Threat Explanation - Preventive Action - Before/after comparison - Confirmation</span>
      </p>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function derivePhase(
  frameIndex: number,
  milestones: { baselineFrame: number | null; emergingRiskFrame: number | null; warningFrame: number | null; confirmationFrame: number | null },
  warningActive: boolean,
  confirmationRevealed: boolean,
  hasSimulation: boolean
): AnalysisPhase {
  if (confirmationRevealed) return 'confirmation';
  if (hasSimulation && warningActive) return 'response';
  if (warningActive || (milestones.warningFrame !== null && frameIndex >= milestones.warningFrame)) return 'early-warning';
  if (milestones.emergingRiskFrame !== null && frameIndex >= milestones.emergingRiskFrame) return 'emerging-risk';
  return 'baseline';
}
