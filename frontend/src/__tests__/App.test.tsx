import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../App';

const mockHealthOk = {
  status: 'ok',
  engine: 'trained',
  model_family: 'random_forest',
  data_mode: 'synthetic',
  version: 'phase06-v1',
  threshold: 0.45,
  claim_limitations: 'Test limitations',
};

const mockScenarioDetail = {
  scenario_id: 'cyberworld-replay-v1',
  id: 'cyberworld-replay-v1',
  name: 'CyberWorld Replay - Chronological CICIDS2017 Composite',
  frame_count: 1,
  frames: [
    {
      frame: 0,
      frame_id: 0,
      timestamp: '2017-07-03T10:19:42',
      timestamp_iso: '2017-07-03T10:19:42',
      flow_summary: {
        total_flows: 182,
        flow_count: 182,
        distinct_dest_ips: 175,
        distinct_ports: 87,
        avg_bytes_per_sec: 1200,
        avg_packets_per_sec: 10,
        predicted_malicious_count: 1,
        predicted_malicious_ratio: 0.005,
        predicted_source: 'model-predicted (threshold 0.45)',
        threshold: 0.45,
      },
      nodes: [
        {
          id: 'host-1',
          alias: 'host-1',
          safe_alias: 'host-1',
          role: 'workstation',
          criticality: 'low',
          criticality_numeric: 1,
          observed_state: 'observed',
          risk: 0.12,
          status: 'observed',
        },
      ],
      edges: [
        {
          source: 'host-1',
          target: 'host-2',
          protocol: 'TCP',
          activity: 10,
          novelty: 0.5,
          status: 'observed',
        },
      ],
      signals: {
        raw_risk: 0.12,
        smoothed_risk: 0.12,
        slope: 0.01,
        warning: false,
        threshold: 0.45,
        alpha: 0.4,
      },
      forecast: {
        raw_risk: 0.12,
        smoothed_risk: 0.12,
        slope: 0.01,
        warning: false,
        threshold: 0.45,
        stage: 'Normal',
        target_ranking: [],
        evidence: ['High destination port diversity (87 ports)'],
        mitre: [
          {
            technique_id: 'T1046',
            name: 'Network Service Discovery',
            evidence_rule: 'Observed scanning',
            confidence: 'possible - observed scanning only',
          },
        ],
        engine_metadata: {
          model_family: 'random_forest',
          data_mode: 'synthetic',
          claim_limitations: 'Test limitations',
          version: 'test',
        },
      },
      ground_truth: {
        revealed: false,
        event: 'Normal',
        attack_type: null,
        label_distribution: null,
        true_malicious_count: null,
        true_malicious_ratio: null,
      },
      groundTruth: {
        revealed: false,
        event: 'Normal',
        attack_type: null,
        label_distribution: null,
      },
      stage: 'Normal',
      target_ranking: [],
      evidence: ['High destination port diversity (87 ports)'],
      mitre: [],
      predicted_path: null,
    },
  ],
  metadata: {
    data_mode: 'synthetic',
    disclosure: 'Composite/synthetic stitching disclosed - test',
    claim_limitations: 'Test limitations',
    mitre_version: '13.1',
  },
  engine_metadata: {
    model_family: 'random_forest',
    data_mode: 'synthetic',
    claim_limitations: 'Test limitations',
    version: 'test',
  },
};

const mockMetrics = {
  model_family: 'random_forest',
  version: 'phase04-v1',
  seed: 42,
  feature_count: 80,
  samples: { train: 2306, validation: 1053, test: 953, monday: 1153 },
  splits: {},
  precision: { benign: 0.73, malicious: 0.98, macro: 0.85 },
  recall: { benign: 0.98, malicious: 0.74, macro: 0.86 },
  f1: { benign: 0.84, malicious: 0.84, macro: 0.84 },
  fpr: 0.012,
  roc_auc: 0.78,
  pr_auc: 0.89,
  accuracy: 0.84,
  confusion_matrix: [
    [386, 5],
    [143, 419],
  ],
  latency: { p95_ms: 13.9, p50_ms: 1.5, mean_ms: 5, samples: 100, unit: 'ms' },
  claim_limitations: 'Test limitations',
  target_gates: {},
};

const mockBundle = {
  scenario: mockScenarioDetail,
  metrics: mockMetrics,
  metadata: { data_mode: 'synthetic', disclosure: 'Test disclosure' },
  engine_metadata: { claim_limitations: 'Test limitations' },
  disclosure: 'Test disclosure',
  claim_limitations: 'Test limitations',
  generated_at: new Date().toISOString(),
};

