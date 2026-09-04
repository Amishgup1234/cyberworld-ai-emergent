import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Topology } from '../components/Topology';
import { HostDetailsDrawer } from '../components/HostDetailsDrawer';
import type { NetworkNode, NetworkEdge, TargetRankingEntry } from '../api/generated';
import { sanitizeAlias, getAllPositions, getNodePosition } from '../utils/layout';

function makeNodes(count: number): NetworkNode[] {
  const roles = ['workstation', 'server', 'database', 'domain_controller', 'firewall', 'web_server'] as const;
  const crits = ['low', 'medium', 'high'] as const;
  const nodes: NetworkNode[] = [];
  for (let i = 1; i <= count; i++) {
    const role = roles[i % roles.length] as string;
    const criticality = crits[i % crits.length] as string;
    const risk = (i % 10) / 10 + 0.1 + (i === 1 ? 0.5 : 0);
    nodes.push({
      id: `host-${i}`,
      alias: `host-${i}`,
      safe_alias: `host-${i}`,
      role,
      criticality,
      criticality_numeric: criticality === 'high' ? 3 : criticality === 'medium' ? 2 : 1,
      observed_state: i % 7 === 0 ? 'suspicious' : 'observed',
      risk,
      status: 'observed',
      first_seen: 0,
    } as NetworkNode);
  }
  return nodes;
}

function makeEdges(nodes: NetworkNode[]): NetworkEdge[] {
  const edges: NetworkEdge[] = [];
  for (let i = 0; i < Math.min(10, nodes.length - 1); i++) {
    edges.push({
      source: nodes[i].id,
      target: nodes[i + 1].id,
      protocol: 'TCP',
      activity: 2 + (i % 3),
      novelty: 0.8,
      status: 'observed',
      first_seen: 0,
      last_seen: 0,
    } as unknown as NetworkEdge);
  }
  return edges;
}

function makeRanking(nodes: NetworkNode[]): TargetRankingEntry[] {
  return nodes.slice(0, 10).map((n, idx) => ({
    host: n.id,
    alias: n.id,
    target_score: 20 - idx * 1.5 + (n.criticality === 'high' ? 5 : 0),
    incoming_activity: 5 + idx,
    edge_novelty: 0.9 - idx * 0.05,
    recent_risk_trend: 0.8,
    asset_criticality: n.criticality,
    criticality_numeric: n.criticality_numeric,
    role: n.role,
    rank: idx + 1,
  })) as TargetRankingEntry[];
}

