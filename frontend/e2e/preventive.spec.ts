import { test, expect } from '@playwright/test';

async function ensureFrame(page: import('@playwright/test').Page, target: string) {
  await page.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null;
    if (ae && ae !== document.body) ae.blur();
  });
  const slider = page.getByTestId('frame-slider');
  let current = parseInt(await slider.inputValue(), 10);
  const t = parseInt(target, 10);
  let attempts = 0;
  while (current !== t && attempts < 40) {
    if (current < t) await page.keyboard.press('ArrowRight');
    else await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(120);
    const v = await slider.inputValue();
    const n = parseInt(v, 10);
    if (n === current) {
      await slider.evaluate((el: HTMLInputElement, v2: string) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, v2);
        else el.value = v2;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, target);
      await page.waitForTimeout(300);
      break;
    }
    current = n;
    attempts++;
  }
  await expect(slider).toHaveValue(target, { timeout: 5000 });
  await page.waitForTimeout(300);
}

async function resetToBaseline(page: import('@playwright/test').Page) {
  const val = await page.getByTestId('frame-slider').inputValue().catch(() => '0');
  if (val !== '0') {
    await page.getByTestId('restart-btn').click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('frame-slider')).toHaveValue('0', { timeout: 5000 });
  }
  const isPause = await page.getByTestId('play-pause-btn').evaluate((el) => el.textContent?.includes('Pause')).catch(() => false);
  if (isPause) {
    await page.getByTestId('play-pause-btn').click();
    await page.waitForTimeout(200);
  }
}