function createFetchMock(overrides?: { healthFail?: boolean; offlineFail?: boolean; healthEngine?: string; healthStatus?: string }) {
  return vi.fn(async (url: string | Request, _init?: unknown) => {
    const urlStr = typeof url === 'string' ? url : (url as Request).url;
    if (urlStr.includes('/api/v1/health')) {
      if (overrides?.healthFail) throw new Error('Network error');
      const healthResponse = {
        ...mockHealthOk,
        ...(overrides?.healthEngine ? { engine: overrides.healthEngine } : {}),
        ...(overrides?.healthStatus ? { status: overrides.healthStatus } : {}),
      };
      return {
        ok: true,
        status: 200,
        json: async () => healthResponse,
      } as Response;
    }
    if (urlStr.includes('/api/v1/scenarios/cyberworld-replay-v1') || urlStr.includes('/api/v1/scenarios')) {
      if (urlStr.includes('/scenarios/') && !urlStr.endsWith('/scenarios')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockScenarioDetail,
        } as Response;
      }
      if (urlStr.endsWith('/scenarios')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ scenario_id: 'cyberworld-replay-v1', name: 'Test', frame_count: 1 }],
        } as Response;
      }
    }
    if (urlStr.includes('/api/v1/metrics')) {
      return {
        ok: true,
        status: 200,
        json: async () => mockMetrics,
      } as Response;
    }
    if (urlStr.includes('/api/v1/forecast')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          scenario_id: 'cyberworld-replay-v1',
          frame_id: 0,
          forecast: mockScenarioDetail.frames[0].forecast,
          ground_truth: mockScenarioDetail.frames[0].ground_truth,
          signals: mockScenarioDetail.frames[0].signals,
          flow_summary: mockScenarioDetail.frames[0].flow_summary,
          nodes: mockScenarioDetail.frames[0].nodes,
          edges: mockScenarioDetail.frames[0].edges,
        }),
      } as Response;
    }
    if (urlStr.includes('offline_bundle.json')) {
      if (overrides?.offlineFail) throw new Error('Network error');
      return {
        ok: true,
        status: 200,
        json: async () => mockBundle,
      } as Response;
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not found' }),
    } as Response;
  });
}

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows loading state initially', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    render(<App />);

    expect(screen.getByText('Starting CyberWorld AI...')).toBeInTheDocument();
  });

  it('shows dashboard when backend and scenario load - trained + healthy -> API mode', async () => {
    vi.stubGlobal('fetch', createFetchMock({ healthEngine: 'trained', healthStatus: 'ok' }));

    render(<App />);

    await waitFor(
      () => {
        expect(screen.getByTestId('command-bar')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Command bar brand present - Stitch design system CYBERWORLD AI
    expect(screen.getByTestId('brand-title')).toHaveTextContent('CYBERWORLD AI');
    // Legacy compatibility: still has old phrase in sr-only for backwards tests
    expect(screen.getByTestId('legacy-brand')).toHaveTextContent('CyberWorld AI - SOC Dashboard');
    // Mode banner shows API Mode when healthy and trained
    expect(screen.getByTestId('mode-banner')).toHaveTextContent('API Mode');
    expect(screen.getByTestId('mode-banner')).toHaveTextContent('Backend healthy - using live API');
    expect(screen.getByTestId('mode-banner')).not.toHaveTextContent('model not trained');
    // Replay controls present via new replay timeline inside command bar
    expect(screen.getByLabelText(/Play replay/)).toBeInTheDocument();
    expect(screen.getByTestId('play-pause-btn')).toBeInTheDocument();
    expect(screen.getByTestId('replay-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('dataset-badge')).toHaveTextContent(/synthetic/i);
    expect(screen.getByTestId('stage-panel')).toHaveTextContent('Normal');
  });

  it('shows offline fallback when backend health fails but bundle succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      createFetchMock({ healthFail: true })
    );

    render(<App />);

    await waitFor(
      () => {
        expect(screen.getByTestId('command-bar')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByTestId('mode-banner')).toHaveTextContent('Offline Mode');
    expect(screen.getByTestId('mode-banner')).toHaveTextContent('Offline fallback');
    expect(screen.getByText(/Offline fallback/)).toBeInTheDocument();
    expect(screen.getByTestId('mode-banner')).not.toHaveTextContent('Backend reachable');
  });

  it('shows offline mode with truthful banner when backend is reachable but model not trained', async () => {
    vi.stubGlobal(
      'fetch',
      createFetchMock({ healthEngine: 'not-trained', healthStatus: 'ok' })
    );

    render(<App />);

    await waitFor(
      () => {
        expect(screen.getByTestId('command-bar')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByTestId('mode-banner')).toHaveTextContent('Offline Mode');
    expect(screen.getByTestId('mode-banner')).toHaveTextContent('Backend reachable, model not trained - using offline replay.');
    expect(screen.getByTestId('mode-banner')).not.toHaveTextContent('Backend healthy - using live API');
    expect(screen.getByTestId('mode-banner')).not.toHaveTextContent('live prediction engine');
    expect(screen.getByTestId('dataset-badge')).toBeInTheDocument();
    expect(screen.getByTestId('stage-panel')).toBeInTheDocument();
  });

  it('shows error state when both API and offline fail', async () => {
    vi.stubGlobal(
      'fetch',
      createFetchMock({ healthFail: true, offlineFail: true })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Scenario')).toBeInTheDocument();
    });

    expect(screen.getByText(/Backend failure does not prevent offline replay/)).toBeInTheDocument();
  });
});

describe('shell - application shell and dashboard hierarchy', () => {
  beforeEach(() => vi.resetAllMocks());

  it('command bar is full-screen top bar h-12 with brand, replay cluster, and health pills', async () => {
    vi.stubGlobal('fetch', createFetchMock({ healthEngine: 'trained', healthStatus: 'ok' }));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('command-bar')).toBeInTheDocument(), { timeout: 3000 });
    const bar = screen.getByTestId('command-bar');
    expect(bar).toHaveClass('h-12');
    expect(bar).toHaveClass('border-b');
    expect(screen.getByTestId('brand-title')).toHaveTextContent('CYBERWORLD AI');
    expect(screen.getByText('SOC-v3.1')).toBeInTheDocument();
    expect(screen.getByText('DIGITAL TWIN')).toBeInTheDocument();
    expect(screen.getByTestId('connection-badge')).toBeInTheDocument();
    expect(screen.getByTestId('dataset-badge')).toBeInTheDocument();
    expect(screen.getByTestId('model-pill')).toBeInTheDocument();
    expect(screen.getByTestId('help-btn')).toBeInTheDocument();
  });

  it('workspace uses 12-column grid max-w 1600 overflow-auto', async () => {
    vi.stubGlobal('fetch', createFetchMock({ healthEngine: 'trained', healthStatus: 'ok' }));
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByTestId('command-bar')).toBeInTheDocument(), { timeout: 3000 });
    // App shell should have grid-cols-12, max-w-[1600px], overflow-auto
    const main = container.querySelector('main');
    expect(main).not.toBeNull();
    expect(main?.className).toContain('grid-cols-12');
    expect(main?.className).toContain('max-w-[1600px]');
    expect(main?.className).toContain('overflow-auto');
    expect(main?.className).toContain('gap-4');
  });

  it('app shell is full-screen and preserves API/offline mode selection', async () => {
    vi.stubGlobal('fetch', createFetchMock({ healthEngine: 'trained', healthStatus: 'ok' }));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-shell')).toBeInTheDocument(), { timeout: 3000 });
    const shell = screen.getByTestId('app-shell');
    expect(shell).toHaveClass('h-screen');
    expect(shell).toHaveClass('w-screen');
    expect(shell).toHaveClass('overflow-hidden');
    expect(shell).toHaveClass('flex');
  });
});

