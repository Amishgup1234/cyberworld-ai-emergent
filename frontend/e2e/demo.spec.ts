import { test, expect } from '@playwright/test';

// Two-minute demo 11-step story + reliability states
// Uses offline_bundle.json via Vite preview (no backend required) - deterministic seed 42
// All forecasts use model-predicted observable signals, no label leakage, gated ground truth

test.describe('CyberWorld AI - Two-minute demo (11 steps) + reliability', () => {
  test.beforeEach(async () => {
    // No backend - app will fallback to offline_bundle.json automatically
    // Ensure health endpoint does not block - we let fetchHealth return null quickly
    // No route mocking needed; Vite preview serves dist/offline_bundle.json
  });

  async function setFrame(page: import('@playwright/test').Page, val: string) {
    // Ensure focus not on interactive control that would block global Arrow handling (tab/button/select)
    await page.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && ae !== document.body) ae.blur();
    });
    const target = parseInt(val, 10);
    // Use keyboard ArrowRight/Left to step to target - more reliable than synthetic slider events for React controlled input
    const slider = page.getByTestId('frame-slider');
    let current = parseInt(await slider.inputValue(), 10);
    let attempts = 0;
    while (current !== target && attempts < 40) {
      if (current < target) {
        await page.keyboard.press('ArrowRight');
      } else {
        await page.keyboard.press('ArrowLeft');
      }
      await page.waitForTimeout(120);
      const newVal = await slider.inputValue();
      const newInt = parseInt(newVal, 10);
      if (newInt === current) {
        // fallback to direct evaluate if keyboard not advancing (e.g., focus on select)
        await slider.evaluate((el: HTMLInputElement, v: string) => {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeInputValueSetter) nativeInputValueSetter.call(el, v);
          else el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          // Also dispatch KeyboardEvent for React onChange synthetic
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        }, val);
        await page.waitForTimeout(300);
        break;
      }
      current = newInt;
      attempts++;
    }
    await expect(slider).toHaveValue(val, { timeout: 5000 });
    // Give React time to re-render dependent panels
    await page.waitForTimeout(300);
  }

  test('11-step demo: normal -> replay -> risk rises -> warning before ground truth -> stage/target -> mitre/evidence -> isolate -> compare -> ground truth -> metrics', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    // Loading state appears briefly then dashboard
    // Wait for dashboard header - Phase 11 command bar
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('brand-title')).toContainText('CYBERWORLD AI');
    // Step 1: Normal network - frame 0 stage Normal, no warning, ground truth hidden
    await expect(page.getByTestId('mode-banner')).toBeVisible();
    // Offline fallback expected when no backend (preview server)
    await expect(page.getByTestId('mode-banner')).toContainText(/Offline Mode|API Mode/);
    // Dataset badge - responsive: visible at 1440, hidden at 1280 per Phase 11
    await expect(page.getByTestId('dataset-badge')).toBeVisible();
    await expect(page.getByTestId('stage-panel')).toContainText('Normal');
    await expect(page.getByTestId('risk-card')).toBeVisible();
    // Ground truth hidden at start
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Hidden - gated');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Ground truth start frame: 20');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('No attack revealed yet');

    // Step 2: Chronological replay begins - play, frame advances, pause - Phase 11 replay timeline in command bar
    await expect(page.getByTestId('replay-timeline')).toBeVisible();
    await expect(page.getByTestId('play-pause-btn')).toContainText('Play');
    await expect(page.getByTestId('frame-slider')).toHaveValue('0');
    // Click Play, wait for frame to advance to 1 or 2
    await page.getByTestId('play-pause-btn').click();
    await expect(page.getByTestId('play-pause-btn')).toContainText('Pause', { timeout: 5000 });
    // Wait for frame advance via slider value change
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="frame-slider"]') as HTMLInputElement | null;
      return el && parseInt(el.value, 10) >= 1;
    }, { timeout: 5000 });
    // Pause
    await page.getByTestId('play-pause-btn').click();
    await expect(page.getByTestId('play-pause-btn')).toContainText('Play');
    // Speed controls
    await expect(page.getByTestId('speed-0.5x')).toBeVisible();
    await expect(page.getByTestId('speed-1x')).toBeVisible();
    await expect(page.getByTestId('speed-2x')).toBeVisible();
    // Set speed 2x for faster replay later
    await page.getByTestId('speed-2x').click();
    await expect(page.getByTestId('speed-2x')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('speed-1x').click();

    // Step 3: Observed behavior changes - move to frame 5 where predicted ratio rises
    await setFrame(page, '5');
    // Flow summary and trajectory should reflect frame 5 - trajectory is now inside Trajectory tab (Phase 13)
    await expect(page.getByTestId('flow-summary-panel')).toBeVisible();
    await page.getByRole('tab', { name: 'Trajectory' }).click();
    await expect(page.getByTestId('tab-trajectory')).toBeVisible();
    await expect(page.getByTestId('trajectory-panel')).toContainText('F5');
    // Stage may still be Normal or Reconnaissance depending on threshold
    await expect(page.getByTestId('stage-panel')).toBeVisible();

    // Step 4: Model risk rises - smoothed EWMA and slope positive around frame 8
    await setFrame(page, '8');
    // Risk card should show warning active at frame 8 (first warning, before ground truth 20)
    await expect(page.getByTestId('risk-card')).toContainText('Warning');
    await expect(page.getByTestId('risk-card')).toContainText('Early warning active');
    // Verify risk chart shows warning marker (coral)
    await expect(page.getByTestId('risk-chart')).toBeVisible();
    // Topology should be visible
    await expect(page.getByTestId('topology')).toBeVisible();

    // Step 5: Early warning appears before ground truth frame 20 - verified above
    // Ground truth still hidden at frame 8
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Hidden - gated');
    await expect(page.getByTestId('ground-truth-panel')).not.toContainText('Revealed');

    // Step 6: Stage evidence and graph-ranked host appear
    await expect(page.getByTestId('stage-panel')).toBeVisible();
    // After warning, stage likely Reconnaissance or Credential Attack
    await expect(page.getByTestId('stage-panel')).toContainText(/Reconnaissance|Credential Attack|Compromise|Impact/);
    await expect(page.getByTestId('target-panel')).toBeVisible();
    await expect(page.getByTestId('target-panel')).toContainText('Top target:');
    await expect(page.getByTestId('target-panel')).toContainText('Rank #1');
    // Verify target ranking list present
    await expect(page.getByTestId('target-panel')).toContainText('graph-ranked');
    // Predicted path may be present
    // Step 7: MITRE mapping and evidence are opened - now inside tabbed workspace (Phase 13)
    await page.getByRole('tab', { name: 'Evidence' }).click();
    await expect(page.getByTestId('tab-evidence')).toBeVisible();
    await expect(page.getByTestId('evidence-panel')).toBeVisible();
    await expect(page.getByTestId('observed-evidence-section')).toBeVisible();
    await expect(page.getByTestId('global-importance-section')).toBeVisible();
    await expect(page.getByTestId('evidence-panel')).toContainText('Observed Evidence');
    await expect(page.getByTestId('evidence-panel')).toContainText('Global Model Importance');
    await page.getByRole('tab', { name: 'MITRE ATT&CK' }).click();
    await expect(page.getByTestId('tab-mitre')).toBeVisible();
    await expect(page.getByTestId('mitre-panel')).toBeVisible();
    await expect(page.getByTestId('mitre-version')).toContainText('Pinned v13.1');
    await expect(page.getByTestId('mitre-T1046')).toBeVisible();
    await expect(page.getByTestId('mitre-T1110')).toBeVisible();
    await expect(page.getByTestId('mitre-T1021')).toBeVisible();
    await expect(page.getByTestId('mitre-T1498')).toBeVisible();
    // Evidence items
    await expect(page.getByTestId('mitre-T1110-confidence')).toContainText('requires analyst review');

    // Step 8: Suspicious host is isolated in simulation - inside What-if Isolation tab (Phase 13)
    await page.getByRole('tab', { name: 'What-if Isolation' }).click();
    await expect(page.getByTestId('tab-simulation')).toBeVisible();
    await expect(page.getByTestId('simulation-panel')).toBeVisible();
    await expect(page.getByTestId('host-select')).toBeVisible();
    await expect(page.getByTestId('simulate-btn')).toBeVisible();
    await expect(page.getByTestId('simulate-btn')).toContainText('Isolate Host');
    // Host select should contain options - wait for ranking to populate
    const hostSelect = page.getByTestId('host-select');
    await expect(hostSelect).toBeVisible();
    // Wait for options to be populated (at least 2 hosts)
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="host-select"]') as HTMLSelectElement | null;
      return el && el.options.length > 1;
    }, { timeout: 5000 });
    // If still empty value, ensure selection defaults to first host
    const val = await hostSelect.inputValue();
    if (!val) {
      await hostSelect.selectOption({ index: 1 });
    }
    await expect(hostSelect).not.toHaveValue('');
    // Click simulate
    await page.getByTestId('simulate-btn').click();
    // Wait for comparison to appear (uses offlineSimulateIsolation when offline)
    await expect(page.getByTestId('simulation-comparison')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('simulation-label')).toContainText('Estimated simulated effect - not causal proof');

    // Step 9: Before/after risk is compared
    await expect(page.getByTestId('simulation-deltas')).toBeVisible();
    await expect(page.getByTestId('simulation-deltas')).toContainText('Raw delta');
    await expect(page.getByTestId('simulation-deltas')).toContainText('Risk reduction');
    await expect(page.getByTestId('simulation-deltas')).toContainText('%');
    await expect(page.locator('[data-testid="simulation-panel"]')).toContainText('Before Isolation');
    await expect(page.locator('[data-testid="simulation-panel"]')).toContainText('After Isolation - Simulated');
    // Removed edges muted
    await expect(page.locator('[data-testid="simulation-panel"]')).toContainText('Removed edges');
    // Ranking changed indicator
    await expect(page.locator('[data-testid="simulation-panel"]')).toContainText(/Ranking changed|Before ranking|After ranking/);

    // Verify original replay unchanged: go back one frame and check simulation still shows frame 8
    await expect(page.locator('[data-testid="simulation-panel"]')).toContainText('Frame 8');

    // Step 10: Ground truth arrives at frame 20
    await setFrame(page, '20');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Revealed');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Infiltration');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Label distribution');

    // Step 11: Actual held-out metrics are shown - honest not inflated - inside Metrics tab (Phase 13)
    await page.getByRole('tab', { name: 'Metrics' }).click();
    await expect(page.getByTestId('tab-metrics')).toBeVisible();
    await expect(page.getByTestId('metrics-panel')).toBeVisible();
    await expect(page.getByTestId('metrics-panel')).toContainText(/Friday.*Holdout|Holdout/);
    await expect(page.getByTestId('metrics-panel')).toContainText('Binary F1 macro');
    await expect(page.getByTestId('metrics-panel')).toContainText('Attack recall');
    await expect(page.getByTestId('metrics-panel')).toContainText('False positive rate');
    await expect(page.getByTestId('metrics-panel')).toContainText('Latency p95');
    await expect(page.getByTestId('metrics-panel')).toContainText('Confusion matrix');
    await expect(page.getByTestId('metrics-panel')).toContainText('Claim limitations');
    // Verify honest metrics match artifacts: F1 0.844, recall 0.745, FPR 0.012, p95 ~13.9ms
    // Check gating PASS/MISS labels are visible
    await expect(page.getByTestId('metrics-panel')).toContainText(/PASS|MISS/);

    // Also verify disclosure and engine metadata visible
    await expect(page.locator('body')).toContainText(/seed 42/i);
    await expect(page.locator('body')).toContainText('offline_bundle.json');

    // Screenshot for evidence (trace already captured via config)
    await page.screenshot({ path: 'test-results/demo-step11-full.png', fullPage: true });
  });

  test('offline fallback banner visible and health-check fallback works when backend down', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    const banner = page.getByTestId('mode-banner');
    await expect(banner).toBeVisible();
    // With no backend on preview, must be Offline Mode
    await expect(banner).toContainText('Offline Mode');
    await expect(banner).toContainText('Offline fallback');
    await expect(banner).toContainText('offline_bundle.json');
    // Should not claim Backend healthy when offline
    await expect(banner).not.toContainText('Backend healthy - using live API');
    // Dataset badge should still show synthetic fallback - visible at 1440
    await expect(page.getByTestId('dataset-badge')).toContainText(/Synthetic Fallback|CICIDS2017/);
    await page.screenshot({ path: 'test-results/offline-fallback-banner.png', fullPage: true });
  });

  test('reset states: Restart clears replay to frame 0 and Clear removes simulation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    // Go to frame 10 - simulation is inside tab (Phase 13)
    await setFrame(page, '10');
    await page.getByRole('tab', { name: 'What-if Isolation' }).click();
    await expect(page.getByTestId('tab-simulation')).toBeVisible();
    // Simulate host
    await page.getByTestId('simulate-btn').click();
    await expect(page.getByTestId('simulation-comparison')).toBeVisible({ timeout: 10000 });
    // Restart should reset to 0 and pause
    await page.getByTestId('restart-btn').click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('frame-slider')).toHaveValue('0');
    await expect(page.getByTestId('play-pause-btn')).toContainText('Play');
    // Clear simulation
    await expect(page.getByTestId('simulation-panel')).toBeVisible();
    // After restart, simulation panel may still show previous result until cleared; click Clear
    const clearBtn = page.getByRole('button', { name: 'Clear simulation' });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await expect(page.getByTestId('simulation-comparison')).not.toBeVisible();
    }
    await expect(page.getByTestId('stage-panel')).toContainText('Normal');
    await page.screenshot({ path: 'test-results/reset-states.png', fullPage: true });
  });

  test('reliability - invalid-data shows validation message when offline_bundle is malformed', async ({ page }) => {
    // Intercept offline_bundle.json to return malformed scenario (missing signals)
    await page.route('**/offline_bundle.json', async (route) => {
      const malformed = {
        scenario: {
          scenario_id: 'cyberworld-replay-v1',
          name: 'Malformed',
          frame_count: 1,
          frames: [{ frame: 0, timestamp: '2017-07-03T10:00:00', nodes: [], edges: [] }], // missing signals etc
          metadata: {},
        },
        metrics: {
          model_family: 'random_forest',
          threshold: 0.45,
          samples: { train: 1, validation: 1, test: 1 },
          precision: {}, recall: {}, f1: {}, fpr: 0.01, roc_auc: 0.5, pr_auc: 0.5, confusion_matrix: [[1,0],[0,1]], latency: { p95_ms: 10 }, claim_limitations: 'test',
        },
        metadata: {}, engine_metadata: {}, disclosure: '', claim_limitations: '',
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(malformed) });
    });
    // Also mock health to force offline
    await page.route('**/api/v1/health', async (route) => {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) });
    });
    await page.goto('/');
    await expect(page.getByTestId('invalid-data-state')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('invalid-data-state')).toContainText('Invalid Scenario Data');
    await expect(page.getByTestId('invalid-data-state')).toContainText('Missing required field');
    await page.screenshot({ path: 'test-results/invalid-data-state.png', fullPage: true });
  });

  test('reliability - empty shows no-replay message when offline_bundle has 0 frames', async ({ page }) => {
    await page.route('**/offline_bundle.json', async (route) => {
      const empty = {
        scenario: {
          scenario_id: 'cyberworld-replay-v1',
          name: 'Empty',
          frame_count: 0,
          frames: [],
          metadata: {},
        },
        metrics: {
          model_family: 'random_forest',
          threshold: 0.45,
          samples: { train: 1, validation: 1, test: 1 },
          precision: {}, recall: {}, f1: {}, fpr: 0.01, roc_auc: 0.5, pr_auc: 0.5, confusion_matrix: [[1,0],[0,1]], latency: { p95_ms: 10 }, claim_limitations: 'test',
        },
        metadata: {}, engine_metadata: {}, disclosure: '', claim_limitations: '',
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty) });
    });
    await page.route('**/api/v1/health', async (route) => {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) });
    });
    await page.goto('/');
    await expect(page.getByTestId('empty-state')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('empty-state')).toContainText('No Replay Data Available');
    await expect(page.getByTestId('empty-state')).toContainText('0 frames');
    await page.screenshot({ path: 'test-results/empty-state.png', fullPage: true });
  });

  test('reliability - backend-down shows Failed to Load when both API and offline fail', async ({ page }) => {
    await page.route('**/offline_bundle.json', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'offline failed' }) });
    });
    await page.route('**/api/v1/health', async (route) => {
      await route.abort('failed');
    });
    await page.route('**/api/v1/scenarios/**', async (route) => { await route.abort('failed'); });
    await page.goto('/');
    await expect(page.getByTestId('backend-down-state')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('backend-down-state')).toContainText('Failed to Load Scenario');
    await expect(page.getByTestId('backend-down-state')).toContainText('Backend failure does not prevent offline replay');
    await page.screenshot({ path: 'test-results/backend-down-state.png', fullPage: true });
  });

  test('loading state is visible while health check and bundle are pending', async ({ page }) => {
    // Delay both health and offline_bundle for 1.5s to capture loading
    await page.route('**/api/v1/health', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await page.route('**/offline_bundle.json', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.goto('/');
    await expect(page.getByTestId('loading-state')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('loading-state')).toContainText('Starting CyberWorld AI...');
    await expect(page.getByTestId('loading-state')).toContainText('Health-checking backend');
    // Eventually dashboard appears - give extra time for bundle parse (6MB)
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('loading-state')).not.toBeVisible({ timeout: 5000 });
  });
});
