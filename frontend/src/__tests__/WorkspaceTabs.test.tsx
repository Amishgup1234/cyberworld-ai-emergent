import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WorkspaceTabs } from '../components/WorkspaceTabs';
import type { ScenarioFrame, NetworkNode, NetworkEdge, TargetRankingEntry, EvaluationMetrics } from '../api/generated';

function makeFrame(opts?: { warning?: boolean; stage?: string }): ScenarioFrame {
  return {
    frame: 8,
    frame_id: 8,
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
    ],
    edges: [
      { source: 'host-1', target: 'host-2', protocol: 'TCP', activity: 5, novelty: 0.8, status: 'observed' } as unknown as NetworkEdge,
    ],
    signals: { raw_risk: 0.62, smoothed_risk: 0.55, slope: 0.03, warning: opts?.warning ?? true, threshold: 0.45, alpha: 0.4 } as unknown as ScenarioFrame['signals'],
    forecast: {
      raw_risk: 0.62,
      smoothed_risk: 0.55,
      slope: 0.03,
      warning: opts?.warning ?? true,
      threshold: 0.45,
      stage: opts?.stage ?? 'Credential Attack',
      stage_evidence_score: 'Credential Attack - observed evidence in frame (model-predicted ratio 0.13)',
      target_ranking: [
        { host: 'host-2', alias: 'host-2', target_score: 12.5, incoming_activity: 8, edge_novelty: 0.85, recent_risk_trend: 0.75, asset_criticality: 'high', criticality_numeric: 3, role: 'server', rank: 1 },
      ] as TargetRankingEntry[],
      predicted_path: { source: 'host-1', target: 'host-2', protocol: 'TCP', status: 'predicted' },
      evidence: ['High destination port diversity (60 ports)', 'Predicted malicious ratio 0.13 model-predicted (threshold 0.45)'],
      mitre: [{ technique_id: 'T1110', name: 'Brute Force', evidence_rule: 'Predicted malicious ratio >0.25 plus repeated authentication-like activity', confidence: 'likely - brute force pattern observed via predicted ratio, not confirmed compromise - requires analyst review', stage: 'Credential Attack' }],
      engine_metadata: { model_family: 'random_forest', model_version: 'phase04-v1', data_mode: 'synthetic', feature_count: 80, claim_limitations: 'Binary benign-versus-malicious risk only - not causal', threshold: 0.45, mitre_version: '13.1' },
    } as unknown as ScenarioFrame['forecast'],
    stage: opts?.stage ?? 'Credential Attack',
    target_ranking: [] as unknown as ScenarioFrame['target_ranking'],
    evidence: [] as unknown as ScenarioFrame['evidence'],
    mitre: [] as unknown as ScenarioFrame['mitre'],
    ground_truth: { revealed: false, event: 'Normal', attack_type: null, label_distribution: null, true_malicious_count: null, true_malicious_ratio: null, frame: 8, ground_truth_frame: 20 } as unknown as ScenarioFrame['ground_truth'],
    groundTruth: { revealed: false, event: 'Normal' } as unknown as ScenarioFrame['ground_truth'],
  } as unknown as ScenarioFrame;
}

function makeMetrics(): EvaluationMetrics {
  return {
    model_family: 'random_forest',
    version: 'phase04-v1',
    seed: 42,
    feature_count: 80,
    samples: { train: 2306, validation: 1053, test: 953, monday: 1153 },
    precision: { benign: 0.73, malicious: 0.98, macro: 0.85 },
    recall: { benign: 0.98, malicious: 0.74, macro: 0.86 },
    f1: { benign: 0.84, malicious: 0.84, macro: 0.844 },
    fpr: 0.012,
    roc_auc: 0.78,
    pr_auc: 0.89,
    accuracy: 0.84,
    confusion_matrix: [[386, 5], [143, 419]],
    latency: { p95_ms: 13.9, p50_ms: 1.5, mean_ms: 5, samples: 100, unit: 'ms' },
    claim_limitations: 'Binary benign-versus-malicious risk only (learned); stage estimate is rule-derived evidence score; target ranking is NetworkX graph-ranked; isolation is simulated estimate - not causal proof',
    target_gates: { f1_ge_0_90: false, recall_ge_0_90: false, fpr_le_0_05: true, latency_lt_500ms: true },
    threshold: 0.45,
  } as unknown as EvaluationMetrics;
}