describe('replay timeline - Stitch design system', () => {
  beforeEach(() => vi.resetAllMocks());

  it('replay timeline shows play/restart, speed 0.5x/1x/2x, frame counter, timestamp, scrubber responsive h-2 with markers', async () => {
    vi.stubGlobal('fetch', createFetchMock({ healthEngine: 'trained', healthStatus: 'ok' }));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('replay-timeline')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByTestId('play-pause-btn')).toBeInTheDocument();
    expect(screen.getByTestId('restart-btn')).toBeInTheDocument();
    expect(screen.getByTestId('speed-0.5x')).toBeInTheDocument();
    expect(screen.getByTestId('speed-1x')).toBeInTheDocument();
    expect(screen.getByTestId('speed-2x')).toBeInTheDocument();
    expect(screen.getByTestId('frame-display')).toHaveTextContent(/Frame 0\/0/);
    expect(screen.getByTestId('timestamp-display')).toBeInTheDocument();
    expect(screen.getByTestId('frame-slider')).toBeInTheDocument();
    // scrubber bar and markers - responsive: outer grid has w-24/xl:w-36, inner has h-2
    expect(screen.getByTestId('scrubber-bar')).toBeInTheDocument();
    expect(screen.getByTestId('scrubber-container')).toBeInTheDocument();
    const container = screen.getByTestId('scrubber-container');
    expect(container.className).toMatch(/w-24|w-28|w-32|w-36/);
    expect(container.className).toMatch(/grid/);
    const inner = screen.getByTestId('scrubber-bar').parentElement;
    expect(inner?.className).toContain('h-2');
  });

  it('replay timeline is keyboard accessible and preserves existing behaviour', async () => {
    vi.stubGlobal('fetch', createFetchMock({ healthEngine: 'trained', healthStatus: 'ok' }));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('replay-timeline')).toBeInTheDocument(), { timeout: 3000 });
    const playBtn = screen.getByTestId('play-pause-btn');
    expect(playBtn).toHaveAttribute('aria-label', expect.stringMatching(/Play replay/));
    const restartBtn = screen.getByTestId('restart-btn');
    expect(restartBtn).toHaveAttribute('aria-label', 'Restart replay from beginning');
    const slider = screen.getByTestId('frame-slider');
    expect(slider).toHaveAttribute('aria-label', 'Replay frame slider');
    // speed buttons aria-pressed
    expect(screen.getByTestId('speed-1x')).toHaveAttribute('aria-pressed', 'true');
    // focus rings preserved via class
    expect(playBtn.className).toContain('focus:ring-2');
    expect(playBtn.className).toContain('focus:ring-cyan-400');
  });

  it('does not hardcode metrics - values come from API', async () => {
    vi.stubGlobal('fetch', createFetchMock({ healthEngine: 'trained', healthStatus: 'ok' }));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('command-bar')).toBeInTheDocument(), { timeout: 3000 });
    // Ensure no hardcoded Stitch invented metrics like 0.850 F1 appear as fallback
    // The displayed risk should be from mock (0.12) not 0.569
    expect(screen.getByTestId('risk-card')).toHaveTextContent('0.120');
    // Stage should be Normal from mock, not hardcoded Credential Attack
    expect(screen.getByTestId('stage-panel')).toHaveTextContent('Normal');
  });
});

