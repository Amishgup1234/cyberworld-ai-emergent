import { Layers, Info } from 'lucide-react';

interface StagePanelProps {
  stage: string;
  stageEvidenceScore?: string;
  evidence: string[];
}

const stageDescriptions: Record<string, string> = {
  Normal: 'Benign profile - no suspicious evidence',
  Reconnaissance: 'PortScan plus high destination/port diversity - possible scanning',
  'Credential Attack': 'FTP-Patator or SSH-Patator plus repeated authentication activity - possible brute force',
  'Compromise/Infiltration': 'Infiltration-like pattern - predicted ratio high + host-to-host + risk trend',
  'Impact/Disruption': 'DoS/DDoS pattern - high bytes/packets plus predicted ratio >0.30',
};

export function StagePanel({ stage, stageEvidenceScore, evidence }: StagePanelProps) {
  const desc = stageDescriptions[stage] || 'Rule-derived stage - not calibrated probability';

  const stageColor =
    stage === 'Normal'
      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
      : stage === 'Reconnaissance'
        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500'
        : stage === 'Credential Attack'
          ? 'bg-orange-500/20 text-orange-400 border-orange-500'
          : stage === 'Compromise/Infiltration'
            ? 'bg-coral-500/20 text-coral-400 border-coral-500'
            : 'bg-red-500/20 text-red-400 border-red-500';

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg p-4 flex flex-col gap-3" data-testid="stage-panel">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <Layers className="w-4 h-4 text-purple-400" aria-hidden="true" />
        Stage Estimate - Rule-Derived
      </h3>

      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded border text-sm font-bold ${stageColor}`}>
        <span className="w-2 h-2 rounded-full bg-current" aria-hidden="true"></span>
        <span>{stage}</span>
        <span className="text-[13px] font-normal opacity-80">- not calibrated probability</span>
      </div>

      <p className="text-[13px] text-gray-400 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <span>{desc}</span>
      </p>

      {stageEvidenceScore && (
        <p className="text-[13px] text-gray-300 bg-navy-700 rounded p-2 border border-navy-700">
          <span className="text-purple-400 font-medium">Evidence score:</span> {stageEvidenceScore}
        </p>
      )}

      <div className="text-[13px] text-gray-500">
        <span className="font-medium text-gray-400">Evidence rule mapping:</span>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li>BENIGN =&gt; Normal</li>
          <li>PortScan + port diversity =&gt; Reconnaissance (T1046)</li>
          <li>FTP/SSH-Patator + auth =&gt; Credential Attack (T1110)</li>
          <li>Infiltration =&gt; Compromise (T1021)</li>
          <li>DoS/DDoS =&gt; Impact (T1498)</li>
        </ul>
      </div>

      {evidence.length > 0 && (
        <div className="text-[13px]">
          <span className="text-gray-400 font-medium">Observed in frame ({evidence.length}):</span>
          <ul className="mt-1 space-y-0.5 max-h-20 overflow-auto pr-1">
            {evidence.slice(0, 4).map((e, i) => (
              <li key={i} className="text-gray-300 truncate">
                - {e}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
