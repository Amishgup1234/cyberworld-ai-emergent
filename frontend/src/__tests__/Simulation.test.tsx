import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SimulationPanel } from '../components/SimulationPanel';
import { EvidencePanel } from '../components/EvidencePanel';
import { MitrePanel } from '../components/MitrePanel';
import { Topology } from '../components/Topology';
import type { NetworkNode, NetworkEdge, TargetRankingEntry, ScenarioFrame, EvaluationMetrics, MitreTechnique } from '../api/generated';

// Mock fetch global
const mockFetch = vi.fn();

function makeFrame(): ScenarioFrame {
  return {
    frame: 10,
    frame_id: 10,
    timestamp: '2017-07-04 12:00:00',
    timestamp_iso: '2017-07-04T12:00:00',
    flow_summary: {
      total_flows: 150,
      distinct_dest_ips: 40,
      distinct_ports: 60,
      predicted_malicious_count: 20,
      predicted_malicious_ratio: 0.13,
      avg_bytes_per_sec: 6000,
      avg_packets_per_sec: 5000,
      predicted_source: 'model-predicted',
      threshold: 0.45,
    },
    nodes: [
      { id: 'host-1', alias: 'host-1', safe_alias: 'host-1', role: 'workstation', criticality: 'low', criticality_numeric: 1, observed_state: 'observed', risk: 0.2, status: 'observed' } as NetworkNode,
      { id: 'host-2', alias: 'host-2', safe_alias: 'host-2', role: 'server', criticality: 'high', criticality_numeric: 3, observed_state: 'suspicious', risk: 0.78, status: 'observed' } as NetworkNode,
      { id: 'host-3', alias: 'host-3', safe_alias: 'host-3', role: 'database', criticality: 'high', criticality_numeric: 3, observed_state: 'observed', risk: 0.3, status: 'observed' } as NetworkNode,
    ],
    edges: [
      { source: 'host-1', target: 'host-2', protocol: 'TCP', activity: 5, novelty: 0.8, status: 'observed' } as unknown as NetworkEdge,
      { source: 'host-3', target: 'host-2', protocol: 'TCP', activity: 3, novelty: 0.9, status: 'observed' } as unknown as NetworkEdge,
      { source: 'host-2', target: 'host-3', protocol: 'TCP', activity: 2, novelty: 0.5, status: 'observed' } as unknown as NetworkEdge,
    ],
    signals: { raw_risk: 0.62, smoothed_risk: 0.55, slope: 0.03, warning: true, threshold: 0.45, alpha: 0.4 } as unknown as ScenarioFrame['signals'],
    forecast: {
      raw_risk: 0.62,
      smoothed_risk: 0.55,
      slope: 0.03,
      warning: true,
      threshold: 0.45,
      stage: 'Credential Attack',
      stage_evidence_score: 'Credential Attack - observed evidence in frame (model-predicted ratio 0.13)',
      target_ranking: [
        { host: 'host-2', alias: 'host-2', target_score: 12.5, incoming_activity: 8, edge_novelty: 0.85, recent_risk_trend: 0.75, asset_criticality: 'high', criticality_numeric: 3, role: 'server', rank: 1 },
        { host: 'host-3', alias: 'host-3', target_score: 5.2, incoming_activity: 2, edge_novelty: 0.5, recent_risk_trend: 0.75, asset_criticality: 'high', criticality_numeric: 3, role: 'database', rank: 2 },
      ] as TargetRankingEntry[],
      predicted_path: { source: 'host-1', target: 'host-2', protocol: 'TCP', status: 'predicted', style: 'dashed' },
      evidence: ['High destination port diversity (60 ports)', 'High SYN flag rate (mean 0.42)', 'Predicted malicious ratio 0.13 model-predicted (threshold 0.45)'],
      mitre: [{ technique_id: 'T1110', name: 'Brute Force', evidence_rule: 'Predicted malicious ratio >0.25 plus repeated authentication-like activity', confidence: 'likely - brute force pattern observed via predicted ratio, not confirmed compromise - requires analyst review', stage: 'Credential Attack' }],
      engine_metadata: { model_family: 'random_forest', model_version: 'phase04-v1', data_mode: 'synthetic', feature_count: 80, claim_limitations: 'Test limitations - not causal', threshold: 0.45, mitre_version: '13.1', version: '0.1.0' },
    } as unknown as ScenarioFrame['forecast'],
    stage: 'Credential Attack',
    target_ranking: [] as unknown as ScenarioFrame['target_ranking'],
    evidence: [] as unknown as ScenarioFrame['evidence'],
    mitre: [] as unknown as ScenarioFrame['mitre'],
    ground_truth: { revealed: false, event: 'Normal', attack_type: null, label_distribution: null, true_malicious_count: null, true_malicious_ratio: null, frame: 10, ground_truth_frame: 20 } as unknown as ScenarioFrame['ground_truth'],
    groundTruth: { revealed: false, event: 'Normal' } as unknown as ScenarioFrame['ground_truth'],
  } as unknown as ScenarioFrame;
}

