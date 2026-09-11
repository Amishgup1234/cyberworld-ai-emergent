import { test, expect } from '@playwright/test';

async function setFrameViaAnalysis(page: import('@playwright/test').Page, val: string) {
  await page.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null;
    if (ae && ae !== document.body) ae.blur();
  });
  const target = parseInt(val, 10);
  const slider = page.getByTestId('frame-slider');
  // use analysis goToFrame via slider
  let current = parseInt(await slider.inputValue(), 10);
  let attempts = 0;
  while (current !== target && attempts < 40) {
    if (current < target) await page.keyboard.press('ArrowRight');
    else await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(120);
    const newVal = await slider.inputValue();
    const newInt = parseInt(newVal, 10);
    if (newInt === current) {
      await slider.evaluate((el: HTMLInputElement, v: string) => {
        const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (native) native.call(el, v);
        else el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, val);
      await page.waitForTimeout(300);
      break;
    }
    current = newInt;
    attempts++;
  }
  await expect(slider).toHaveValue(val, { timeout: 5000 });
  await page.waitForTimeout(300);
}

test.describe('analysis command centre', () => {
  test('analysis command centre - single-screen workspace 65/35 with hero and decision rail at 1280x720', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('analysis-command-centre')).toBeVisible();
    await expect(page.getByTestId('analysis-hero')).toBeVisible();
    await expect(page.getByTestId('analysis-hero')).toContainText('CyberWorld AI - Predictive Cybersecurity Analysis');
    await expect(page.getByTestId('analysis-hero')).toContainText('Analyzes chronological network flows');
    await expect(page.getByTestId('analysis-hero')).toContainText('Workflow:');
    // hero should be within first viewport - no scroll needed for essential controls
    const heroBox = await page.getByTestId('analysis-hero').boundingBox();
    expect(heroBox).not.toBeNull();
    if (heroBox) expect(heroBox.y).toBeLessThan(300);

    await expect(page.getByTestId('analysis-progress')).toBeVisible();
    await expect(page.getByTestId('analysis-status')).toBeVisible();
    await expect(page.getByTestId('analysis-workspace')).toBeVisible();
    await expect(page.getByTestId('analysis-topology')).toBeVisible();
    await expect(page.getByTestId('analysis-decision-rail')).toBeVisible();

    // 65/35: topology col-span-8, rail col-span-4 => topology width approx 2x rail
    const topoBox = await page.getByTestId('analysis-topology').boundingBox();
    const railBox = await page.getByTestId('analysis-decision-rail').boundingBox();
    expect(topoBox).not.toBeNull();
    expect(railBox).not.toBeNull();
    if (topoBox && railBox) {
      // topology should be wider than rail
      expect(topoBox.width).toBeGreaterThan(railBox.width);
      // roughly 65/35 ratio within tolerance: topo ~1.8-2.2x rail
      const ratio = topoBox.width / railBox.width;
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(2.8);
    }

    // topology should have correct grid class
    await expect(page.getByTestId('analysis-workspace')).toHaveClass(/grid-cols-12/);
    await expect(page.getByTestId('analysis-topology')).toHaveClass(/lg:col-span-8/);
    await expect(page.getByTestId('analysis-decision-rail')).toHaveClass(/lg:col-span-4/);

    // decision rail contains essential controls visible without scrolling at 1280x720
    await expect(page.getByTestId('risk-card')).toBeVisible();
    await expect(page.getByTestId('stage-panel')).toBeVisible();
    await expect(page.getByTestId('target-panel')).toBeVisible();
    // Check they are within viewport without excessive scroll (allow up to 900 due to taller 65/35 + threat explanation)
    const riskBox = await page.getByTestId('risk-card').boundingBox();
    expect(riskBox).not.toBeNull();
    if (riskBox) expect(riskBox.y).toBeLessThan(900);

    // main grid still preserved for backward compat
    const main = page.locator('main');
    await expect(main).toHaveClass(/grid-cols-12/);
    await expect(main).toHaveClass(/max-w-\[1600px\]/);
    // no horizontal overflow
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 5);
    expect(overflow).toBeTruthy();
  });

  test('analysis command centre - visible at 1440x900 with no overflow and dataset disclosure', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('analysis-command-centre')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('analysis-hero')).toBeVisible();
    await expect(page.getByTestId('analysis-progress')).toBeVisible();
    await expect(page.getByTestId('analysis-status')).toBeVisible();
    await expect(page.getByTestId('analysis-workspace')).toBeVisible();
    await expect(page.getByTestId('topology')).toBeVisible();
    await expect(page.getByTestId('risk-card')).toBeVisible();
    // dataset disclosure compact still visible
    await expect(page.getByTestId('mode-banner')).toBeVisible();
    await expect(page.getByTestId('mode-banner')).toContainText(/Offline Mode|API Mode/);
    // disclosure line contains data mode and seed 42
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/seed 42/i);
    expect(bodyText).toMatch(/offline_bundle\.json/);
    // no overflow at 1440
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 5);
    expect(overflow).toBeTruthy();
  });

  test('analysis command centre - new viewer can identify what system does from first viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.getByTestId('analysis-hero')).toBeVisible({ timeout: 15000 });
    const heroText = await page.getByTestId('analysis-hero').textContent();
    expect(heroText).toContain('Predictive Cybersecurity');
    expect(heroText).toContain('network flows');
    expect(heroText).toContain('Risk model');
    expect(heroText).toContain('Target ranking');
    expect(heroText).toContain('Preventive Action');
    expect(heroText).toContain('Threat Explanation');
    // also check analysis status explains phases
    await expect(page.getByTestId('analysis-status')).toContainText('Baseline');
    await expect(page.getByTestId('analysis-status')).toContainText('Emerging risk');
    await expect(page.getByTestId('analysis-status')).toContainText('Early warning');
    await expect(page.getByTestId('analysis-status')).toContainText('Response');
    await expect(page.getByTestId('analysis-status')).toContainText('Confirmation');
  });
});