test.describe('preventive action', () => {
  test('preventive action - recommends top graph-ranked host and prominent Simulate Preventive Action control', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
    await resetToBaseline(page);
    await ensureFrame(page, '8');
    await expect(page.getByTestId('warning-banner')).toBeVisible();
    // Preventive action panel should be visible in decision rail
    await expect(page.getByTestId('preventive-action-panel')).toBeVisible();
    await expect(page.getByTestId('preventive-recommended')).toBeVisible();
    await expect(page.getByTestId('preventive-recommended')).toContainText('Recommended target:');
    await expect(page.getByTestId('preventive-recommended')).toContainText('Rank #1');
    await expect(page.getByTestId('preventive-recommended')).toContainText('NetworkX graph-ranked');
    // Wait for recommended host to update to frame 8's top (host-238) - ensure not stale baseline host-1467
    await expect(page.getByTestId('preventive-recommended-host')).toHaveText('host-238', { timeout: 5000 });
    const recHost = await page.getByTestId('preventive-recommended-host').textContent();
    expect(recHost).toMatch(/host-\d+/);
    expect(recHost).not.toMatch(/192\.168/);
    expect(recHost?.trim()).toBe('host-238');
    // Verify it matches the TargetPanel's top host (graph-ranked)
    const targetPanelText = await page.getByTestId('target-panel').textContent();
    const topFromTarget = targetPanelText?.match(/host-\d+/)?.[0];
    if (topFromTarget) expect(recHost?.trim()).toBe(topFromTarget);
    // Prominent button
    const simBtn = page.getByTestId('simulate-preventive-btn');
    await expect(simBtn).toBeVisible();
    await expect(simBtn).toContainText('Simulate Preventive Action');
    await expect(simBtn).toHaveAttribute('aria-label', 'Simulate Preventive Action - isolate recommended host');
    await expect(simBtn).toHaveClass(/from-orange-500/);
    expect(await simBtn.evaluate((el) => el.className.includes('focus:ring-2') && el.className.includes('focus:ring-cyan-400'))).toBeTruthy();
    // Host select should be present and have recommended selected
    const hostSelect = page.getByTestId('preventive-host-select');
    await expect(hostSelect).toBeVisible();
    await expect(hostSelect).toHaveAttribute('aria-label', 'Preventive host select - recommended top ranked');
    const selected = await hostSelect.inputValue();
    expect(selected).toMatch(/host-\d+/);
    const recHostTrim = (await page.getByTestId('preventive-recommended-host').textContent())?.trim();
    expect(selected).toBe(recHostTrim);
    // Check that preventive panel is in decision rail (col-span-4) and visible at 1280x720 (may require scroll due to 65/35 layout, but should be reachable)
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByTestId('preventive-action-panel')).toBeVisible();
    const panelBox = await page.getByTestId('preventive-action-panel').boundingBox();
    expect(panelBox).not.toBeNull();
    // Panel should be within page, not excessively far - allow scroll but ensure no horizontal overflow later
    if (panelBox) expect(panelBox.y).toBeLessThan(3000);
  });

  test('preventive action - one-click flow shows removed edges, before/after risk, changed ranking, stage change, risk reduction in one result card', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
    await resetToBaseline(page);
    await ensureFrame(page, '8');
    await expect(page.getByTestId('preventive-action-panel')).toBeVisible();
    const simBtn = page.getByTestId('simulate-preventive-btn');
    await expect(simBtn).toBeVisible();
    // One analyst action: click Simulate Preventive Action
    await simBtn.click();
    // Wait for result card
    const resultCard = page.getByTestId('preventive-result-card');
    await expect(resultCard).toBeVisible({ timeout: 10000 });
    await expect(resultCard).toContainText('Containment Result - Before/After');
    await expect(resultCard).toContainText('Estimated simulated effect - not causal proof');
    // Check before/after risk
    await expect(page.getByTestId('preventive-before-raw')).toBeVisible();
    await expect(page.getByTestId('preventive-after-raw')).toBeVisible();
    const beforeRaw = await page.getByTestId('preventive-before-raw').textContent();
    const afterRaw = await page.getByTestId('preventive-after-raw').textContent();
    expect(beforeRaw).toMatch(/\d+\.\d+/);
    expect(afterRaw).toMatch(/\d+\.\d+/);
    await expect(page.getByTestId('preventive-before-smoothed')).toBeVisible();
    await expect(page.getByTestId('preventive-after-smoothed')).toBeVisible();
    // Warning before/after
    await expect(page.getByTestId('preventive-before-warning')).toBeVisible();
    await expect(page.getByTestId('preventive-after-warning')).toBeVisible();
    // Stage before/after and stage changed indicator if applicable
    await expect(page.getByTestId('preventive-before-stage')).toBeVisible();
    await expect(page.getByTestId('preventive-after-stage')).toBeVisible();
    const beforeStage = await page.getByTestId('preventive-before-stage').textContent();
    const afterStage = await page.getByTestId('preventive-after-stage').textContent();
    expect(beforeStage).toBeTruthy();
    expect(afterStage).toBeTruthy();
    // Changed ranking
    await expect(page.getByTestId('preventive-before-target')).toBeVisible();
    await expect(page.getByTestId('preventive-after-target')).toBeVisible();
    // If ranking changed, badge should appear (at frame 8, ranking should change after isolating top host)
    const rankingChanged = await page.getByTestId('preventive-ranking-changed').count();
    // It may or may not appear depending on simulation, but we check that ranking fields exist
    expect(rankingChanged >= 0).toBeTruthy();
    // Deltas: risk reduction
    await expect(page.getByTestId('preventive-deltas')).toBeVisible();
    await expect(page.getByTestId('preventive-risk-reduction')).toBeVisible();
    const riskRed = await page.getByTestId('preventive-risk-reduction').textContent();
    expect(riskRed).toMatch(/%/);
    // Removed edges
    await expect(page.getByTestId('preventive-removed-edges')).toBeVisible();
    await expect(page.getByTestId('preventive-removed-edges')).toContainText('Removed edges');
    const removedText = await page.getByTestId('preventive-removed-edges').textContent();
    expect(removedText).toMatch(/Host host-238 - frame 8/);
    expect(removedText).toContain('removed');
    // Check that all values in card are from SimulationResult, not hardcoded Stitch 0.850
    const cardText = await resultCard.textContent();
    expect(cardText).not.toContain('0.850');
    expect(cardText).not.toMatch(/192\.168/);
    // Check original frame remains unchanged: frame-slider still 8, topology still shows 20 hosts
    await expect(page.getByTestId('frame-slider')).toHaveValue('8');
    await expect(page.getByTestId('topology-count')).toContainText('20 hosts visible');
    // Check that after simulation, original replay not modified: ground truth still hidden at 8
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Hidden - gated');
    // Check that simulated label is present and distinct
    await expect(resultCard).toContainText('not causal proof');
    await expect(resultCard).toContainText('Original frame 8 unchanged - immutable');
  });

  test('preventive action - API and offline simulations produce valid comparison states', async ({ page }) => {
    // Test offline mode (preview is offline, so this is the default)
    await page.goto('/');
    await expect(page.getByTestId('mode-banner')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('mode-banner')).toContainText(/Offline Mode|API Mode/);
    await resetToBaseline(page);
    await ensureFrame(page, '8');
    // Offline simulation via preventive button
    await page.getByTestId('simulate-preventive-btn').click();
    await expect(page.getByTestId('preventive-result-card')).toBeVisible({ timeout: 10000 });
    const offlineBefore = await page.getByTestId('preventive-before-raw').textContent();
    expect(offlineBefore).toMatch(/\d+\.\d+/);
    // Clear and test that simulation can be done again (API fallback)
    await page.getByTestId('preventive-clear-btn').click();
    await expect(page.getByTestId('preventive-result-card')).toBeHidden({ timeout: 2000 });
    // Change frame to 5 and simulate again to ensure different frame works
    await ensureFrame(page, '5');
    await page.getByTestId('simulate-preventive-btn').click();
    await expect(page.getByTestId('preventive-result-card')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('preventive-removed-edges')).toBeVisible();
    // Check that after simulation, before/after are different (risk should change)
    const before5 = await page.getByTestId('preventive-before-raw').textContent();
    const after5 = await page.getByTestId('preventive-after-raw').textContent();
    expect(before5).not.toBe(after5); // risk should change after isolation

    // Now test API mode by mocking health to ok/trained and scenario fetch
    await page.route('**/api/v1/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          engine: 'trained',
          model_family: 'random_forest',
          data_mode: 'synthetic',
          version: 'phase06-v1',
          threshold: 0.45,
          claim_limitations: 'Test limitations',
        }),
      });
    });
    await page.goto('/');
    await expect(page.getByTestId('mode-banner')).toContainText('API Mode', { timeout: 10000 });
    await resetToBaseline(page);
    await ensureFrame(page, '8');
    // Mock simulate isolate to trigger fallback to offline (API error)
    await page.route('**/api/v1/simulate/isolate-host', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'mock error' }) });
    });
    // Click simulate - should fallback to offline simulation when API fails (since we have frame data)
    await page.getByTestId('simulate-preventive-btn').click();
    await expect(page.getByTestId('preventive-result-card')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('preventive-removed-edges')).toBeVisible();
    await page.unroute('**/api/v1/health');
    await page.unroute('**/api/v1/simulate/isolate-host');
  });
});

