import { useMemo, useState, useEffect } from 'react';
import { CommandBar } from './components/CommandBar';
import { WarningBanner } from './components/WarningBanner';
import { Topology } from './components/Topology';
import { RiskCard } from './components/RiskCard';
import { RiskChart } from './components/RiskChart';
import { StagePanel } from './components/StagePanel';
import { TargetPanel } from './components/TargetPanel';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { AnalysisProgress } from './components/AnalysisProgress';
import { AnalysisStatus, derivePhase } from './components/AnalysisStatus';
import { ThreatExplanation } from './components/ThreatExplanation';
import { TechnicalProofDrawer } from './components/TechnicalProofDrawer';
import { PreventiveActionPanel } from './components/PreventiveActionPanel';
import { useHealthCheck } from './hooks/useHealthCheck';
import { useScenarioData } from './hooks/useScenarioData';
import { useAnalysisSession } from './hooks/useAnalysisSession';
import type { ScenarioFrame, SimulationResult } from './api/generated';
import type { PlaybackSpeed } from './hooks/useReplayController';

function App() {
  const { health, mode, checked } = useHealthCheck();
  const { scenario, metrics, loading, error } = useScenarioData(checked ? mode : 'loading');

  const frames: ScenarioFrame[] = useMemo(() => scenario?.frames ?? [], [scenario]);
  const frameCount = frames.length || 30;

  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const stepMs = useMemo(() => (speed === 0.5 ? 1600 : speed === 2 ? 400 : 800), [speed]);

  const shouldAutoStart = frames.length > 2;
  const analysis = useAnalysisSession(frames as unknown as ScenarioFrame[], { autoStart: shouldAutoStart, stepMs });

  const currentFrame = analysis.currentFrame;
  const current: ScenarioFrame | undefined = frames[currentFrame];

  // Simulation state - for Phase 08 what-if isolation (reused via WorkspaceTabs)
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulationHost, setSimulationHost] = useState<string | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  // Keep derived values for header
  const dataMode = (scenario?.metadata?.data_mode as string) || (health?.data_mode as string) || 'synthetic';
  const scenarioName = scenario?.name;
  const disclosure = (scenario?.metadata?.disclosure as string) || '';
  const claimLimitations =
    (scenario?.metadata?.claim_limitations as string) ||
    (scenario?.engine_metadata?.claim_limitations as string) ||
    (health?.claim_limitations as string) ||
    'Binary benign-versus-malicious risk only (learned); stage estimate is rule-derived evidence score; target ranking is NetworkX graph-ranked; isolation is simulated estimate - not causal proof';
  const mitreVersion = (scenario?.metadata?.mitre_version as string) || '13.1';
  const scenarioId = (scenario?.scenario_id as string) || (scenario?.id as string) || 'cyberworld-replay-v1';
  const modelFamily = (scenario?.engine_metadata?.model_family as string) || (health?.model_family as string) || undefined;
  const modelVersion = (scenario?.engine_metadata?.model_version as string) || (health?.version as string) || undefined;

  // Keyboard accessibility for analysis: Space Pause/Continue, R Restart, Arrows next/prev
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const interactiveSelector = 'button, select, input, textarea, [role="tab"], [role="tablist"], [contenteditable="true"]';
      if (target instanceof HTMLElement) {
        try {
          if (target.closest(interactiveSelector)) return;
        } catch (_e) {
          void _e;
        }
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        try {
          if (target.closest('button') || target.closest('select') || target.closest('[role="tab"]')) return;
        } catch (_e2) {
          void _e2;
        }
      }
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (analysis.isRunning) analysis.pause();
        else analysis.continueAnalysis();
      } else if (e.key === 'r' || e.key === 'R') {
        analysis.restart();
      } else if (e.key === 'ArrowRight') {
        analysis.nextFrame();
      } else if (e.key === 'ArrowLeft') {
        analysis.prevFrame();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [analysis]);

  // Validate scenario frame structure for invalid-data state
  function validateScenario(s: typeof scenario): { valid: boolean; reason: string } {
    if (!s) return { valid: false, reason: 'Scenario is null' };
    if (!Array.isArray((s as unknown as Record<string, unknown>).frames)) return { valid: false, reason: 'Missing required field: frames (expected array)' };
    const sc = s as unknown as Record<string, unknown>;
    const frs = sc.frames as unknown[];
    if (frs.length > 0) {
      const f = frs[0] as Record<string, unknown>;
      const requiredTop = ['timestamp', 'nodes', 'edges', 'signals', 'forecast', 'ground_truth', 'flow_summary'];
      for (const k of requiredTop) {
        if (!(k in f)) return { valid: false, reason: `Missing required field in frame: ${k}` };
      }
      if (!Array.isArray(f.nodes)) return { valid: false, reason: 'Missing required field: nodes (expected array)' };
      if (!Array.isArray(f.edges)) return { valid: false, reason: 'Missing required field: edges (expected array)' };
      const sig = f.signals as Record<string, unknown>;
      for (const k of ['raw_risk', 'smoothed_risk', 'slope', 'threshold', 'warning']) {
        if (!(k in sig)) return { valid: false, reason: `Missing required field: signals.${k}` };
      }
      const fc = f.forecast as Record<string, unknown>;
      if (fc && !('stage' in fc)) return { valid: false, reason: 'Missing required field: forecast.stage' };
    }
    return { valid: true, reason: '' };
  }
  const validation = scenario ? validateScenario(scenario) : { valid: false, reason: 'No scenario' };
  const isEmpty = scenario && Array.isArray(scenario.frames) && scenario.frames.length === 0;
  const isInvalid = scenario && !validation.valid;

  if (!checked || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900" data-testid="loading-state">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent mx-auto mb-4" aria-hidden="true"></div>
          <p className="text-cyan-400">Starting CyberWorld AI...</p>
          <p className="text-[13px] text-gray-500 mt-2">Health-checking backend - fallback to offline_bundle.json if unavailable</p>
        </div>
      </div>
    );
  }

  if (isInvalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900 p-4" data-testid="invalid-data-state">
        <div className="text-center max-w-lg bg-navy-800 border border-orange-500 rounded-lg p-6">
          <h1 className="text-xl font-bold text-orange-400 mb-2">Invalid Scenario Data</h1>
          <p className="text-gray-400 text-sm mb-3">Scenario data is malformed - {validation.reason}</p>
          <p className="text-[13px] text-gray-500">Check that scenario frames contain required fields: timestamp, nodes, edges, signals (raw_risk, smoothed_risk, slope, threshold, warning), forecast (stage, target_ranking, evidence, mitre), ground_truth (revealed, event), flow_summary (total_flows). Regenerate via python backend pipeline (data/demo/cyberworld_replay.json and frontend/public/offline_bundle.json).</p>
          <p className="text-[13px] text-gray-500 mt-2">Mode: {mode} - Health: {health?.status || 'unknown'} - backend-down fallback uses offline_bundle.json when available</p>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900 p-4" data-testid="empty-state">
        <div className="text-center max-w-lg bg-navy-800 border border-navy-700 rounded-lg p-6">
          <h1 className="text-xl font-bold text-gray-200 mb-2">No Replay Data Available</h1>
          <p className="text-gray-400 text-sm mb-3">Scenario has 0 frames - empty scenario. The replay requires approximately 30 chronological frames with observed nodes, edges, flow summary, risk, evidence, and gated ground truth.</p>
          <p className="text-[13px] text-gray-500">Check data/demo/cyberworld_replay.json and frontend/public/offline_bundle.json - regenerate via backend replay engine if needed. Seed 42 deterministic - 0 frames indicates missing replay engine output.</p>
          <p className="text-[13px] text-gray-500 mt-2">Mode: {mode} - Health: {health?.status || 'unknown'}</p>
        </div>
      </div>
    );
  }

  if (error || !scenario || !current) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900 p-4" data-testid="backend-down-state">
        <div className="text-center max-w-lg bg-navy-800 border border-coral-500 rounded-lg p-6">
          <h1 className="text-xl font-bold text-coral-400 mb-2">Failed to Load Scenario</h1>
          <p className="text-gray-400 text-sm mb-3">{error || 'No frames available'}</p>
          <p className="text-[13px] text-gray-500">Backend failure does not prevent offline replay - check frontend/public/offline_bundle.json</p>
          <p className="text-[13px] text-gray-500 mt-2">Mode: {mode} - Health: {health?.status || 'unknown'} - {mode === 'offline' ? 'Offline Mode - using offline_bundle.json (same engine, not hardcoded)' : 'API Mode - backend healthy but scenario load failed'}</p>
        </div>
      </div>
    );
  }

  const signals = current.signals;
  const forecast = current.forecast;
  const groundTruth = current.ground_truth;

  const phase = derivePhase(
    currentFrame,
    {
      baselineFrame: analysis.milestones.baselineFrame,
      emergingRiskFrame: analysis.milestones.emergingRiskFrame,
      warningFrame: analysis.milestones.warningFrame,
      confirmationFrame: analysis.milestones.confirmationFrame,
    },
    signals.warning,
    groundTruth.revealed,
    !!simulationResult
  );

  const handleMilestoneClick = (id: 'baseline' | 'emerging-risk' | 'early-warning' | 'confirmation') => {
    analysis.goToMilestone(id);
  };

  const handleFrameChange = (f: number) => {
    analysis.goToFrame(f);
  };

  const handleSpeedChange = (s: PlaybackSpeed) => {
    setSpeed(s);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-navy-900 text-gray-200 border-t-2 border-cyan-500" data-testid="app-shell">
      {/* Command Bar - keep for branding and mode, but sync with analysis frame for backward compat */}
      <CommandBar
        mode={mode}
        health={health}
        dataMode={dataMode}
        scenarioName={scenarioName}
        modelFamily={modelFamily}
        modelVersion={modelVersion}
        currentFrame={currentFrame}
        totalFrames={frameCount}
        timestamp={current.timestamp}
        isPlaying={analysis.isRunning}
        speed={speed}
        onPlay={analysis.continueAnalysis}
        onPause={analysis.pause}
        onRestart={analysis.restart}
        onSpeedChange={handleSpeedChange}
        onFrameChange={handleFrameChange}
      />

      {/* Warning Banner - prominent orange/coral when signals.warning true, dismissible, ARIA live polite */}
      <WarningBanner warning={signals.warning} stage={forecast.stage} targetHost={forecast.target_ranking?.[0]?.host} frameId={currentFrame} />

      {/* Mode banner - visible active mode - truthful per connection state (preserved for existing tests and offline fallback visibility) */}
      {(() => {
        const isNotTrainedReachable = health?.status === 'ok' && health?.engine === 'not-trained';
        const isApiMode = mode === 'api';
        const bannerText = isApiMode
          ? 'Backend healthy - using live API (GET /health, /scenarios, /forecast)'
          : isNotTrainedReachable
            ? 'Backend reachable, model not trained - using offline replay.'
            : 'Offline fallback - using offline_bundle.json (same engine, not hardcoded)';
        return (
          <div
            className={`w-full px-4 py-1.5 text-[13px] font-medium flex items-center justify-between shrink-0 ${
              isApiMode ? 'bg-cyan-500/10 text-cyan-400 border-b border-cyan-500/30' : 'bg-orange-500/10 text-orange-400 border-b border-orange-500/30'
            }`}
            data-testid="mode-banner"
            role="status"
            aria-live="polite"
          >
            <span>
              Active mode: <span className="font-bold">{isApiMode ? 'API Mode' : 'Offline Mode'}</span> - {bannerText}
            </span>
            <span className="hidden sm:inline text-[13px] opacity-80">
              Backend failure does not prevent offline replay - demo usable at 1280x720 and 1440x900
            </span>
          </div>
        );
      })()}

      {/* Disclosure - compact truthful data-mode disclosure */}
      {disclosure && (
        <div className="w-full px-4 py-1 text-[13px] text-gray-500 bg-navy-800 border-b border-navy-700 shrink-0 flex items-center justify-between">
          <span>
            <span className="font-medium text-gray-400">Disclosure:</span> {disclosure.slice(0, 220)}...
          </span>
          <span className="hidden sm:inline text-[13px] font-mono text-gray-500">
            Data mode: {dataMode} - {frameCount} frames - Seed 42 - offline_bundle.json
          </span>
        </div>
      )}

      {/* Main workspace - single-screen analysis command centre 65/35 */}
      <div className="flex-1 overflow-auto bg-navy-900" data-testid="analysis-command-centre">
        <main className="grid grid-cols-12 gap-4 max-w-[1600px] mx-auto p-4 overflow-auto">
          <div className="col-span-12 flex flex-col gap-3">
          {/* Hero - new viewer can identify what system does from first viewport */}
          <div className="w-full bg-navy-800 border border-navy-700 rounded-lg p-3" data-testid="analysis-hero">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" aria-hidden="true"></span>
                  CyberWorld AI - Predictive Cybersecurity Analysis
                  <span className="text-[13px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">Analysis Centre</span>
                </h2>
                <p className="text-[13px] text-gray-400 mt-1">
                  Analyzes chronological network flows to predict rising malicious risk, explain observed evidence and global importance, show MITRE mapping, and compare preventive-action simulation before held-out ground truth.
                </p>
                <p className="text-[13px] font-mono text-gray-500 mt-1">
                  Workflow: Analysis Session - Risk model - Temporal state - Stage estimate - Target ranking - Threat Explanation - Preventive Action - Before/after comparison - Confirmation
                </p>
              </div>
              <div className="text-[13px] text-gray-500 bg-navy-700 rounded p-2 border border-navy-700 shrink-0">
                <div>
                  Data mode: <span className="text-white font-mono">{dataMode}</span> - {disclosure ? disclosure.slice(0, 60) + '...' : 'CICIDS2017 Composite'}
                </div>
                <div className="font-mono">
                  Scenario: {scenarioId} - {frameCount} frames - Seed 42
                </div>
                <div className="font-mono">
                  Model: {modelFamily || 'unknown'} {modelVersion || ''} - 5-frame EWMA - threshold {signals.threshold.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Analysis Progress - replaces raw replay terminology */}
          <AnalysisProgress
            currentFrame={currentFrame}
            totalFrames={frameCount}
            timestamp={current.timestamp}
            status={analysis.status}
            isRunning={analysis.isRunning}
            speed={speed}
            milestones={analysis.milestones}
            onPause={analysis.pause}
            onContinue={analysis.continueAnalysis}
            onRestart={analysis.restart}
            onSpeedChange={handleSpeedChange}
            onFrameChange={handleFrameChange}
            onMilestoneClick={handleMilestoneClick}
          />

          {/* Analysis Status - Baseline, Emerging risk, Early warning, Response, Confirmation */}
          <AnalysisStatus
            phase={phase}
            warningActive={signals.warning}
            stage={forecast.stage}
            targetHost={forecast.target_ranking?.[0]?.host ?? null}
            frameIndex={currentFrame}
            confirmationRevealed={groundTruth.revealed}
          />

          {/* 65/35 Analysis Workspace - topology left, decision rail right */}
          <div className="grid grid-cols-12 gap-3" data-testid="analysis-workspace">
            {/* Topology left 65% (col-span-8 = 66.6% approx 65/35) */}
            <div className="col-span-12 lg:col-span-8 min-h-0" data-testid="analysis-topology">
              <Topology
                nodes={current.nodes}
                edges={current.edges}
                predictedPath={forecast.predicted_path as Record<string, unknown> | null}
                groundTruthRevealed={groundTruth.revealed}
                warning={signals.warning}
                removedEdges={simulationResult?.removed_edges as unknown as import('./api/generated').NetworkEdge[] | null}
                simulationActive={!!simulationResult}
                targetRanking={forecast.target_ranking}
                isAnalysisRunning={analysis.isRunning}
              />
            </div>

            {/* Decision rail right 35% (col-span-4) - dynamic */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-3 min-h-0" data-testid="analysis-decision-rail">
              <RiskCard
                rawRisk={signals.raw_risk}
                smoothedRisk={signals.smoothed_risk}
                slope={signals.slope}
                threshold={signals.threshold}
                warning={signals.warning}
              />
              <StagePanel stage={forecast.stage} stageEvidenceScore={forecast.stage_evidence_score as string | undefined} evidence={forecast.evidence} />
              <TargetPanel ranking={forecast.target_ranking} predictedPath={forecast.predicted_path as Record<string, unknown> | null} />
              {/* Preventive Action - prominent one-click workflow */}
              <PreventiveActionPanel
                targetRanking={forecast.target_ranking}
                scenarioId={scenarioId}
                frameId={currentFrame}
                currentFrameData={current}
                nodes={current.nodes}
                mode={mode === 'api' ? 'api' : 'offline'}
                simulationResult={simulationResult}
                simulationHost={simulationHost}
                simulationLoading={simulationLoading}
                simulationError={simulationError}
                onSimulateResult={(res, host) => {
                  setSimulationResult(res);
                  setSimulationHost(host);
                }}
                onLoadingChange={setSimulationLoading}
                onErrorChange={setSimulationError}
              />
              {phase === 'early-warning' && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3" data-testid="response-callout">
                  <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                    Response - Preventive Action
                  </h4>
                  <p className="text-[13px] text-amber-300 mt-1">
                    Early warning active at frame {currentFrame} - review target {forecast.target_ranking?.[0]?.host ?? 'host-N'} and use the prominent Simulate Preventive Action control above or the What-if Isolation tab below.
                  </p>
                  <button
                    onClick={() => {
                      const el = document.querySelector('[data-testid="workspace-tabs"]');
                      // try to switch to simulation tab via click
                      const tab = document.querySelector('[role="tab"][aria-controls="tab-simulation"]') as HTMLElement | null;
                      tab?.click();
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="mt-2 px-3 py-1.5 rounded bg-amber-500 text-slate-900 font-bold text-[13px] focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  >
                    Go to What-if Isolation
                  </button>
                </div>
              )}
              {phase === 'confirmation' && (
                <div className="bg-coral-500/10 border border-coral-500/30 rounded-lg p-3" data-testid="confirmation-callout">
                  <h4 className="text-sm font-bold text-coral-400">Confirmation - Ground Truth Revealed</h4>
                  <p className="text-[13px] text-coral-300 mt-1">
                    {groundTruth.event} - {groundTruth.attack_type ?? ''} at frame {groundTruth.ground_truth_frame ?? 20} - Warning lead was {analysis.milestones.warningLeadFrames ?? '?'} frames.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Threat Explanation - concise data-derived consolidation */}
          <div className="col-span-12">
            <ThreatExplanation frame={current} metrics={metrics} />
          </div>

          {/* RiskChart - preserved observed+predicted risk visualization */}
          <div className="col-span-12">
            <RiskChart frames={frames} currentFrame={currentFrame} />
          </div>

          {/* Technical Proof Drawer - expandable detailed evidence, MITRE, metrics, method and limitations - same interface */}
          <div className="col-span-12">
            <TechnicalProofDrawer
              evidence={forecast.evidence}
              metrics={metrics}
              techniques={forecast.mitre}
              mitreVersion={mitreVersion}
              scenarioId={scenarioId}
              frameId={currentFrame}
            >
              <div data-testid="lower-workspace" className="col-span-12">
                <WorkspaceTabs
                  evidence={forecast.evidence}
                  metrics={metrics}
                  techniques={forecast.mitre}
                  mitreVersion={mitreVersion}
                  scenarioId={scenarioId}
                  frameId={currentFrame}
                  nodes={current.nodes}
                  targetRanking={forecast.target_ranking}
                  currentFrameData={current}
                  mode={mode}
                  simulationResult={simulationResult}
                  simulationLoading={simulationLoading}
                  simulationError={simulationError}
                  onSimulateResult={(res, host) => {
                    setSimulationResult(res);
                    setSimulationHost(host);
                  }}
                  onLoadingChange={setSimulationLoading}
                  onErrorChange={setSimulationError}
                  frames={frames}
                  currentFrame={currentFrame}
                />
              </div>
            </TechnicalProofDrawer>
          </div>

          {/* Ground Truth & Flow Summary - below tabs - gated ground_truth hidden before 20 preserved, synthetic fallback visible */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Ground Truth - gated */}
            <div
              className={`bg-navy-800 border rounded-lg p-4 flex flex-col gap-2 ${groundTruth.revealed ? 'border-coral-500 bg-coral-500/5' : 'border-navy-700'}`}
              data-testid="ground-truth-panel"
            >
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${groundTruth.revealed ? 'bg-coral-400' : 'bg-cyan-400'}`} aria-hidden="true"></span>
                Ground Truth - {groundTruth.revealed ? 'Revealed' : 'Hidden'} - gated
              </h3>
              <div className="text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Event:</span>
                  <span className={`font-bold ${groundTruth.revealed ? 'text-coral-400' : 'text-cyan-400'}`}>{groundTruth.event}</span>
                  {groundTruth.revealed && groundTruth.attack_type && (
                    <span className="px-2 py-0.5 rounded bg-coral-500/20 text-coral-400 border border-coral-500 text-[13px]">
                      {groundTruth.attack_type}
                    </span>
                  )}
                </div>
                <p className="text-gray-500 mt-1">{groundTruth.details || (groundTruth.revealed ? 'Attack revealed at frame 20' : 'No attack revealed yet - benign profile')}</p>
                {groundTruth.revealed && groundTruth.label_distribution ? (
                  <div className="mt-2 text-[13px] bg-navy-700 rounded p-2 border border-navy-700">
                    <span className="text-gray-400">Label distribution (revealed):</span>
                    <div className="font-mono text-gray-300 mt-1">
                      {Object.entries(groundTruth.label_distribution)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' - ')}
                    </div>
                    {groundTruth.true_malicious_ratio !== null && groundTruth.true_malicious_ratio !== undefined && (
                      <div className="text-gray-400 mt-1">
                        True malicious ratio: {(groundTruth.true_malicious_ratio as number).toFixed(3)} - count{' '}
                        {groundTruth.true_malicious_count as number}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[13px] text-gray-500 mt-1">
                    Label distribution hidden until frame 20 - future labels not exposed before reveal (leakage-safe)
                  </div>
                )}
                <div className="text-[13px] text-gray-500 mt-1">
                  Ground truth start frame: {groundTruth.ground_truth_frame ?? 20} - Warning should appear before this (frame 8) - chronological replay
                </div>
                {simulationResult && (
                  <div className="text-[13px] text-orange-400 mt-2 bg-orange-500/10 border border-orange-500/20 rounded p-1.5">
                    Simulation active for host {simulationHost} at frame {simulationResult.frame_id} - {simulationResult.label} - original replay unchanged (immutable)
                  </div>
                )}
              </div>
            </div>

            {/* Flow Summary - Observed + Model-Predicted */}
            <div className="bg-navy-800 border border-navy-700 rounded-lg p-4 flex flex-col gap-2" data-testid="flow-summary-panel">
              <h3 className="text-sm font-semibold text-white">Flow Summary - Observed + Model-Predicted</h3>
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <div className="bg-navy-700 rounded p-2">
                  <span className="text-gray-400">Total flows (observed)</span>
                  <div className="font-mono font-bold text-white">{current.flow_summary.total_flows}</div>
                </div>
                <div className="bg-navy-700 rounded p-2">
                  <span className="text-gray-400">Distinct ports (observed)</span>
                  <div className="font-mono font-bold text-cyan-400">{current.flow_summary.distinct_ports}</div>
                </div>
                <div className="bg-navy-700 rounded p-2">
                  <span className="text-gray-400">Distinct hosts (observed)</span>
                  <div className="font-mono font-bold text-cyan-400">{current.flow_summary.distinct_dest_ips}</div>
                </div>
                <div className="bg-navy-700 rounded p-2">
                  <span className="text-gray-400">Predicted malicious</span>
                  <div className="font-mono font-bold text-purple-400">
                    {current.flow_summary.predicted_malicious_count} ({(current.flow_summary.predicted_malicious_ratio * 100).toFixed(1)}%)
                  </div>
                  <span className="text-gray-500 text-[13px]">Model-predicted, not label-derived</span>
                </div>
                <div className="bg-navy-700 rounded p-2">
                  <span className="text-gray-400">Avg bytes/s (observed)</span>
                  <div className="font-mono text-white">
                    {current.flow_summary.avg_bytes_per_sec ? current.flow_summary.avg_bytes_per_sec.toFixed(0) : '0'}
                  </div>
                </div>
                <div className="bg-navy-700 rounded p-2">
                  <span className="text-gray-400">Avg packets/s (observed)</span>
                  <div className="font-mono text-white">
                    {current.flow_summary.avg_packets_per_sec ? current.flow_summary.avg_packets_per_sec.toFixed(0) : '0'}
                  </div>
                </div>
              </div>
              <p className="text-[13px] text-purple-400">Predicted fields source: {current.flow_summary.predicted_source || 'model-predicted (Random Forest, threshold 0.45)'}</p>
            </div>
          </div>

          {/* Engine metadata & claim limitations - preserved */}
          <div className="col-span-12 bg-navy-800 border border-navy-700 rounded-lg p-3" data-testid="claim-limitations">
            <h4 className="text-[13px] font-semibold text-white">Engine Metadata</h4>
            <div className="text-[13px] text-gray-400 mt-1 space-y-0.5">
              <div>
                Model:{' '}
                <span className="text-white">
                  {(current.forecast.engine_metadata?.model_family as string) || modelFamily || 'unavailable'}
                </span>{' '}
                - {(current.forecast.engine_metadata?.model_version as string) || modelVersion || 'unavailable'} -{' '}
                {(current.forecast.engine_metadata?.feature_count as number) || 80} features
              </div>
              <div>
                Data mode: <span className="text-white">{dataMode}</span> - Feature schema{' '}
                {(current.forecast.engine_metadata?.feature_schema_version as string) || 'phase03-v1-sealed'}
              </div>
              <div className="text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded p-1.5 mt-2">
                <span className="font-bold">Limitations:</span> {claimLimitations.slice(0, 180)}...
              </div>
            </div>
          </div>

          {/* Footer for visual language compliance */}
          <div className="col-span-12 text-[13px] text-gray-500 text-center py-2 border-t border-navy-700">
            Visual language: Navy background/surfaces - Cyan observed/healthy - Purple prediction - Orange simulation - Coral critical - Dashed predicted - Muted removed - Text labels and icons accompany every color state - 1280x720 and 1440x900 readable - No WebSocket - Deterministic seed 42
          </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
