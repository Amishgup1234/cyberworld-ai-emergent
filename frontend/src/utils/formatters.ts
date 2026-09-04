export function formatRisk(value: number): string {
  return value.toFixed(3);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatTimestamp(ts: string): string {
  return ts;
}

export function getRiskLabel(smoothed: number, threshold: number, warning: boolean): string {
  if (warning && smoothed > threshold) return 'Warning';
  if (smoothed > threshold) return 'Elevated';
  return 'Normal';
}

export function getStageColor(stage: string): string {
  switch (stage) {
    case 'Normal':
      return 'text-cyan-400 border-cyan-500 bg-cyan-500/10';
    case 'Reconnaissance':
      return 'text-yellow-400 border-yellow-500 bg-yellow-500/10';
    case 'Credential Attack':
      return 'text-orange-400 border-orange-500 bg-orange-500/10';
    case 'Compromise/Infiltration':
      return 'text-coral-400 border-coral-500 bg-coral-500/10';
    case 'Impact/Disruption':
      return 'text-red-400 border-red-500 bg-red-500/10';
    default:
      return 'text-gray-400 border-gray-500 bg-gray-500/10';
  }
}
