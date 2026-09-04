import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { EvidencePanel } from './EvidencePanel';
import { MitrePanel } from './MitrePanel';
import { SimulationPanel } from './SimulationPanel';
import { MetricsPanel } from './MetricsPanel';
import { TrajectoryPanel } from './TrajectoryPanel';
import type { EvaluationMetrics, MitreTechnique, NetworkNode, TargetRankingEntry, ScenarioFrame, SimulationResult } from '../api/generated';

type TabId = 'evidence' | 'mitre' | 'simulation' | 'metrics' | 'trajectory';

interface WorkspaceTabsProps {
  evidence: string[];
  metrics: EvaluationMetrics | null;
  techniques: MitreTechnique[];
  mitreVersion: string;
  scenarioId: string;
  frameId: number;
  nodes: NetworkNode[];
  targetRanking: TargetRankingEntry[];
  currentFrameData?: ScenarioFrame | null;
  mode?: 'api' | 'offline' | 'loading';
  simulationResult: SimulationResult | null;
  simulationLoading: boolean;
  simulationError: string | null;
  onSimulateResult: (res: SimulationResult | null, host: string | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (err: string | null) => void;
  frames: ScenarioFrame[];
  currentFrame: number;
}

const TABS: Array<{ id: TabId; label: string; testId: string; panelId: string; btnId: string }> = [
  { id: 'evidence', label: 'Evidence', testId: 'tab-evidence', panelId: 'panel-evidence', btnId: 'tab-evidence' },
  { id: 'mitre', label: 'MITRE ATT&CK', testId: 'tab-mitre', panelId: 'panel-mitre', btnId: 'tab-mitre' },
  { id: 'simulation', label: 'What-if Isolation', testId: 'tab-simulation', panelId: 'panel-simulation', btnId: 'tab-simulation' },
  { id: 'metrics', label: 'Metrics', testId: 'tab-metrics', panelId: 'panel-metrics', btnId: 'tab-metrics' },
  { id: 'trajectory', label: 'Trajectory', testId: 'tab-trajectory', panelId: 'panel-trajectory', btnId: 'tab-trajectory' },
];

export function WorkspaceTabs({
  evidence,
  metrics,
  techniques,
  mitreVersion,
  scenarioId,
  frameId,
  nodes,
  targetRanking,
  currentFrameData,
  mode = 'api',
  simulationResult,
  simulationLoading,
  simulationError,
  onSimulateResult,
  onLoadingChange,
  onErrorChange,
  frames,
  currentFrame,
}: WorkspaceTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('evidence');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (e: KeyboardEvent) => {
    const idx = TABS.findIndex((t) => t.id === activeTab);
    let nextIdx: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
        nextIdx = (idx + 1) % TABS.length;
        break;
      case 'ArrowLeft':
        nextIdx = (idx - 1 + TABS.length) % TABS.length;
        break;
      case 'Home':
        nextIdx = 0;
        break;
      case 'End':
        nextIdx = TABS.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    const nextTab = TABS[nextIdx].id;
    setActiveTab(nextTab);
    // focus after state
    requestAnimationFrame(() => {
      tabRefs.current[nextIdx!]?.focus();
    });
  };

  // Ensure refs length
  useEffect(() => {
    tabRefs.current = tabRefs.current.slice(0, TABS.length);
  }, []);

  return (
    <div
      className="bg-navy-800 border border-navy-700 rounded-lg flex flex-col overflow-hidden"
      data-testid="workspace-tabs"
      data-testid-lower="lower-workspace"
      // Provide alternative test id attribute via data-testid for compatibility - primary is workspace-tabs
      id="lower-workspace"
    >
      {/* Tab bar - Stitch design-system tokens */}
      <div
        role="tablist"
        aria-label="Analyst workspace tabs"
        className="h-9 px-3 bg-cyber-950 border-b border-cyber-800 flex gap-1 items-center shrink-0 overflow-x-auto"
        onKeyDown={handleKeyDown}
      >
        {TABS.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              id={tab.btnId}
              role="tab"
              aria-selected={isActive}
              aria-controls={tab.panelId}
              tabIndex={isActive ? 0 : -1}
              data-testid={`workspace-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-[13px] font-mono border-b-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-0 focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-t ${
                isActive
                  ? 'border-cyber-cyan text-cyber-cyan bg-cyber-950'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-cyber-700'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content container - Stitch tokens flex-1 p-3 overflow-y-auto bg-cyber-950 */}
      <div className="flex-1 p-3 overflow-y-auto bg-cyber-950 min-h-[280px]">
        {/* Evidence */}
        <div
          id="panel-evidence"
          role="tabpanel"
          aria-labelledby="tab-evidence"
          hidden={activeTab !== 'evidence'}
          data-testid="tab-evidence"
        >
          {/*
           * Reusing existing component without rewriting internal logic - props from forecast/metrics via API
           * Observed evidence vs global importance split preserved, not causal wording retained
           */}
          <EvidencePanel evidence={evidence} metrics={metrics} />
        </div>

        {/* MITRE */}
        <div
          id="panel-mitre"
          role="tabpanel"
          aria-labelledby="tab-mitre"
          hidden={activeTab !== 'mitre'}
          data-testid="tab-mitre"
        >
          <MitrePanel techniques={techniques} mitreVersion={mitreVersion} />
        </div>

        {/* Simulation */}
        <div
          id="panel-simulation"
          role="tabpanel"
          aria-labelledby="tab-simulation"
          hidden={activeTab !== 'simulation'}
          data-testid="tab-simulation"
        >
          <SimulationPanel
            scenarioId={scenarioId}
            frameId={frameId}
            nodes={nodes}
            targetRanking={targetRanking}
            currentFrameData={currentFrameData}
            mode={mode}
            simulationResult={simulationResult}
            simulationLoading={simulationLoading}
            simulationError={simulationError}
            onSimulateResult={onSimulateResult}
            onLoadingChange={onLoadingChange}
            onErrorChange={onErrorChange}
          />
        </div>

        {/* Metrics */}
        <div
          id="panel-metrics"
          role="tabpanel"
          aria-labelledby="tab-metrics"
          hidden={activeTab !== 'metrics'}
          data-testid="tab-metrics"
        >
          <MetricsPanel metrics={metrics} />
        </div>

        {/* Trajectory */}
        <div
          id="panel-trajectory"
          role="tabpanel"
          aria-labelledby="tab-trajectory"
          hidden={activeTab !== 'trajectory'}
          data-testid="tab-trajectory"
        >
          <TrajectoryPanel frames={frames} currentFrame={currentFrame} />
        </div>
      </div>
    </div>
  );
}

export default WorkspaceTabs;