describe('SimulationPanel - Host-selection isolation control', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('renders host-select dropdown with nodes and simulate button - keyboard accessible', async () => {
    const frame = makeFrame();
    const nodes = frame.nodes;
    const ranking = (frame.forecast.target_ranking as TargetRankingEntry[]) || [];

    render(
      <SimulationPanel
        scenarioId="cyberworld-replay-v1"
        frameId={10}
        nodes={nodes}
        targetRanking={ranking}
        currentFrameData={frame}
        mode="api"
        simulationResult={null}
        simulationLoading={false}
        simulationError={null}
        onSimulateResult={() => {}}
        onLoadingChange={() => {}}
        onErrorChange={() => {}}
      />
    );

    expect(screen.getByTestId('simulation-panel')).toBeInTheDocument();
    expect(screen.getByText(/What-if Isolation - Simulated/)).toBeInTheDocument();
    const select = screen.getByTestId('host-select');
    expect(select).toBeInTheDocument();
    expect(select).toHaveAttribute('aria-label', 'Select host to isolate');
    expect(select).toHaveTextContent('host-1');
    expect(select).toHaveTextContent('host-2');
    const btn = screen.getByTestId('simulate-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-label', 'Isolate selected host (simulated)');
    expect(btn).toHaveTextContent('Isolate Host (Simulated)');
    expect(screen.getByText(/Orange - simulation/)).toBeInTheDocument();
  });

  it('triggers simulate, shows before/after, simulated label, removed edges, and ranking change', async () => {
    const frame = makeFrame();
    const nodes = frame.nodes;
    const ranking = frame.forecast.target_ranking as TargetRankingEntry[];

    const simulatedResult = {
      scenario_id: 'cyberworld-replay-v1',
      frame_id: 10,
      host: 'host-2',
      action: 'isolate_host',
      before: { raw_risk: 0.62, smoothed_risk: 0.55, slope: 0.03, warning: true, stage: 'Credential Attack', target_ranking: ranking, evidence: frame.forecast.evidence, mitre: frame.forecast.mitre },
      after: {
        raw_risk: 0.34,
        smoothed_risk: 0.32,
        slope: -0.002,
        warning: false,
        stage: 'Normal',
        target_ranking: [
          { host: 'host-3', alias: 'host-3', target_score: 5.2, incoming_activity: 0, edge_novelty: 0.5, recent_risk_trend: 0.4, asset_criticality: 'high', criticality_numeric: 3, role: 'database', rank: 1 },
          { host: 'host-1', alias: 'host-1', target_score: 1.1, incoming_activity: 0, edge_novelty: 0.5, recent_risk_trend: 0.4, asset_criticality: 'low', criticality_numeric: 1, role: 'workstation', rank: 2 },
        ],
      },
      removed_edges: [
        { source: 'host-1', target: 'host-2', protocol: 'TCP', activity: 5, novelty: 0.8, status: 'removed', style: 'muted' },
        { source: 'host-3', target: 'host-2', protocol: 'TCP', activity: 3, novelty: 0.9, status: 'removed', style: 'muted' },
      ],
      deltas: { raw_risk_delta: -0.28, smoothed_risk_delta: -0.23, slope_delta: -0.032, stage_changed: true, risk_reduction_percent: 45.16 },
      limitations: 'Estimated simulated effect - not causal proof. Binary benign-versus-malicious risk only;',
      label: 'Estimated simulated effect - not causal proof',
      message: 'Estimated simulated effect - not causal proof',
      engine_metadata: { model_family: 'random_forest', claim_limitations: 'not causal' },
      original_unchanged: true,
    };

    render(
      <SimulationPanel
        scenarioId="cyberworld-replay-v1"
        frameId={10}
        nodes={nodes}
        targetRanking={ranking}
        currentFrameData={frame}
        mode="api"
        simulationResult={simulatedResult as unknown as import('../api/generated').SimulationResult}
        simulationLoading={false}
        simulationError={null}
        onSimulateResult={() => {}}
        onLoadingChange={() => {}}
        onErrorChange={() => {}}
      />
    );

    expect(screen.getByTestId('simulation-label')).toBeInTheDocument();
    expect(screen.getByTestId('simulation-label')).toHaveTextContent('Estimated simulated effect - not causal proof');
    expect(screen.getAllByText(/Estimated simulated effect - not causal proof/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('simulation-comparison')).toBeInTheDocument();
    expect(screen.getByText(/Before Isolation - Observed\/Predicted/)).toBeInTheDocument();
    expect(screen.getByText(/After Isolation - Simulated/)).toBeInTheDocument();
    expect(screen.getByTestId('simulation-deltas')).toBeInTheDocument();
    expect(screen.getByText(/Raw delta/)).toBeInTheDocument();
    expect(screen.getByText(/Risk reduction/)).toBeInTheDocument();
    expect(screen.getByText(/45.2%/)).toBeInTheDocument();
    expect(screen.getByText(/Removed edges - muted orange/)).toBeInTheDocument();
    expect(screen.getByText(/host-1 -> host-2/)).toBeInTheDocument();
    expect(screen.getByText(/Muted orange dashed edge for removed simulated path/)).toBeInTheDocument();
    expect(screen.getByText(/Before ranking top 3/)).toBeInTheDocument();
    expect(screen.getByText(/After ranking top 3 - simulated/)).toBeInTheDocument();
    expect(screen.getByText(/Ranking changed/)).toBeInTheDocument();
    expect(screen.getAllByText(/not causal proof/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows error for unsupported host', async () => {
    render(
      <SimulationPanel
        scenarioId="cyberworld-replay-v1"
        frameId={10}
        nodes={makeFrame().nodes}
        targetRanking={[]}
        currentFrameData={makeFrame()}
        mode="api"
        simulationResult={null}
        simulationLoading={false}
        simulationError="Host not found in frame 10 nodes: host-99999"
        onSimulateResult={() => {}}
        onLoadingChange={() => {}}
        onErrorChange={() => {}}
      />
    );
    expect(screen.getByTestId('simulation-error')).toBeInTheDocument();
    expect(screen.getByText(/Host not found/)).toBeInTheDocument();
  });
});

describe('EvidencePanel - observed evidence and global importance separate', () => {
  it('renders two distinct sections with not causal disclaimer', () => {
    const metrics = {
      model_family: 'random_forest',
      threshold: 0.45,
      samples: { train: 2306, validation: 1053, test: 953 },
      precision: {},
      recall: {},
      f1: {},
      fpr: 0.01,
      roc_auc: 0.8,
      pr_auc: 0.9,
      accuracy: 0.84,
      confusion_matrix: [[1, 2], [3, 4]],
      latency: { p95_ms: 13, p50_ms: 5 },
      claim_limitations: 'not causal',
      feature_importance: {
        description: 'Global Random Forest feature_importances_ - not causal',
        top_features: [
          { feature: 'Total Backward Packets', importance: 0.1 },
          { feature: 'Down/Up Ratio', importance: 0.08 },
        ],
      },
    } as unknown as EvaluationMetrics;

    render(<EvidencePanel evidence={['High SYN flag rate (mean 0.42)', 'Predicted malicious ratio 0.13 model-predicted']} metrics={metrics} />);

    expect(screen.getByTestId('evidence-panel')).toBeInTheDocument();
    expect(screen.getByTestId('observed-evidence-section')).toBeInTheDocument();
    expect(screen.getByTestId('global-importance-section')).toBeInTheDocument();
    expect(screen.getByText('Observed Evidence')).toBeInTheDocument();
    expect(screen.getByText('Global Model Importance')).toBeInTheDocument();
    expect(screen.getByText(/Deterministic observed evidence/)).toBeInTheDocument();
    expect(screen.getAllByText(/Never describe importance as causality/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('importance-disclaimer')).toHaveTextContent('not causal proof');
    expect(screen.getByText(/High SYN flag rate/)).toBeInTheDocument();
    expect(screen.getByText(/Total Backward Packets/)).toBeInTheDocument();
  });
});

describe('MitrePanel - versioned technique cards', () => {
  it('renders pinned v13.1 and all 4 techniques with evidence rule and confidence', () => {
    const techniques = [
      { technique_id: 'T1110', name: 'Brute Force', evidence_rule: 'Predicted malicious ratio >0.25 plus repeated authentication-like activity', confidence: 'likely - brute force pattern observed via predicted ratio, not confirmed compromise - requires analyst review', stage: 'Credential Attack' },
    ] as unknown as MitreTechnique[];

    render(<MitrePanel techniques={techniques} mitreVersion="13.1" />);

    expect(screen.getByTestId('mitre-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mitre-version')).toHaveTextContent('Pinned v13.1');
    expect(screen.getByText(/Pinned local MITRE ATT&CK mapping v13.1/)).toBeInTheDocument();
    expect(screen.getByTestId('mitre-T1046')).toBeInTheDocument();
    expect(screen.getByTestId('mitre-T1110')).toBeInTheDocument();
    expect(screen.getByTestId('mitre-T1021')).toBeInTheDocument();
    expect(screen.getByTestId('mitre-T1498')).toBeInTheDocument();
    expect(screen.getByTestId('mitre-T1046-rule')).toHaveTextContent('Port diversity >15 plus predicted suspicious activity');
    expect(screen.getByTestId('mitre-T1046-confidence')).toHaveTextContent('possible - observed scanning only');
    expect(screen.getByTestId('mitre-T1110-confidence')).toHaveTextContent('likely - brute force pattern');
    expect(screen.getByTestId('mitre-T1021-confidence')).toHaveTextContent('simulated estimate - not causal proof');
    expect(screen.getByTestId('mitre-T1498-confidence')).toHaveTextContent('possible - volume anomaly predicted');
    expect(screen.getByText('T1046')).toBeInTheDocument();
    expect(screen.getByText('Network Service Discovery')).toBeInTheDocument();
    expect(screen.getByText('Brute Force')).toBeInTheDocument();
  });
});

describe('Topology - removed edge visualization', () => {
  it('shows muted orange legend and handles removed edges prop', () => {
    const nodes = [
      { id: 'host-1', alias: 'host-1', role: 'workstation', criticality: 'low', criticality_numeric: 1, observed_state: 'observed', risk: 0.2, status: 'observed' },
      { id: 'host-2', alias: 'host-2', role: 'server', criticality: 'high', criticality_numeric: 3, observed_state: 'suspicious', risk: 0.8, status: 'observed' },
    ] as NetworkNode[];
    const edges = [
      { source: 'host-1', target: 'host-2', protocol: 'TCP', activity: 5, novelty: 0.8, status: 'observed' },
    ] as unknown as NetworkEdge[];
    const removed = [{ source: 'host-1', target: 'host-2', protocol: 'TCP', activity: 5, novelty: 0.8, status: 'removed', style: 'muted' }] as unknown as NetworkEdge[];

    render(<Topology nodes={nodes} edges={edges} predictedPath={null} groundTruthRevealed={false} warning={true} removedEdges={removed} simulationActive={true} />);

    expect(screen.getByTestId('topology')).toBeInTheDocument();
    expect(screen.getByTestId('topology-legend')).toHaveTextContent('Simulated removed - orange muted');
    expect(screen.getByText(/orange muted removed edges active/)).toBeInTheDocument();
    expect(screen.getByText(/1 removed - simulated/)).toBeInTheDocument();
  });
});