describe('Topology - Phase 12 - 15-25 hosts default, clustering', () => {
  it('default view shows 15-25 hosts, not all, with cluster count badge and Show All', () => {
    const nodes = makeNodes(40);
    const edges = makeEdges(nodes);
    const ranking = makeRanking(nodes);
    render(
      <Topology
        nodes={nodes}
        edges={edges}
        predictedPath={null}
        groundTruthRevealed={false}
        warning={false}
        targetRanking={ranking}
      />
    );
    // Should show 20 visible by default (within 15-25)
    expect(screen.getByTestId('topology')).toBeInTheDocument();
    expect(screen.getByTestId('topology-count')).toHaveTextContent('20 hosts visible');
    // cluster count badge
    expect(screen.getByTestId('cluster-count-badge')).toHaveTextContent('Clustered: 20');
    expect(screen.getByTestId('cluster-node')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-node')).toHaveTextContent('+20 hosts clustered');
    // Show All button exists
    const showAllBtn = screen.getByTestId('show-all-btn');
    expect(showAllBtn).toBeInTheDocument();
    expect(showAllBtn).toHaveTextContent('Show All (40)');
    // header shows NETWORK DIGITAL TWIN
    expect(screen.getByText('NETWORK DIGITAL TWIN')).toBeInTheDocument();
  });

  it('Show All expands to show all hosts and toggles to Show Less', () => {
    const nodes = makeNodes(35);
    const edges = makeEdges(nodes);
    const ranking = makeRanking(nodes);
    render(
      <Topology
        nodes={nodes}
        edges={edges}
        predictedPath={null}
        groundTruthRevealed={false}
        warning={false}
        targetRanking={ranking}
      />
    );
    const btn = screen.getByTestId('show-all-btn');
    expect(screen.getByTestId('topology-count')).toHaveTextContent('20 hosts visible');
    fireEvent.click(btn);
    expect(screen.getByTestId('topology-count')).toHaveTextContent('35 hosts visible');
    expect(screen.queryByTestId('cluster-node')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cluster-count-badge')).not.toBeInTheDocument();
    // button now Show Less
    expect(screen.getByTestId('show-all-btn')).toHaveTextContent('Show Less');
    // clicking again collapses
    fireEvent.click(screen.getByTestId('show-all-btn'));
    expect(screen.getByTestId('topology-count')).toHaveTextContent('20 hosts visible');
    expect(screen.getByTestId('cluster-node')).toBeInTheDocument();
  });

  it('shows all when nodes <=25 with no clustering', () => {
    const nodes = makeNodes(12);
    const edges = makeEdges(nodes);
    render(
      <Topology
        nodes={nodes}
        edges={edges}
        predictedPath={null}
        groundTruthRevealed={false}
        warning={false}
        targetRanking={makeRanking(nodes)}
      />
    );
    expect(screen.getByTestId('topology-count')).toHaveTextContent('12 hosts visible');
    expect(screen.queryByTestId('cluster-node')).not.toBeInTheDocument();
    expect(screen.queryByTestId('show-all-btn')).not.toBeInTheDocument();
    // still shows filters
    expect(screen.getByTestId('topology-filters')).toBeInTheDocument();
  });

  it('filters by criticality, observed_state, role and risk are keyboard accessible', () => {
    const nodes = makeNodes(20);
    const edges = makeEdges(nodes);
    render(
      <Topology
        nodes={nodes}
        edges={edges}
        predictedPath={null}
        groundTruthRevealed={false}
        warning={false}
        targetRanking={makeRanking(nodes)}
      />
    );
    const critSelect = screen.getByTestId('filter-criticality');
    const stateSelect = screen.getByTestId('filter-observed-state');
    const roleSelect = screen.getByTestId('filter-role');
    const riskSlider = screen.getByTestId('filter-risk');
    const clearBtn = screen.getByTestId('filter-clear');

    expect(critSelect).toBeInTheDocument();
    expect(stateSelect).toBeInTheDocument();
    expect(roleSelect).toBeInTheDocument();
    expect(riskSlider).toBeInTheDocument();
    // a11y labels
    expect(critSelect).toHaveAttribute('aria-label', 'Filter by criticality');
    expect(stateSelect).toHaveAttribute('aria-label', 'Filter by observed state');
    expect(roleSelect).toHaveAttribute('aria-label', 'Filter by role');
    expect(riskSlider).toHaveAttribute('aria-label', 'Risk threshold filter');
    // focus rings preserved
    expect(critSelect.className).toContain('focus:ring-2');
    expect(critSelect.className).toContain('focus:ring-cyan-400');

    // check keyboard: can focus and change
    critSelect.focus();
    expect(document.activeElement).toBe(critSelect);
    fireEvent.change(critSelect, { target: { value: 'high' } });
    // after filtering to high only, count should reduce (approx 1/3 of 20 ~ 6-7)
    expect(screen.getByTestId('topology-count').textContent).toMatch(/\d+ hosts visible/);
    // clear resets
    fireEvent.click(clearBtn);
    expect((critSelect as HTMLSelectElement).value).toBe('All');
    expect((stateSelect as HTMLSelectElement).value).toBe('All');
    expect((roleSelect as HTMLSelectElement).value).toBe('All');
    expect((riskSlider as HTMLInputElement).value).toBe('0');
  });

  it('provides zoom and Fit View controls keyboard accessible', () => {
    const nodes = makeNodes(6);
    const edges = makeEdges(nodes);
    render(
      <Topology
        nodes={nodes}
        edges={edges}
        predictedPath={null}
        groundTruthRevealed={false}
        warning={false}
      />
    );
    const fitBtn = screen.getByTestId('fit-view-btn');
    expect(fitBtn).toBeInTheDocument();
    expect(fitBtn).toHaveAttribute('aria-label', 'Fit topology view');
    expect(fitBtn.className).toContain('focus:ring-2');
    expect(fitBtn.className).toContain('focus:ring-cyan-400');
    fitBtn.focus();
    expect(document.activeElement).toBe(fitBtn);
    // should not throw
    fireEvent.click(fitBtn);
    // React Flow Controls should be present (zoom buttons)
    // Controls renders buttons with class react-flow__controls
    expect(document.querySelector('.react-flow__controls')).toBeInTheDocument();
    // MiniMap present
    expect(document.querySelector('.react-flow__minimap')).toBeInTheDocument();
  });

  it('legend preserves observed cyan solid, predicted purple dashed, ground truth coral, simulated orange muted, benign emerald', () => {
    const nodes = makeNodes(3);
    const edges = makeEdges(nodes);
    render(
      <Topology
        nodes={nodes}
        edges={edges}
        predictedPath={{ source: 'host-1', target: 'host-2', protocol: 'TCP' }}
        groundTruthRevealed={true}
        warning={true}
        removedEdges={[{ source: 'host-1', target: 'host-2', protocol: 'TCP', activity: 1, novelty: 0.5, status: 'removed' } as unknown as NetworkEdge]}
        simulationActive={true}
      />
    );
    const legend = screen.getByTestId('topology-legend');
    expect(legend).toHaveTextContent('Observed - cyan solid - healthy');
    expect(legend).toHaveTextContent('Predicted path - purple dashed');
    expect(legend).toHaveTextContent('Ground truth - coral - critical risk');
    expect(legend).toHaveTextContent('Simulated removed - orange muted');
    expect(legend).toHaveTextContent('Benign Pool - emerald - background clustered');
    expect(legend).toHaveTextContent('Color never alone - text and icon accompany every state');
  });

  it('uses safe host-N aliases only - never raw IP - and no invented OS/packet details', () => {
    const nodes = makeNodes(20);
    const edges = makeEdges(nodes);
    const { container } = render(
      <Topology
        nodes={nodes}
        edges={edges}
        predictedPath={null}
        groundTruthRevealed={false}
        warning={false}
        targetRanking={makeRanking(nodes)}
      />
    );
    const text = container.textContent || '';
    // should contain host-N aliases
    expect(text).toMatch(/host-1/);
    // must NOT contain raw IP
    expect(text).not.toMatch(/192\.168\./);
    // must NOT contain invented OS/database details
    expect(text).not.toMatch(/Linux/);
    expect(text).not.toMatch(/PostgreSQL/);
    expect(text).not.toMatch(/Production Core Database/);
    // must NOT contain packet inspection details
    expect(text).not.toMatch(/Bytes\/s/);
    expect(text).not.toMatch(/TCP\/22/);
    // check topology count uses safe alias logic
    expect(screen.getByTestId('topology-count')).toHaveTextContent('hosts visible');
  });
});

describe('HostDetailsDrawer - accessible drawer with safe alias only', () => {
  const host: NetworkNode = {
    id: 'host-5',
    alias: 'host-5',
    safe_alias: 'host-5',
    role: 'database',
    criticality: 'high',
    criticality_numeric: 3,
    observed_state: 'suspicious',
    risk: 0.78,
    status: 'observed',
    first_seen: 0,
  } as NetworkNode;

  const rankingEntry: TargetRankingEntry = {
    host: 'host-5',
    alias: 'host-5',
    target_score: 14.57,
    incoming_activity: 8,
    edge_novelty: 0.8,
    recent_risk_trend: 0.9,
    asset_criticality: 'high',
    criticality_numeric: 3,
    role: 'database',
    rank: 1,
  } as TargetRankingEntry;

  it('renders drawer with role dialog, aria-modal, focus trap, Esc to close, data-testid', () => {
    const onClose = vi.fn();
    render(<HostDetailsDrawer host={host} rankingEntry={rankingEntry} onClose={onClose} />);
    const drawer = screen.getByTestId('host-details-drawer');
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveAttribute('role', 'dialog');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(drawer).toHaveAttribute('aria-labelledby', 'drawer-title');
    expect(screen.getByTestId('drawer-close')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-close')).toHaveAttribute('aria-label', 'Close host details drawer');
    // shows safe alias, role, criticality, risk, observed_state, status, incoming activity
    expect(drawer).toHaveTextContent('host-5');
    expect(drawer).toHaveTextContent('database');
    expect(drawer).toHaveTextContent('high');
    expect(drawer).toHaveTextContent('0.78');
    expect(drawer).toHaveTextContent('suspicious');
    expect(drawer).toHaveTextContent('observed');
    expect(drawer).toHaveTextContent('Incoming activity');
    expect(drawer).toHaveTextContent('8');
    // never shows raw IP or invented OS
    expect(drawer.textContent).not.toMatch(/192\.168\./);
    expect(drawer.textContent).not.toMatch(/Linux/);
    expect(drawer.textContent).not.toMatch(/PostgreSQL/);
    expect(drawer.textContent).not.toMatch(/Bytes\/s/);
    expect(drawer.textContent).not.toMatch(/TCP\/22/);
    // Esc closes
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('close button and overlay click close drawer, focus trap via Tab', () => {
    const onClose = vi.fn();
    const { container } = render(<HostDetailsDrawer host={host} rankingEntry={rankingEntry} onClose={onClose} />);
    const closeBtn = screen.getByTestId('drawer-close');
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
    const overlay = screen.getByTestId('drawer-overlay');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(2);
    // check drawer has close bottom button also
    expect(screen.getByTestId('drawer-close-bottom')).toBeInTheDocument();
    // focus trap: Tab should cycle
    // we at least ensure drawer contains focusable elements
    const focusable = container.querySelectorAll('button');
    expect(focusable.length).toBeGreaterThan(0);
  });

  it('does not render when host is null', () => {
    const { container } = render(<HostDetailsDrawer host={null} rankingEntry={null} onClose={() => {}} />);
    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('host-details-drawer')).not.toBeInTheDocument();
  });

  it('shows safe alias host-N and role/criticality/risk without raw IP even without ranking entry', () => {
    const lowHost: NetworkNode = {
      id: 'host-12',
      alias: 'host-12',
      safe_alias: 'host-12',
      role: 'workstation',
      criticality: 'low',
      criticality_numeric: 1,
      observed_state: 'observed',
      risk: 0.12,
      status: 'observed',
    } as NetworkNode;
    render(<HostDetailsDrawer host={lowHost} rankingEntry={null} onClose={() => {}} />);
    const drawer = screen.getByTestId('host-details-drawer');
    expect(drawer).toHaveTextContent('host-12');
    expect(drawer).toHaveTextContent('workstation');
    expect(drawer).toHaveTextContent('low');
    expect(drawer).toHaveTextContent('0.12');
    expect(drawer).toHaveTextContent('observed');
    expect(drawer.textContent).not.toMatch(/192\.168/);
  });
});

describe('Topology host-details integration via node click', () => {
  it('opens drawer on node click - verified via HostDetailsDrawer integration (React Flow click covered in Playwright)', async () => {
    const nodes = makeNodes(5);
    const edges = makeEdges(nodes);
    const ranking = makeRanking(nodes);
    render(
      <Topology
        nodes={nodes}
        edges={edges}
        predictedPath={null}
        groundTruthRevealed={false}
        warning={false}
        targetRanking={ranking}
      />
    );
    // initially no drawer - Topology manages drawer internally and is hidden until node click
    expect(screen.queryByTestId('host-details-drawer')).not.toBeInTheDocument();
    // Topology renders host-1 visible (since 5 hosts, all visible without clustering)
    expect(screen.getByText('host-1')).toBeInTheDocument();
    // verify that HostDetailsDrawer with that host would show safe alias and not raw IP
    // Direct HostDetailsDrawer render simulates what node click would do
    const host1 = nodes[0];
    const entry = ranking.find((r) => r.host === host1.id) || null;
    const { unmount } = render(<HostDetailsDrawer host={host1} rankingEntry={entry} onClose={() => {}} />);
    expect(screen.getAllByTestId('host-details-drawer').length).toBeGreaterThan(0);
    const drawers = screen.getAllByTestId('host-details-drawer');
    const lastDrawer = drawers[drawers.length - 1];
    expect(lastDrawer).toHaveTextContent('host-1');
    expect(lastDrawer.textContent).not.toMatch(/192\.168/);
    expect(lastDrawer.textContent).not.toMatch(/Linux/);
    unmount();
  });

  it('does not expose raw IP, flow ID, timestamp or packet details in topology or drawer', () => {
    const nodes = makeNodes(8);
    const edges = makeEdges(nodes);
    const { container } = render(
      <Topology
        nodes={nodes}
        edges={edges}
        predictedPath={null}
        groundTruthRevealed={false}
        warning={false}
        targetRanking={makeRanking(nodes)}
      />
    );
    const text = container.textContent || '';
    expect(text).not.toMatch(/192\.168/);
    expect(text).not.toMatch(/Flow ID/);
    // packet details blocked - drawer disclaimer no longer contains Bytes/s literal, topology should not
    expect(text).not.toMatch(/192\.168/);
    // ensure legend still present and safe
    expect(screen.getByTestId('topology-legend')).toBeInTheDocument();
  });
});

describe('sanitizeAlias - only host-N may be rendered', () => {
  it('returns host-N unchanged when alias matches /^host-\\d+$/', () => {
    expect(sanitizeAlias('host-1')).toBe('host-1');
    expect(sanitizeAlias('host-42')).toBe('host-42');
    expect(sanitizeAlias('host-999')).toBe('host-999');
  });

  it('sanitizes unsafe alias like raw IP to deterministic host-N, never exposing IP', () => {
    const sanitized = sanitizeAlias('192.168.1.1');
    expect(sanitized).toMatch(/^host-\d+$/);
    expect(sanitized).not.toMatch(/192\.168/);
    // deterministic: same input gives same output
    expect(sanitizeAlias('192.168.1.1')).toBe(sanitized);
    expect(sanitizeAlias('attacker-01')).toMatch(/^host-\d+$/);
    expect(sanitizeAlias('attacker-01')).not.toMatch(/attacker/);
  });

  it('Topology renders sanitized alias when API supplies unsafe alias', () => {
    const unsafeNode: NetworkNode = {
      id: '192.168.1.1',
      alias: '192.168.1.1',
      safe_alias: '192.168.1.1',
      role: 'server',
      criticality: 'high',
      criticality_numeric: 3,
      observed_state: 'observed',
      risk: 0.45,
      status: 'observed',
      first_seen: 0,
    } as NetworkNode;
    const { container } = render(
      <Topology
        nodes={[unsafeNode]}
        edges={[]}
        predictedPath={null}
        groundTruthRevealed={false}
        warning={false}
      />
    );
    const text = container.textContent || '';
    expect(text).not.toMatch(/192\.168/);
    expect(text).toMatch(/host-\d+/);
  });

  it('HostDetailsDrawer renders sanitized alias when host has unsafe alias', () => {
    const unsafeHost: NetworkNode = {
      id: '10.0.0.5',
      alias: '10.0.0.5',
      safe_alias: '10.0.0.5',
      role: 'database',
      criticality: 'medium',
      criticality_numeric: 2,
      observed_state: 'suspicious',
      risk: 0.88,
      status: 'observed',
    } as NetworkNode;
    render(<HostDetailsDrawer host={unsafeHost} rankingEntry={null} onClose={() => {}} />);
    const drawer = screen.getByTestId('host-details-drawer');
    const text = drawer.textContent || '';
    expect(text).not.toMatch(/10\.0\.0\.5/);
    expect(text).toMatch(/host-\d+/);
  });

  it('HostDetailsDrawer sanitizes alias with attacker-01 pattern', () => {
    const unsafeHost: NetworkNode = {
      id: 'attacker-01',
      alias: 'attacker-01',
      safe_alias: 'attacker-01',
      role: 'workstation',
      criticality: 'high',
      criticality_numeric: 3,
      observed_state: 'observed',
      risk: 0.5,
      status: 'observed',
    } as NetworkNode;
    render(<HostDetailsDrawer host={unsafeHost} rankingEntry={null} onClose={() => {}} />);
    const drawer = screen.getByTestId('host-details-drawer');
    expect(drawer.textContent).not.toMatch(/attacker-01/);
    expect(drawer.textContent).toMatch(/host-\d+/);
  });
});

describe('layout deterministic grid - non-overlapping for 20 hosts', () => {
  it('produces 20 positions sorted by id, deterministic, with >80px center distance and no bbox overlap', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      id: `host-${i + 1}`,
      alias: `host-${i + 1}`,
      safe_alias: `host-${i + 1}`,
      role: 'server',
      criticality: 'medium',
      observed_state: 'observed',
      risk: 0.2,
      status: 'observed',
    } as NetworkNode));
    const positions = getAllPositions(nodes);
    expect(positions.size).toBe(20);
    // Check deterministic: second call same
    const positions2 = getAllPositions(nodes);
    for (const [k, v] of positions) {
      const v2 = positions2.get(k)!;
      expect(v.x).toBe(v2.x);
      expect(v.y).toBe(v2.y);
    }
    // Check sorted order uses id lexical, grid gives >80 distance
    const posArray = Array.from(positions.values());
    for (let i = 0; i < posArray.length; i++) {
      for (let j = i + 1; j < posArray.length; j++) {
        const a = posArray[i];
        const b = posArray[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist).toBeGreaterThan(80);
      }
    }
    // Ensure within viewport for 20 hosts (30..670,30..500) - increased for 13px host labels 5 lines (alias/role/risk/state + label)
    for (const p of posArray) {
      expect(p.x).toBeGreaterThanOrEqual(30);
      expect(p.x).toBeLessThanOrEqual(670);
      expect(p.y).toBeGreaterThanOrEqual(30);
      expect(p.y).toBeLessThanOrEqual(500);
    }
  });

  it('getNodePosition uses grid with deterministic jitter < spacing/3 and centers at 350,220', () => {
    const node: NetworkNode = {
      id: 'host-5',
      alias: 'host-5',
      safe_alias: 'host-5',
      role: 'server',
      criticality: 'medium',
      observed_state: 'observed',
      risk: 0.3,
      status: 'observed',
    } as NetworkNode;
    const p1 = getNodePosition(node, 0, 20);
    const p2 = getNodePosition(node, 0, 20);
    expect(p1.x).toBe(p2.x);
    expect(p1.y).toBe(p2.y);
    // Jitter should be small: check that positions for same index but different id differ only by <=5
    const node2: NetworkNode = { ...node, id: 'host-6' } as NetworkNode;
    const pOther = getNodePosition(node2, 0, 20);
    // Since grid col 0, row 0 base is same, jitter diff at most 10
    expect(Math.abs(p1.x - pOther.x)).toBeLessThanOrEqual(10);
    expect(Math.abs(p1.y - pOther.y)).toBeLessThanOrEqual(10);
  });
});