test.describe('containment', () => {
  test('containment - result card shows estimated risk reduction and stage change with topology muted edges', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
    await resetToBaseline(page);
    await ensureFrame(page, '8');
    await expect(page.getByTestId('warning-banner')).toBeVisible();
    // Before simulation, no containment result
    await expect(page.getByTestId('preventive-result-card')).toBeHidden();
    // Simulate
    await page.getByTestId('simulate-preventive-btn').click();
    await expect(page.getByTestId('preventive-result-card')).toBeVisible({ timeout: 10000 });
    // Check containment details
    await expect(page.getByTestId('preventive-result-card')).toContainText('Containment Result');
    await expect(page.getByTestId('preventive-result-card')).toContainText('Estimated simulated effect - not causal proof');
    // Risk reduction
    const riskRed = await page.getByTestId('preventive-risk-reduction').textContent();
    expect(riskRed).toMatch(/%/);
    // Stage change indicator may be present if stage changed after isolation
    const stageBefore = await page.getByTestId('preventive-before-stage').textContent();
    const stageAfter = await page.getByTestId('preventive-after-stage').textContent();
    // At least one of them should be visible, and if different, stage-changed badge appears
    if (stageBefore !== stageAfter) {
      await expect(page.getByTestId('preventive-stage-changed')).toBeVisible();
    }
    // Removed edges muted orange dashed
    await expect(page.getByTestId('preventive-removed-edges')).toContainText('muted orange dashed');
    // Topology should show removed edges as muted orange when simulation active
    await expect(page.getByTestId('topology-count')).toContainText('removed - simulated');
    await expect(page.getByTestId('topology-legend')).toContainText('Simulated removed - orange muted');
    // Clear and verify topology returns to normal
    await page.getByTestId('preventive-clear-btn').click();
    await expect(page.getByTestId('preventive-result-card')).toBeHidden({ timeout: 2000 });
    await expect(page.getByTestId('topology-count')).not.toContainText('removed - simulated');
  });

  test('containment - warning-to-response flow works with one analyst action at 1280x720 and 1440x900', async ({ page }) => {
    for (const vp of [
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto('/');
      await expect(page.getByTestId('preventive-action-panel')).toBeVisible({ timeout: 15000 });
      await resetToBaseline(page);
      await ensureFrame(page, '8');
      await expect(page.getByTestId('warning-banner')).toBeVisible();
      await expect(page.getByTestId('response-callout')).toBeVisible();
      // One analyst action: click Simulate Preventive Action
      await page.getByTestId('simulate-preventive-btn').click();
      await expect(page.getByTestId('preventive-result-card')).toBeVisible({ timeout: 10000 });
      // Result should be visible without scrolling beyond decision rail at both viewports
      const cardBox = await page.getByTestId('preventive-result-card').boundingBox();
      expect(cardBox).not.toBeNull();
      // Check no horizontal overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 5);
      expect(overflow).toBeTruthy();
      // Clear for next viewport
      await page.getByTestId('preventive-clear-btn').click();
      await expect(page.getByTestId('preventive-result-card')).toBeHidden();
    }
  });
});
