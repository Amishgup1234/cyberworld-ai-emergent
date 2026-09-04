/* eslint-disable @typescript-eslint/no-explicit-any */
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import type { NetworkNode, NetworkEdge, TargetRankingEntry } from '../api/generated';
import { getAllPositions, sanitizeAlias } from '../utils/layout';
import { Server, Monitor, Database, Shield, Globe, HardDrive, Filter, Maximize2, Eye, EyeOff } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { HostDetailsDrawer } from './HostDetailsDrawer';

interface TopologyProps {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  predictedPath: Record<string, unknown> | null | undefined;
  groundTruthRevealed: boolean;
  warning: boolean;
  removedEdges?: NetworkEdge[] | null;
  simulationActive?: boolean;
  targetRanking?: TargetRankingEntry[] | null;
}

function getRoleIcon(role: string) {
  switch (role) {
    case 'server':
      return Server;
    case 'database':
      return Database;
    case 'domain_controller':
      return Shield;
    case 'web_server':
      return Globe;
    case 'firewall':
      return HardDrive;
    default:
      return Monitor;
  }
}

export function Topology({
  nodes,
  edges,
  predictedPath,
  groundTruthRevealed,
  warning,
  removedEdges,
  simulationActive,
  targetRanking,
}: TopologyProps) {
  const [showAll, setShowAll] = useState(false);
  const [criticalityFilter, setCriticalityFilter] = useState<string>('All');
  const [observedStateFilter, setObservedStateFilter] = useState<string>('All');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [riskThreshold, setRiskThreshold] = useState<number>(0);
  const [selectedHost, setSelectedHost] = useState<NetworkNode | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const rankingMap = useMemo(() => {
    const m = new Map<string, TargetRankingEntry>();
    if (targetRanking) {
      for (const r of targetRanking) {
        if (r.host) m.set(r.host, r);
        if ((r as any).alias) m.set((r as any).alias, r);
      }
    }
    return m;
  }, [targetRanking]);

  const filteredByControls = useMemo(() => {
    return nodes.filter((n) => {
      if (criticalityFilter !== 'All' && n.criticality !== criticalityFilter) return false;
      if (observedStateFilter !== 'All' && n.observed_state !== observedStateFilter) return false;
      if (roleFilter !== 'All' && n.role !== roleFilter) return false;
      if (n.risk < riskThreshold) return false;
      return true;
    });
  }, [nodes, criticalityFilter, observedStateFilter, roleFilter, riskThreshold]);

  const sortedNodes = useMemo(() => {
    const getScore = (n: NetworkNode) => {
      const entry = rankingMap.get(n.id);
      if (entry) return entry.target_score;
      // fallback: risk * criticality numeric for relevance
      const crit = (n as any).criticality_numeric ?? (n.criticality === 'high' ? 3 : n.criticality === 'medium' ? 2 : 1);
      return n.risk * Number(crit) + n.risk * 0.1;
    };
    const getCrit = (n: NetworkNode) => (n as any).criticality_numeric ?? (n.criticality === 'high' ? 3 : n.criticality === 'medium' ? 2 : 1);
    return [...filteredByControls].sort((a, b) => {
      const sa = getScore(a);
      const sb = getScore(b);
      if (sb !== sa) return sb - sa;
      const ca = getCrit(a);
      const cb = getCrit(b);
      if (cb !== ca) return cb - ca;
      if (b.risk !== a.risk) return b.risk - a.risk;
      return a.id.localeCompare(b.id);
    });
  }, [filteredByControls, rankingMap]);

  const visibleCountDefault = 20;
  const visibleNodes = useMemo(() => {
    if (showAll) return sortedNodes;
    if (sortedNodes.length <= 25) return sortedNodes;
    return sortedNodes.slice(0, visibleCountDefault);
  }, [sortedNodes, showAll]);

  const backgroundNodes = useMemo(() => {
    if (showAll || sortedNodes.length <= 25) return [];
    return sortedNodes.slice(visibleCountDefault);
  }, [sortedNodes, showAll]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const filteredEdges = useMemo(() => {
    // only edges where both endpoints visible
    return edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  }, [edges, visibleIds]);

  const positions = useMemo(() => getAllPositions(visibleNodes), [visibleNodes]);

  const clusterCount = backgroundNodes.length;

  const selectedRankingEntry = useMemo(() => {
    if (!selectedHost) return null;
    return rankingMap.get(selectedHost.id) || null;
  }, [selectedHost, rankingMap]);

  const handleNodeClick = (_event: any, node: any) => {
    if (node.id === 'cluster-background') {
      setShowAll(true);
      return;
    }
    const found = nodes.find((n) => n.id === node.id) || visibleNodes.find((n) => n.id === node.id);
    if (found) setSelectedHost(found);
  };



  const rfNodes = useMemo(() => {
    const baseNodes = visibleNodes.map((n) => {
      const pos = positions.get(n.id) || { x: 100, y: 100 };
      const isSuspicious = n.observed_state === 'suspicious' || (warning && n.risk > 0.45);
      const isGroundTruth = groundTruthRevealed && isSuspicious;
      const Icon = getRoleIcon(n.role);
      let label = 'Observed - healthy';
      if (isGroundTruth) {
        label = 'Ground truth - critical';
      } else if (isSuspicious) {
        label = 'Suspicious - predicted';
      }
      const critColor =
        n.criticality === 'high' ? 'bg-coral-500' : n.criticality === 'medium' ? 'bg-orange-500' : 'bg-cyan-500';
      const safeDisplayAlias = sanitizeAlias((n as any).alias || n.id);

      return {
        id: n.id,
        position: pos,
        data: {
          label: (
            <div
              role="button"
              tabIndex={0}
              data-testid={`host-node-${n.id}`}
              aria-label={`Host ${safeDisplayAlias} - ${n.role} - risk ${n.risk.toFixed(2)} - ${n.criticality} - ${label}`}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space' || e.key === 'Spacebar') {
                  e.preventDefault();
                  e.stopPropagation();
                  const found = nodes.find((x) => x.id === n.id) || visibleNodes.find((x) => x.id === n.id);
                  if (found) setSelectedHost(found);
                  else handleNodeClick(null, { id: n.id });
                }
              }}
              onClick={() => {
                const found = nodes.find((x) => x.id === n.id) || visibleNodes.find((x) => x.id === n.id);
                if (found) setSelectedHost(found);
              }}
              className="flex flex-col items-center gap-0 px-0.5 py-0.5 leading-tight text-[13px] focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 rounded cursor-pointer"
            >
              <Icon className="w-3 h-3" aria-hidden="true" />
              <span className="text-[13px] font-mono font-bold truncate max-w-[96px]">{safeDisplayAlias}</span>
              <span className="text-[13px] opacity-80 truncate max-w-[96px]">{n.role}</span>
              <span className="text-[13px] font-mono leading-none">{n.risk.toFixed(2)}</span>
              <span className="text-[13px] flex items-center gap-1 leading-none">
                <span className={`w-1.5 h-1.5 rounded-full ${critColor}`} aria-hidden="true"></span>
                {n.criticality}
              </span>
              <span className="text-[13px] opacity-60 leading-none truncate max-w-[96px]">{label}</span>
            </div>
          ),
        },
        style: {
          background: 'transparent',
          border: `2px solid ${isGroundTruth ? '#f87171' : isSuspicious ? '#fb923c' : '#22d3ee'}`,
          borderRadius: '8px',
          padding: '4px',
          width: '105px',
          minWidth: '105px',
          fontSize: '13px',
          color: isGroundTruth ? '#f87171' : isSuspicious ? '#fb923c' : '#22d3ee',
          backgroundColor: isGroundTruth ? 'rgba(248,113,113,0.1)' : isSuspicious ? 'rgba(251,146,60,0.1)' : '#111827',
        },
        type: 'default' as const,
        focusable: false,
        selectable: true,
      } as any;
    });

    if (clusterCount > 0) {
      baseNodes.push({
        id: 'cluster-background',
        position: { x: 730, y: 30 },
        data: {
          label: (
            <div
              role="button"
              tabIndex={0}
              aria-label={`Clustered ${clusterCount} background hosts - press Enter or Space to expand`}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
                  e.preventDefault();
                  setShowAll(true);
                }
              }}
              onClick={() => setShowAll(true)}
              className="flex flex-col items-center gap-1 px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 rounded cursor-pointer"
            >
              <span className="w-6 h-6 rounded-full bg-slate-700 border border-dashed border-slate-500 flex items-center justify-center text-slate-300 font-mono">+{clusterCount}</span>
              <span className="font-mono font-bold text-slate-300">+{clusterCount} hosts</span>
              <span className="text-slate-400">clustered - low-risk</span>
            </div>
          ),
        },
        style: {
          background: '#1f2937',
          border: '2px dashed #334155',
          borderRadius: '12px',
          padding: '8px',
          minWidth: '100px',
          color: '#94a3b8',
          backgroundColor: 'rgba(30,41,59,0.8)',
        },
        type: 'default' as const,
        focusable: false,
        selectable: true,
      } as any);
    }

    return baseNodes;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, positions, warning, groundTruthRevealed, clusterCount]);

  const rfEdges = useMemo(() => {
    const removedSet = new Set((removedEdges || []).map((re) => `${re.source}-${re.target}`));
    const base = filteredEdges.map((e) => {
      const isGroundTruthEdge = groundTruthRevealed && e.novelty > 0.8;
      const isRemoved = removedSet.has(`${e.source}-${e.target}`) || removedSet.has(`${e.target}-${e.source}`);
      if (isRemoved && simulationActive) {
        return {
          id: `${e.source}-${e.target}-removed`,
          source: e.source,
          target: e.target,
          label: `${e.protocol} ${e.activity} - removed - simulated`,
          style: {
            stroke: '#fb923c',
            strokeWidth: 1,
            opacity: 0.45,
            strokeDasharray: '4 4',
          },
          labelStyle: { fontSize: 13, fill: '#fb923c', background: '#111827' },
          animated: false,
          data: { status: 'removed', style: 'muted' },
        };
      }
      return {
        id: `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: `${e.protocol} ${e.activity}`,
        style: {
          stroke: isGroundTruthEdge ? '#f87171' : '#22d3ee',
          strokeWidth: Math.min(3, 1 + e.activity * 0.3),
        },
        labelStyle: { fontSize: 13, fill: '#9ca3af', background: '#111827' },
        animated: false,
        data: { status: isGroundTruthEdge ? 'ground_truth' : 'observed' },
      };
    });

    if (removedEdges && removedEdges.length > 0 && simulationActive) {
      for (const re of removedEdges) {
        // only add if both endpoints would be visible or if showAll, but for filtered view still show removed edges among visible?
        // If edge endpoints not in visibleIds, skip unless showAll
        if (!showAll && (!visibleIds.has(re.source) || !visibleIds.has(re.target))) {
          continue;
        }
        const id = `${re.source}-${re.target}`;
        const already = base.some((ed) => `${ed.source}-${ed.target}` === id || `${ed.source}-${ed.target}-removed` === id);
        if (!already) {
          base.push({
            id: `removed-extra-${re.source}-${re.target}`,
            source: re.source,
            target: re.target,
            label: `${re.protocol} - removed - simulated`,
            style: {
              stroke: '#fb923c',
              strokeWidth: 1,
              opacity: 0.45,
              strokeDasharray: '4 4',
            } as unknown as Record<string, unknown>,
            labelStyle: { fontSize: 13, fill: '#fb923c', background: '#111827' } as unknown as Record<string, unknown>,
            animated: false,
            data: { status: 'removed', style: 'muted' },
          } as unknown as typeof base[number]);
        }
      }
    }

    if (predictedPath && predictedPath.source && predictedPath.target) {
      const src = predictedPath.source as string;
      const tgt = predictedPath.target as string;
      if (visibleIds.has(src) && visibleIds.has(tgt)) {
        const exists = base.some((ed) => ed.source === src && ed.target === tgt);
        if (!exists) {
          base.push({
            id: `predicted-${src}-${tgt}`,
            source: src,
            target: tgt,
            label: `Predicted ${(predictedPath.protocol as string) || 'TCP'}`,
            style: {
              stroke: '#a855f7',
              strokeWidth: 2,
              strokeDasharray: '6 3',
            } as any,
            labelStyle: { fontSize: 13, fill: '#a855f7', background: '#111827' },
            animated: true,
            data: { status: 'predicted' },
          });
        } else {
          base.push({
            id: `predicted-overlay-${src}-${tgt}`,
            source: src,
            target: tgt,
            label: 'Predicted path',
            style: {
              stroke: '#a855f7',
              strokeWidth: 2,
              strokeDasharray: '6 3',
            } as any,
            labelStyle: { fontSize: 13, fill: '#a855f7', backgroundColor: '#111827' } as unknown as Record<string, unknown>,
            animated: true,
            data: { status: 'predicted' },
          } as unknown as typeof base[number]);
        }
      } else if (showAll) {
        // if showAll, still add predicted edge even if not filtered? but visibleIds would include them
      }
    }

    return base;
  }, [filteredEdges, predictedPath, groundTruthRevealed, removedEdges, simulationActive, visibleIds, showAll]);

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg flex flex-col overflow-hidden" data-testid="topology" style={{ height: '660px' }}>
      <div className="px-4 py-2 border-b border-navy-700 flex items-center justify-between flex-wrap gap-2 bg-cyber-900/50 sm:bg-navy-800">
        <h3 className="text-[13px] font-bold tracking-wide uppercase text-white flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${simulationActive ? 'bg-orange-400' : 'bg-cyan-400'}`} aria-hidden="true"></span>
          NETWORK DIGITAL TWIN
          <span className="text-[13px] font-normal text-gray-400 normal-case tracking-normal hidden sm:inline">- React Flow - cyber-grid 32px</span>
          {simulationActive ? <span className="text-[13px] font-normal text-orange-400 normal-case">- orange muted removed edges active (simulated)</span> : <span className="text-[13px] font-normal text-gray-400 normal-case">- observed topology</span>}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-gray-400" data-testid="topology-count">
            {visibleNodes.length} hosts visible
            {clusterCount > 0 ? ` - +${clusterCount} clustered` : ''} - {filteredEdges.length} edges - {predictedPath ? '+ 1 predicted' : ''}
            {groundTruthRevealed ? ' - coral ground truth revealed' : ''}
            {simulationActive ? ` - ${removedEdges?.length ?? 0} removed - simulated` : ''}
          </span>
          {clusterCount > 0 && (
            <span className="text-[13px] px-1.5 py-0.5 rounded bg-slate-800 border border-dashed border-slate-600 text-slate-300 font-mono" data-testid="cluster-count-badge">
              Clustered: {clusterCount}
            </span>
          )}
        </div>
      </div>

      {/* Filter bar - keyboard accessible */}
      <div className="px-3 py-2 border-b border-navy-700 bg-navy-700/30 flex flex-wrap items-center gap-2" data-testid="topology-filters" role="toolbar" aria-label="Topology filters">
        <span className="inline-flex items-center gap-1 text-[13px] text-gray-400">
          <Filter className="w-3 h-3" aria-hidden="true" />
          Filters:
        </span>
        <label className="flex items-center gap-1 text-[13px]">
          <span className="text-gray-400">Criticality</span>
          <select
            aria-label="Filter by criticality"
            value={criticalityFilter}
            onChange={(e) => setCriticalityFilter(e.target.value)}
            className="bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-[13px] text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            data-testid="filter-criticality"
          >
            <option value="All">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[13px]">
          <span className="text-gray-400">State</span>
          <select
            aria-label="Filter by observed state"
            value={observedStateFilter}
            onChange={(e) => setObservedStateFilter(e.target.value)}
            className="bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-[13px] text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            data-testid="filter-observed-state"
          >
            <option value="All">All</option>
            <option value="observed">observed</option>
            <option value="suspicious">suspicious</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[13px]">
          <span className="text-gray-400">Role</span>
          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-[13px] text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            data-testid="filter-role"
          >
            <option value="All">All</option>
            <option value="workstation">workstation</option>
            <option value="server">server</option>
            <option value="database">database</option>
            <option value="domain_controller">domain_controller</option>
            <option value="firewall">firewall</option>
            <option value="web_server">web_server</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[13px]">
          <span className="text-gray-400">Risk {'>='}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={riskThreshold}
            onChange={(e) => setRiskThreshold(parseFloat(e.target.value))}
            aria-label="Risk threshold filter"
            className="w-20 accent-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
            data-testid="filter-risk"
          />
          <span className="font-mono text-cyan-400 w-8">{riskThreshold.toFixed(2)}</span>
        </label>
        <button
          onClick={() => {
            setCriticalityFilter('All');
            setObservedStateFilter('All');
            setRoleFilter('All');
            setRiskThreshold(0);
          }}
          className="text-[13px] px-2 py-0.5 rounded bg-navy-800 border border-navy-700 text-gray-300 hover:bg-navy-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          aria-label="Clear filters"
          data-testid="filter-clear"
        >
          Clear
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          {sortedNodes.length > 25 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              aria-label={showAll ? 'Show clustered hosts collapsed' : `Show all ${sortedNodes.length} hosts`}
              data-testid="show-all-btn"
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[13px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              {showAll ? <EyeOff className="w-3 h-3" aria-hidden="true" /> : <Eye className="w-3 h-3" aria-hidden="true" />}
              {showAll ? 'Show Less' : `Show All (${sortedNodes.length})`}
            </button>
          )}
          {sortedNodes.length > 0 && sortedNodes.length <= 25 && (
            <span className="text-[13px] text-gray-500 hidden sm:inline">Showing {visibleNodes.length} of {sortedNodes.length}</span>
          )}
          {sortedNodes.length > 25 && showAll && (
            <span className="text-[13px] text-gray-500 hidden sm:inline">Showing {visibleNodes.length} of {sortedNodes.length} - expanded</span>
          )}
          <button
            onClick={() => reactFlowInstance?.fitView?.({ padding: 0.2, duration: 300 })}
            aria-label="Fit topology view"
            data-testid="fit-view-btn"
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-navy-800 hover:bg-navy-700 border border-navy-700 text-[13px] text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <Maximize2 className="w-3 h-3" aria-hidden="true" />
            Fit View
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-cyber-950 sm:bg-navy-900">
        <style>{`
          .react-flow__controls-button:focus { outline: none; box-shadow: 0 0 0 2px #22d3ee; border-color: #22d3ee; }
          .react-flow__controls-button:focus-visible { outline: none; box-shadow: 0 0 0 2px #22d3ee; }
          .react-flow__node:focus { outline: none; box-shadow: 0 0 0 2px #22d3ee; }
          .react-flow__node:focus-visible { outline: none; box-shadow: 0 0 0 2px #22d3ee; }
        `}</style>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          nodesFocusable={false}
          edgesFocusable={false}
          onNodeClick={handleNodeClick}
          onInit={setReactFlowInstance}
        >
          <Background color="#1e293b" gap={32} size={1} />
          <Controls showInteractive={false} className="!bg-navy-800 !border-navy-700 [&_button]:focus:outline-none [&_button]:focus:ring-2 [&_button]:focus:ring-cyan-400 [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-cyan-400" />
          <MiniMap className="!bg-navy-700 !border-navy-700" maskColor="rgba(10,15,26,0.8)" nodeColor="#22d3ee" />
        </ReactFlow>
        {/* cluster count overlay if needed */}
        {clusterCount > 0 && !showAll && (
          <div className="absolute bottom-2 left-2 bg-slate-800 border border-dashed border-slate-600 rounded px-2 py-1 text-[13px] font-mono text-slate-300" data-testid="cluster-node" aria-label={`Clustered ${clusterCount} background hosts`}>
            +{clusterCount} hosts clustered - Show All to expand
          </div>
        )}
      </div>

      {/* Legend - must have text and icon accompanying color, never color alone */}
      <div className="px-3 py-2 border-t border-navy-700 bg-navy-700/50 flex flex-wrap gap-3 text-[13px]" data-testid="topology-legend">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-cyan-400" aria-hidden="true"></span>
          <span className="w-2 h-2 rounded-full bg-cyan-400" aria-hidden="true"></span>
          <span className="text-cyan-400">Observed - cyan solid - healthy</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5 border-t-2 border-purple-400 border-dashed" style={{ borderStyle: 'dashed' }} aria-hidden="true"></span>
          <span className="w-2 h-2 rounded-full bg-purple-400" aria-hidden="true"></span>
          <span className="text-purple-400">Predicted path - purple dashed</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-coral-400" aria-hidden="true"></span>
          <span className="w-2 h-2 rounded-full bg-coral-400" aria-hidden="true"></span>
          <span className="text-coral-400">Ground truth - coral - critical risk</span>
        </span>
        <span className="inline-flex items-center gap-1.5 opacity-60">
          <span className="w-4 h-0.5 bg-orange-400" style={{ opacity: 0.5 }} aria-hidden="true"></span>
          <span className="w-2 h-2 rounded-full bg-orange-400 opacity-50" aria-hidden="true"></span>
          <span className="text-orange-400">Simulated removed - orange muted</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true"></span>
          <span className="w-4 h-0.5 bg-emerald-500" aria-hidden="true"></span>
          <span className="text-emerald-400">Benign Pool - emerald - background clustered</span>
        </span>
        <span className="ml-auto text-gray-500 hidden sm:inline">Color never alone - text and icon accompany every state</span>
      </div>

      <HostDetailsDrawer host={selectedHost} rankingEntry={selectedRankingEntry} onClose={() => setSelectedHost(null)} />
    </div>
  );
}