function make30Frames(): ScenarioFrame[] {
  const base = makeFrame();
  return Array.from({ length: 30 }, (_, i) => ({
    ...base,
    frame: i,
    frame_id: i,
    signals: { ...base.signals, warning: i === 8, smoothed_risk: 0.1 + i * 0.02, slope: i >= 8 ? 0.03 : -0.01 } as unknown as ScenarioFrame['signals'],
    forecast: { ...base.forecast, stage: i < 8 ? 'Normal' : 'Credential Attack', target_ranking: base.forecast.target_ranking } as unknown as ScenarioFrame['forecast'],
    ground_truth: { revealed: i >= 20, event: i >= 20 ? 'Infiltration' : 'Normal', ground_truth_frame: 20 } as unknown as ScenarioFrame['ground_truth'],
  })) as unknown as ScenarioFrame[];
}

describe('WorkspaceTabs - tabbed lower workspace', () => {
  const baseProps = () => {
    const frame = makeFrame();
    const metrics = makeMetrics();
    const frames = make30Frames();
    return {
      evidence: frame.forecast.evidence as string[],
      metrics,
      techniques: frame.forecast.mitre as unknown as import('../api/generated').MitreTechnique[],
      mitreVersion: '13.1',
      scenarioId: 'cyberworld-replay-v1',
      frameId: 8,
      nodes: frame.nodes,
      targetRanking: frame.forecast.target_ranking as TargetRankingEntry[],
      currentFrameData: frame,
      mode: 'api' as const,
      simulationResult: null,
      simulationLoading: false,
      simulationError: null,
      onSimulateResult: vi.fn(),
      onLoadingChange: vi.fn(),
      onErrorChange: vi.fn(),
      frames,
      currentFrame: 8,
    };
  };

  it('renders workspace-tabs container visible in lower workspace with role tablist and 5 tabs', () => {
    render(<WorkspaceTabs {...baseProps()} />);
    const workspace = screen.getByTestId('workspace-tabs');
    expect(workspace).toBeInTheDocument();
    expect(workspace.className).toContain('bg-navy-800');
    // tablist
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();
    expect(tablist).toHaveAttribute('aria-label', 'Analyst workspace tabs');
    expect(tablist.className).toContain('h-9');
    expect(tablist.className).toContain('bg-cyber-950');
    expect(tablist.className).toContain('border-b');
    expect(tablist.className).toContain('border-cyber-800');

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    // check each tab has required attrs
    expect(tabs[0]).toHaveAttribute('id', 'tab-evidence');
    expect(tabs[0]).toHaveAttribute('aria-controls', 'panel-evidence');
    expect(tabs[1]).toHaveAttribute('id', 'tab-mitre');
    expect(tabs[1]).toHaveAttribute('aria-controls', 'panel-mitre');
    expect(tabs[2]).toHaveAttribute('id', 'tab-simulation');
    expect(tabs[2]).toHaveAttribute('aria-controls', 'panel-simulation');
    expect(tabs[3]).toHaveAttribute('id', 'tab-metrics');
    expect(tabs[3]).toHaveAttribute('aria-controls', 'panel-metrics');
    expect(tabs[4]).toHaveAttribute('id', 'tab-trajectory');
    expect(tabs[4]).toHaveAttribute('aria-controls', 'panel-trajectory');

    // check labels - preserve real component names, not hardcoded telemetry
    expect(tabs[0]).toHaveTextContent('Evidence');
    expect(tabs[1]).toHaveTextContent('MITRE ATT&CK');
    expect(tabs[2]).toHaveTextContent('What-if Isolation');
    expect(tabs[3]).toHaveTextContent('Metrics');
    expect(tabs[4]).toHaveTextContent('Trajectory');

    // no Flow Telemetry tab - blocked
    expect(screen.queryByText(/Flow Telemetry/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Packet Inspection/)).not.toBeInTheDocument();
  });

  it('has 5 tab panels with role tabpanel, aria-labelledby, hidden when not active, data-testid', () => {
    render(<WorkspaceTabs {...baseProps()} />);
    const evidencePanel = screen.getByTestId('tab-evidence');
    const mitrePanel = screen.getByTestId('tab-mitre');
    const simPanel = screen.getByTestId('tab-simulation');
    const metricsPanel = screen.getByTestId('tab-metrics');
    const trajPanel = screen.getByTestId('tab-trajectory');

    expect(evidencePanel).toHaveAttribute('role', 'tabpanel');
    expect(evidencePanel).toHaveAttribute('aria-labelledby', 'tab-evidence');
    expect(evidencePanel).toHaveAttribute('id', 'panel-evidence');

    expect(mitrePanel).toHaveAttribute('role', 'tabpanel');
    expect(mitrePanel).toHaveAttribute('aria-labelledby', 'tab-mitre');

    expect(simPanel).toHaveAttribute('role', 'tabpanel');
    expect(simPanel).toHaveAttribute('aria-labelledby', 'tab-simulation');

    expect(metricsPanel).toHaveAttribute('role', 'tabpanel');
    expect(metricsPanel).toHaveAttribute('aria-labelledby', 'tab-metrics');

    expect(trajPanel).toHaveAttribute('role', 'tabpanel');
    expect(trajPanel).toHaveAttribute('aria-labelledby', 'tab-trajectory');

    // Initially evidence active - not hidden
    expect(evidencePanel).not.toHaveAttribute('hidden');
    expect(mitrePanel).toHaveAttribute('hidden');
    expect(simPanel).toHaveAttribute('hidden');
    expect(metricsPanel).toHaveAttribute('hidden');
    expect(trajPanel).toHaveAttribute('hidden');
  });

  it('aria-selected reflects active tab and tabIndex management', () => {
    render(<WorkspaceTabs {...baseProps()} />);
    const tabs = screen.getAllByRole('tab');
    // evidence active
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabIndex', '0');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('tabIndex', '-1');

    // click mitre
    fireEvent.click(tabs[1]);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('tabIndex', '0');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('tab-mitre')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('tab-evidence')).toHaveAttribute('hidden');
  });

  it('tabs have visible focus ring classes - Stitch tokens', () => {
    render(<WorkspaceTabs {...baseProps()} />);
    const tabs = screen.getAllByRole('tab');
    tabs.forEach((tab) => {
      expect(tab.className).toContain('focus:ring-2');
      expect(tab.className).toContain('focus:ring-cyan-400');
      expect(tab.className).toContain('font-mono');
      expect(tab.className).toContain('border-b-2');
      expect(tab.className).toContain('text-[13px]');
    });
    // active vs inactive styling tokens
    expect(tabs[0].className).toContain('border-cyber-cyan');
    expect(tabs[0].className).toContain('text-cyber-cyan');
    expect(tabs[1].className).toContain('border-transparent');
    expect(tabs[1].className).toContain('text-slate-400');
  });

  it('keyboard accessible: ArrowRight, ArrowLeft, Home, End navigate with focus', () => {
    render(<WorkspaceTabs {...baseProps()} />);
    const tablist = screen.getByRole('tablist');
    const tabs = screen.getAllByRole('tab');

    // focus first tab
    tabs[0].focus();
    expect(document.activeElement).toBe(tabs[0]);

    // ArrowRight -> mitre
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    // after ArrowRight, active should be mitre
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');

    // ArrowRight -> simulation
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true');

    // ArrowLeft -> mitre
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');

    // End -> trajectory
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(screen.getAllByRole('tab')[4]).toHaveAttribute('aria-selected', 'true');

    // Home -> evidence
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');

    // Wrap: ArrowLeft from first goes to last
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getAllByRole('tab')[4]).toHaveAttribute('aria-selected', 'true');

    // Wrap: ArrowRight from last goes to first
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('keyboard tab navigation isolates from global replay - Arrow keys stop propagation (no frame change)', () => {
    // Verify WorkspaceTabs handleKeyDown does preventDefault + stopPropagation for handled keys
    // so window global handler (useReplayController) does not receive ArrowRight/Left/Home/End when tablist focused.
    const windowSpy = vi.fn();
    window.addEventListener('keydown', windowSpy);
    render(<WorkspaceTabs {...baseProps()} />);
    const tablist = screen.getByRole('tablist');
    const tabs = screen.getAllByRole('tab');

    tabs[0].focus();
    expect(document.activeElement).toBe(tabs[0]);

    // ArrowRight on tablist should change tab but NOT bubble to window
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(windowSpy).not.toHaveBeenCalled();

    // ArrowLeft should also be isolated
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(windowSpy).not.toHaveBeenCalled();

    // Home should be isolated
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(tabs[4]).toHaveAttribute('aria-selected', 'true');
    expect(windowSpy).not.toHaveBeenCalled();

    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(windowSpy).not.toHaveBeenCalled();

    // Non-handled key should not be stopped - it should bubble (e.g., 'a')
    fireEvent.keyDown(tablist, { key: 'a' });
    expect(windowSpy).toHaveBeenCalledTimes(1);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true'); // unchanged

    window.removeEventListener('keydown', windowSpy);
  });

  it('allows legitimate malicious F1 0.850 while blocking Stitch hardcoded macro 0.850', () => {
    // Simulate real metrics where macro is 0.845 (0.8445) and malicious is 0.850 (0.8499) - both honest measured
    const realMetrics = {
      ...makeMetrics(),
      f1: { benign: 0.839, malicious: 0.85, macro: 0.845 },
      fpr: 0.0127,
    } as unknown as EvaluationMetrics;
    // Use baseProps with realMetrics
    const base = baseProps();
    base.metrics = realMetrics;
    render(<WorkspaceTabs {...base} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Metrics' }));
    const metricsPanel = screen.getByTestId('tab-metrics');
    // Macro 0.845 should be shown, not Stitch hardcoded 0.850 macro from static table
    const macroRow = within(metricsPanel).getByText('Binary F1 macro').closest('div');
    expect(macroRow?.textContent).toContain('0.845');
    expect(macroRow?.textContent).not.toContain('0.850');
    // Malicious 0.850 is legitimate when from metrics.f1.malicious - should be present as 0.850 in its own tile
    const maliciousTile = within(metricsPanel).getByText('F1 malicious').closest('div');
    expect(maliciousTile?.textContent).toContain('0.850');
    // Ensure not containing Stitch 0.0128 FPR (real 0.0127/0.012)
    expect(metricsPanel.textContent).not.toContain('0.0128');
  });

  it('reuses existing panels without rewriting - each tab contains correct component', async () => {
    render(<WorkspaceTabs {...baseProps()} />);

    // Evidence panel should contain observed evidence and global importance separate sections
    const evidenceTabPanel = screen.getByTestId('tab-evidence');
    expect(within(evidenceTabPanel).getByTestId('evidence-panel')).toBeInTheDocument();
    expect(within(evidenceTabPanel).getByTestId('observed-evidence-section')).toBeInTheDocument();
    expect(within(evidenceTabPanel).getByTestId('global-importance-section')).toBeInTheDocument();
    expect(within(evidenceTabPanel).getByText('Observed Evidence')).toBeInTheDocument();

    // Mitre tab - click to activate
    fireEvent.click(screen.getByRole('tab', { name: 'MITRE ATT&CK' }));
    const mitrePanel = screen.getByTestId('tab-mitre');
    expect(within(mitrePanel).getByTestId('mitre-panel')).toBeInTheDocument();
    expect(within(mitrePanel).getByTestId('mitre-version')).toHaveTextContent('Pinned v13.1');
    expect(within(mitrePanel).getByTestId('mitre-T1046')).toBeInTheDocument();
    expect(within(mitrePanel).getByTestId('mitre-T1110')).toBeInTheDocument();
    expect(within(mitrePanel).getByTestId('mitre-T1021')).toBeInTheDocument();
    expect(within(mitrePanel).getByTestId('mitre-T1498')).toBeInTheDocument();

    // Simulation tab
    fireEvent.click(screen.getByRole('tab', { name: 'What-if Isolation' }));
    const simPanel = screen.getByTestId('tab-simulation');
    expect(within(simPanel).getByTestId('simulation-panel')).toBeInTheDocument();
    expect(within(simPanel).getByTestId('host-select')).toBeInTheDocument();
    expect(within(simPanel).getByTestId('simulate-btn')).toBeInTheDocument();
    expect(within(simPanel).getByText(/Estimated simulated effect - not causal proof/)).toBeInTheDocument();

    // Metrics tab
    fireEvent.click(screen.getByRole('tab', { name: 'Metrics' }));
    const metricsPanel = screen.getByTestId('tab-metrics');
    expect(within(metricsPanel).getByTestId('metrics-panel')).toBeInTheDocument();
    expect(within(metricsPanel).getByText(/Binary F1 macro/)).toBeInTheDocument();
    expect(within(metricsPanel).getByText(/Attack recall/)).toBeInTheDocument();

    // Trajectory tab
    fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' }));
    const trajPanel = screen.getByTestId('tab-trajectory');
    expect(within(trajPanel).getByTestId('trajectory-panel')).toBeInTheDocument();
    expect(within(trajPanel).getByText(/Trajectory Over Time/)).toBeInTheDocument();
    expect(within(trajPanel).getByText(/Showing trajectory 0..8 of 29/)).toBeInTheDocument();
  });

  it('preserves real API-derived values and claim labels - no hardcoded Stitch metrics', () => {
    const props = baseProps();
    render(<WorkspaceTabs {...props} />);
    // Check metrics values are from props not Stitch hardcoded 0.850 macro
    fireEvent.click(screen.getByRole('tab', { name: 'Metrics' }));
    const metricsPanel = screen.getByTestId('tab-metrics');
    // Our metrics f1 macro 0.844 - should be displayed, not Stitch hardcoded macro 0.850
    // Note: macro-F1 measured 0.8445 rounds to 0.845 (honest), malicious-class F1 0.8499 rounds to 0.850 legitimately - do not blanket forbid 0.850
    expect(within(metricsPanel).getByText('0.844')).toBeInTheDocument();
    // Verify Binary F1 macro row is not Stitch 0.850 - check that macro row shows 0.844/0.845 not hardcoded
    const macroRow = within(metricsPanel).getByText('Binary F1 macro').closest('div');
    expect(macroRow?.textContent).toContain('0.844');
    expect(macroRow?.textContent).not.toContain('0.850');
    // Malicious F1 0.850 is legitimate when from metrics.f1.malicious 0.8499 - allow it, but for this mock malicious is 0.84 so panel still should not hardcode Stitch 0.850 macro
    // Ensure not containing Stitch 0.0128 FPR (real measured is 0.012)
    expect(metricsPanel.textContent).not.toContain('0.0128');
    // Check claim labels present
    expect(metricsPanel.textContent).toMatch(/PASS|MISS/);
    expect(metricsPanel.textContent).toContain('Claim limitations');
    // Evidence panel claim: not causal proof
    fireEvent.click(screen.getByRole('tab', { name: 'Evidence' }));
    const evidencePanel = screen.getByTestId('tab-evidence');
    expect(evidencePanel.textContent).toMatch(/not causal/);
    expect(evidencePanel.textContent).toContain('Observed Evidence');
    expect(evidencePanel.textContent).toContain('Global Model Importance');

    // Stage label Rule-derived - check via Mitre confidence wording
    fireEvent.click(screen.getByRole('tab', { name: 'MITRE ATT&CK' }));
    expect(screen.getByTestId('tab-mitre').textContent).toContain('requires analyst review');
  });

  it('does not add unsupported telemetry - no Flow Telemetry tab or packet inspection', () => {
    render(<WorkspaceTabs {...baseProps()} />);
    expect(screen.queryByRole('tab', { name: /Telemetry/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Flow/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Live Telemetry/)).not.toBeInTheDocument();
    // No packet inspection table
    expect(screen.queryByText(/Bytes\/s.*6343/)).not.toBeInTheDocument();
    // Ensure tabs are only the 5 allowed
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Evidence', 'MITRE ATT&CK', 'What-if Isolation', 'Metrics', 'Trajectory']);
  });

  it('preserves immutable what-if simulation - before/after deltas, removed edges, simulated label', () => {
    const frame = makeFrame();
    const simResult = {
      scenario_id: 'cyberworld-replay-v1',
      frame_id: 8,
      host: 'host-2',
      action: 'isolate_host',
      before: { raw_risk: 0.62, smoothed_risk: 0.55, slope: 0.03, warning: true, stage: 'Credential Attack', target_ranking: frame.forecast.target_ranking },
      after: { raw_risk: 0.34, smoothed_risk: 0.32, slope: -0.002, warning: false, stage: 'Normal', target_ranking: [{ host: 'host-1', alias: 'host-1', target_score: 1.1, incoming_activity: 0, edge_novelty: 0.5, recent_risk_trend: 0.4, asset_criticality: 'low', criticality_numeric: 1, role: 'workstation', rank: 1 }] },
      removed_edges: [{ source: 'host-1', target: 'host-2', protocol: 'TCP', activity: 5, novelty: 0.8, status: 'removed' }],
      deltas: { raw_risk_delta: -0.28, smoothed_risk_delta: -0.23, stage_changed: true, risk_reduction_percent: 45.16 },
      limitations: 'Estimated simulated effect - not causal proof',
      label: 'Estimated simulated effect - not causal proof',
      original_unchanged: true,
    } as unknown as import('../api/generated').SimulationResult;

    render(<WorkspaceTabs {...baseProps()} simulationResult={simResult} />);
    fireEvent.click(screen.getByRole('tab', { name: 'What-if Isolation' }));
    const simPanel = screen.getByTestId('tab-simulation');
    expect(within(simPanel).getByTestId('simulation-comparison')).toBeInTheDocument();
    expect(within(simPanel).getByTestId('simulation-label')).toHaveTextContent('Estimated simulated effect - not causal proof');
    expect(within(simPanel).getByText('Before Isolation - Observed/Predicted')).toBeInTheDocument();
    expect(within(simPanel).getByText('After Isolation - Simulated')).toBeInTheDocument();
    expect(within(simPanel).getByTestId('simulation-deltas')).toBeInTheDocument();
    expect(within(simPanel).getByText(/45.2%/)).toBeInTheDocument();
    expect(within(simPanel).getByText(/Removed edges - muted orange/)).toBeInTheDocument();
    // Orange simulation legend present
    expect(simPanel.textContent).toContain('Orange - simulation');
    // Muted edge disclaimer
    expect(simPanel.textContent).toContain('Muted orange dashed edge for removed simulated path');
  });

  it('content container uses Stitch design-system tokens', () => {
    render(<WorkspaceTabs {...baseProps()} />);
    const workspace = screen.getByTestId('workspace-tabs');
    // workspace outer has border
    expect(workspace.className).toContain('border');
    // content container flex-1 p-3 overflow-y-auto bg-cyber-950
    const contentContainer = workspace.querySelector('.flex-1.p-3.overflow-y-auto.bg-cyber-950');
    expect(contentContainer).not.toBeNull();
  });

  it('does not expose raw IP, invented OS or packet inspection in any tab', () => {
    render(<WorkspaceTabs {...baseProps()} />);
    const workspace = screen.getByTestId('workspace-tabs');
    const text = workspace.textContent || '';
    expect(text).not.toMatch(/192\.168\./);
    expect(text).not.toMatch(/Linux/);
    expect(text).not.toMatch(/PostgreSQL/);
    expect(text).not.toMatch(/Flow ID/);
    expect(text).not.toMatch(/TCP\/22.*6343/);
  });
});