describe('warning banner - prominent orange/coral dismissible ARIA', () => {
  beforeEach(() => vi.resetAllMocks());

  it('warning banner is hidden when signals.warning false (frame 0)', async () => {
    vi.stubGlobal('fetch', createFetchMock({ healthEngine: 'trained', healthStatus: 'ok' }));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('command-bar')).toBeInTheDocument(), { timeout: 3000 });
    // mock has warning false, so banner should not be in document
    expect(screen.queryByTestId('warning-banner')).not.toBeInTheDocument();
  });

  it('warning banner appears when warning true with stage and target host, dismissible, ARIA', async () => {
    // Create a mock scenario where warning is true at frame 0
    const warningScenario = JSON.parse(JSON.stringify(mockScenarioDetail));
    warningScenario.frames[0].signals.warning = true;
    warningScenario.frames[0].signals.smoothed_risk = 0.55;
    warningScenario.frames[0].signals.slope = 0.03;
    warningScenario.frames[0].forecast.warning = true;
    warningScenario.frames[0].forecast.stage = 'Credential Attack';
    warningScenario.frames[0].forecast.target_ranking = [
      { host: 'host-238', alias: 'host-238', target_score: 14.57, incoming_activity: 8, edge_novelty: 0.8, recent_risk_trend: 0.9, asset_criticality: 'high', criticality_numeric: 3, role: 'server', rank: 1 },
    ];
    const warningBundle = { ...mockBundle, scenario: warningScenario };
    const mock = vi.fn(async (url: string | Request) => {
      const urlStr = typeof url === 'string' ? url : (url as Request).url;
      if (urlStr.includes('/api/v1/health')) {
        return { ok: true, status: 200, json: async () => mockHealthOk } as Response;
      }
      if (urlStr.includes('/api/v1/scenarios/cyberworld-replay-v1') || urlStr.includes('/api/v1/scenarios')) {
        if (urlStr.includes('/scenarios/') && !urlStr.endsWith('/scenarios')) {
          return { ok: true, status: 200, json: async () => warningScenario } as Response;
        }
        if (urlStr.endsWith('/scenarios')) return { ok: true, status: 200, json: async () => [{ scenario_id: 'cyberworld-replay-v1', name: 'Test', frame_count: 1 }] } as Response;
      }
      if (urlStr.includes('/api/v1/metrics')) return { ok: true, status: 200, json: async () => mockMetrics } as Response;
      if (urlStr.includes('offline_bundle.json')) return { ok: true, status: 200, json: async () => warningBundle } as Response;
      return { ok: false, status: 404, json: async () => ({ detail: 'Not found' }) } as Response;
    });
    vi.stubGlobal('fetch', mock);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('warning-banner')).toBeInTheDocument(), { timeout: 3000 });
    const banner = screen.getByTestId('warning-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner.className).toContain('from-amber-500/25');
    expect(banner).toHaveTextContent('EARLY WARNING ACTIVE');
    expect(banner).toHaveTextContent('Warning: Credential Attack');
    expect(banner).toHaveTextContent('host-238');
    // icon + text not just color
    expect(banner).toHaveTextContent('ELEVATED');
    // dismissible
    const dismiss = screen.getByTestId('warning-banner-dismiss');
    expect(dismiss).toBeInTheDocument();
    expect(dismiss).toHaveAttribute('aria-label', 'Dismiss warning banner');
    fireEvent.click(dismiss);
    expect(screen.queryByTestId('warning-banner')).not.toBeInTheDocument();
  });
});