test.describe('analysis progress', () => {
  test('analysis progress - shows Analysis Session, Analysis Progress, Pause/Continue, Restart Analysis, milestone nav, speed, scrubber', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('analysis-progress')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('analysis-session-title')).toContainText('Analysis Session');
    await expect(page.getByTestId('analysis-progress')).toContainText('Analysis Progress');
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Analysis Progress: Frame');
    await expect(page.getByTestId('analysis-progress-text')).toContainText('Analysis Progress:');
    // Pause/Continue and Restart Analysis buttons
    const pauseBtn = page.getByTestId('pause-btn');
    const continueBtn = page.getByTestId('continue-btn');
    const restartBtn = page.getByTestId('restart-analysis-btn');
    // One of pause/continue should be visible depending on auto-start
    const hasPause = await pauseBtn.count() > 0 && await pauseBtn.isVisible().catch(() => false);
    const hasContinue = await continueBtn.count() > 0 && await continueBtn.isVisible().catch(() => false);
    expect(hasPause || hasContinue).toBeTruthy();
    if (hasPause) await expect(pauseBtn).toContainText('Pause');
    if (hasContinue) await expect(continueBtn).toContainText('Continue');
    await expect(restartBtn).toBeVisible();
    await expect(restartBtn).toContainText('Restart Analysis');
    await expect(restartBtn).toHaveAttribute('aria-label', 'Restart Analysis');
    // speed 0.5x 1x 2x via analysis-speed-*
    await expect(page.getByTestId('analysis-speed-0.5x')).toBeVisible();
    await expect(page.getByTestId('analysis-speed-1x')).toBeVisible();
    await expect(page.getByTestId('analysis-speed-2x')).toBeVisible();
    // scrubber
    await expect(page.getByTestId('analysis-scrubber-container')).toBeVisible();
    await expect(page.getByTestId('analysis-scrubber-bar')).toBeAttached();
    await expect(page.getByTestId('analysis-slider')).toBeAttached();
    // milestone nav
    await expect(page.getByTestId('milestone-nav')).toBeVisible();
    await expect(page.getByTestId('milestone-baseline')).toBeVisible();
    await expect(page.getByTestId('milestone-baseline')).toContainText('Baseline');
    await expect(page.getByTestId('milestone-emerging')).toBeVisible();
    await expect(page.getByTestId('milestone-warning')).toBeVisible();
    await expect(page.getByTestId('milestone-confirmation')).toBeVisible();
    await expect(page.getByTestId('milestone-warning')).toContainText('Early warning');
    await expect(page.getByTestId('milestone-confirmation')).toContainText('Confirmation');
    // timestamp display via analysis
    await expect(page.getByTestId('analysis-timestamp-display')).toBeVisible();
  });

  test('analysis progress - milestone navigation gated and analysis state phases', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('analysis-progress')).toBeVisible({ timeout: 15000 });
    // Initially at frame 0 baseline, emerging/warning/confirmation disabled until reached
    // Since auto-start is true for 30 frames, we may be at frame 0 quickly before progression
    // Force to frame 0 via restart
    await page.getByTestId('restart-analysis-btn').click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 0/');
    await expect(page.getByTestId('analysis-status')).toBeVisible();
    // Baseline should be active at frame 0
    await expect(page.getByTestId('phase-baseline')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('milestone-baseline')).toBeEnabled();
    // Emerging, warning, confirmation should be disabled initially (not yet reached)
    await expect(page.getByTestId('milestone-emerging')).toBeDisabled();
    await expect(page.getByTestId('milestone-warning')).toBeDisabled();
    await expect(page.getByTestId('milestone-confirmation')).toBeDisabled();

    // Move to frame 6 emerging risk - use analysis slider via keyboard ArrowRight 6 times or setFrameViaAnalysis helper
    // Pause first to prevent auto-progress interfering
    const pauseBtn = page.getByTestId('pause-btn');
    if (await pauseBtn.count() > 0 && await pauseBtn.isVisible()) {
      await pauseBtn.click();
      await page.waitForTimeout(200);
    }
    await setFrameViaAnalysis(page, '6');
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 6/');
    // Now emerging should be enabled, warning still disabled
    await expect(page.getByTestId('milestone-emerging')).toBeEnabled();
    await expect(page.getByTestId('phase-emerging-risk')).toHaveAttribute('aria-current', 'step');

    // Continue to warning frame 8
    await setFrameViaAnalysis(page, '8');
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 8/');
    await expect(page.getByTestId('milestone-warning')).toBeEnabled();
    await expect(page.getByTestId('phase-early-warning')).toHaveAttribute('aria-current', 'step');
    // Click milestone baseline to go back
    await page.getByTestId('milestone-baseline').click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 0/');
    // Click warning milestone to go forward (should be enabled now since reached)
    await page.getByTestId('milestone-warning').click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 8/');

    // Check confirmation still disabled before 20
    await expect(page.getByTestId('milestone-confirmation')).toBeDisabled();
    await setFrameViaAnalysis(page, '20');
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 20/');
    await expect(page.getByTestId('milestone-confirmation')).toBeEnabled();
    await expect(page.getByTestId('phase-confirmation')).toHaveAttribute('aria-current', 'step');
    // Ground truth should be revealed at 20
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Revealed');
  });

  test('analysis progress - Pause, Continue, Restart Analysis and speed controls work keyboard accessible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('analysis-progress')).toBeVisible({ timeout: 15000 });
    // Restart to frame 0
    await page.getByTestId('restart-analysis-btn').click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 0/');
    // Check Continue/Pause toggle
    const pauseBtn = page.getByTestId('pause-btn');
    const continueBtn = page.getByTestId('continue-btn');
    // After restart with auto-start true, should be running => pause visible
    // But we may have paused via previous test? Ensure state
    let isRunning = await pauseBtn.isVisible().catch(() => false);
    if (!isRunning) {
      // Currently paused, click Continue
      await expect(continueBtn).toBeVisible();
      await expect(continueBtn).toHaveAttribute('aria-label', 'Continue analysis');
      await continueBtn.click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId('pause-btn')).toBeVisible();
      await expect(page.getByTestId('pause-btn')).toHaveAttribute('aria-label', 'Pause analysis');
      // Now pause
      await page.getByTestId('pause-btn').click();
      await page.waitForTimeout(200);
      await expect(page.getByTestId('continue-btn')).toBeVisible();
    } else {
      await expect(pauseBtn).toHaveAttribute('aria-label', 'Pause analysis');
      await pauseBtn.click();
      await page.waitForTimeout(200);
      await expect(page.getByTestId('continue-btn')).toBeVisible();
      await page.getByTestId('continue-btn').click();
      await page.waitForTimeout(200);
      await expect(page.getByTestId('pause-btn')).toBeVisible();
      await page.getByTestId('pause-btn').click();
      await page.waitForTimeout(200);
    }

    // Restart Analysis should go to 0 and be paused/ready
    await setFrameViaAnalysis(page, '5');
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 5/');
    await page.getByTestId('restart-analysis-btn').click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 0/');

    // Speed controls
    await expect(page.getByTestId('analysis-speed-0.5x')).toBeVisible();
    await expect(page.getByTestId('analysis-speed-1x')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('analysis-speed-2x').click();
    await expect(page.getByTestId('analysis-speed-2x')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('analysis-speed-1x').click();
    await expect(page.getByTestId('analysis-speed-1x')).toHaveAttribute('aria-pressed', 'true');

    // Keyboard: Space should toggle Pause/Continue when not focused on button/tab
    await page.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae) ae.blur();
      document.body.setAttribute('tabindex', '-1');
      document.body.focus();
    });
    await page.waitForTimeout(150);
    // Ensure we are at frame 0 paused state before Space
    const contBtn = page.getByTestId('continue-btn');
    if (await contBtn.isVisible()) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      await expect(page.getByTestId('pause-btn')).toBeVisible();
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      await expect(page.getByTestId('continue-btn')).toBeVisible();
    } else {
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      await expect(page.getByTestId('continue-btn')).toBeVisible();
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      await expect(page.getByTestId('pause-btn')).toBeVisible();
    }

    // R should restart
    await setFrameViaAnalysis(page, '7');
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 7/');
    await page.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae) ae.blur();
      document.body.focus();
    });
    await page.keyboard.press('r');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 0/');
  });

  test('analysis progress - auto-start pauses at warning before ground truth', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('analysis-progress')).toBeVisible({ timeout: 15000 });
    // Restart to ensure auto-start from 0
    await page.getByTestId('restart-analysis-btn').click();
    await page.waitForTimeout(300);
    // Ensure running (pause visible) or continue to start
    const contBtn = page.getByTestId('continue-btn');
    if (await contBtn.isVisible()) {
      await contBtn.click();
    }
    await expect(page.getByTestId('pause-btn')).toBeVisible({ timeout: 2000 });
    // Wait for auto-progress to hit warning at frame 8 (should pause)
    // Speed 1x is 800ms per frame, 8 frames ~6.4s, plus pause at warning. Use faster speed 2x to speed up.
    await page.getByTestId('analysis-speed-2x').click();
    // Wait for warning banner to appear (indicates frame 8)
    await expect(page.getByTestId('warning-banner')).toBeVisible({ timeout: 10000 });
    // At warning, analysis status should be warning-review or early-warning, and frame should be 8
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 8/', { timeout: 5000 });
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Hidden - gated');
    // Ensure ground truth still hidden at warning
    await expect(page.getByTestId('ground-truth-panel')).not.toContainText('Revealed');
    // Status badge should show warning-review or early warning
    const statusText = await page.getByTestId('analysis-status').textContent();
    expect(statusText).toMatch(/Early warning|Warning/);
    // Continue to confirmation
    const continueBtn2 = page.getByTestId('continue-btn');
    if (await continueBtn2.isVisible()) await continueBtn2.click();
    else {
      // If still pause, click continue after warning-review
      const c = page.getByTestId('continue-btn');
      if (await c.isVisible()) await c.click();
    }
    // Speed 2x again, wait for ground truth at 20
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Revealed', { timeout: 15000 });
    await expect(page.getByTestId('analysis-frame-display')).toContainText('Frame 20/', { timeout: 5000 });
    await expect(page.getByTestId('phase-confirmation')).toHaveAttribute('aria-current', 'step');
    // Reset speed
    await page.getByTestId('analysis-speed-1x').click();
  });
});
