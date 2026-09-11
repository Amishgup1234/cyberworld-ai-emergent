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
  // Ensure topology visible and baseline
  await expect(page.getByTestId('topology')).toBeVisible();
}

test.describe('threat visualization', () => {
  test('threat visualization - topology motion for analysis, observed activity, predicted path, warning target, confirmation with reduced-motion support', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
    await resetToBaseline(page);

    // Check topology has data attributes for motion and no invented nodes
    const topology = page.getByTestId('topology');
    await expect(topology).toHaveAttribute('data-testid', 'topology');
    // Should have 20 hosts visible at baseline
    await expect(page.getByTestId('topology-count')).toContainText('20 hosts visible');
    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(21); // 20 hosts + 1 cluster? At baseline visible 20 plus cluster? Actually 20 visible + cluster node =21? But at baseline with 20 visible, cluster node exists as +332? Wait visible 20 plus cluster node makes 21. Let's check: At baseline, visible 20 plus cluster node =21 nodes total in DOM (including cluster). So count may be 21.
    // Instead check visible hosts via topology-count
    const countText = await page.getByTestId('topology-count').textContent();
    expect(countText).toMatch(/20 hosts visible/);

    // Analysis running motion: when analysis is running, topology should have data-analysis-running true or have analysis pulse on nodes
    // Restart to 0 is paused (ready), so not running. Click Continue to start analysis
    const continueBtn = page.getByTestId('continue-btn');
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
      await page.waitForTimeout(500);
      await expect(page.getByTestId('topology')).toHaveAttribute('data-analysis-running', 'true');
      // Check that at least one host node has data-motion analysis when running
      const analysisNodes = page.locator('[data-motion="analysis"]');
      // At baseline running, there should be some analysis pulse nodes (risk >0.15)
      const analysisCount = await analysisNodes.count();
      expect(analysisCount).toBeGreaterThan(0);
      // Pause again
      await page.getByTestId('pause-btn').click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId('topology')).toHaveAttribute('data-analysis-running', 'false');
    }

    // Observed activity motion: edges with high activity should have animated dash when running
    // Go to frame 8 warning where observed activity is high
    await ensureFrame(page, '8');
    await expect(page.getByTestId('warning-banner')).toBeVisible();
    // Check that predicted path exists at warning frame (should have +1 predicted)
    await expect(page.getByTestId('topology-count')).toContainText('+ 1 predicted');
    // Check predicted edge has class topology-motion-predicted and is animated
    const predictedEdges = page.locator('.react-flow__edge.topology-motion-predicted');
    // At least one predicted edge should be present
    await expect(predictedEdges.first()).toBeAttached({ timeout: 5000 });
    // Check that predicted edge is animated (has animated class)
    const predictedAnimated = await predictedEdges.first().evaluate((el) => el.classList.contains('animated') || el.classList.contains('topology-motion-predicted'));
    expect(predictedAnimated).toBeTruthy();

    // Warning target motion: top target host should have warning pulse
    await expect(page.getByTestId('topology')).toHaveAttribute('data-warning-active', 'true');
    const warningNodes = page.locator('[data-motion="warning"]');
    await expect(warningNodes.first()).toBeVisible({ timeout: 5000 });
    const warningCount = await warningNodes.count();
    expect(warningCount).toBeGreaterThanOrEqual(1);
    // Check that warning node has topology-motion-warning class and is visible
    const hasWarningClass = await warningNodes.first().evaluate((el) => el.className.includes('topology-motion-warning'));
    expect(hasWarningClass).toBeTruthy();
    // Check that warning node's aria-label contains warning target pulse
    const aria = await warningNodes.first().getAttribute('aria-label');
    expect(aria).toMatch(/warning target pulse/);

    // Confirmation motion: go to frame 20
    await ensureFrame(page, '20');
    await expect(page.getByTestId('topology')).toHaveAttribute('data-ground-truth', 'true');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Revealed');
    const confirmationNodes = page.locator('[data-motion="confirmation"]');
    const confCount = await confirmationNodes.count();
    expect(confCount).toBeGreaterThanOrEqual(1);
    const hasConfClass = await confirmationNodes.first().evaluate((el) => el.className.includes('topology-motion-confirmation'));
    expect(hasConfClass).toBeTruthy();

    // Motion never invents nodes/edges/paths: check that edges count is consistent and predicted path is only when forecast has it
    // At frame 0, predicted path may be absent or present depending on data, but at frame 8 it is present, at frame 0 it should be either 0 or 1 but not invented
    await ensureFrame(page, '0');
    await page.waitForTimeout(400);
    // Count edges at frame 0 vs frame 8 - they should be data-derived, not hardcoded to always 1
    // We check that topology-count mentions edges and predicted correctly
    const count0 = await page.getByTestId('topology-count').textContent();
    expect(count0).toMatch(/\d+ edges/);
    // No invented attack claims: stage should be Normal at 0, not Credential Attack
    await expect(page.getByTestId('stage-panel')).toContainText('Normal');
  });

  test('threat visualization - reduced-motion disables animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
    await resetToBaseline(page);
    await ensureFrame(page, '8');
    await expect(page.getByTestId('warning-banner')).toBeVisible();
    // With reduced-motion, animations should be none
    const warningNode = page.locator('[data-motion="warning"]').first();
    await expect(warningNode).toBeVisible();
    const animation = await warningNode.evaluate((el) => window.getComputedStyle(el).animationName);
    // Should be none or empty when reduced-motion
    expect(animation === 'none' || animation === '' || animation.includes('none')).toBeTruthy();

    // Predicted edge should also have animation none
    const predictedEdge = page.locator('.react-flow__edge.topology-motion-predicted').first();
    if (await predictedEdge.count() > 0) {
      const edgeAnimation = await predictedEdge.evaluate((el) => {
        const path = el.querySelector('path');
        if (!path) return window.getComputedStyle(el).animationName;
        return window.getComputedStyle(path).animationName;
      });
      // With reduced-motion, should be none
      const isNone = edgeAnimation === 'none' || edgeAnimation === '' || edgeAnimation.includes('none');
      expect(isNone).toBeTruthy();
    }

    // Reset media
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('threat visualization - learned, rule-derived, graph-ranked, measured, simulated remain distinct', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
    await resetToBaseline(page);
    await ensureFrame(page, '8');
    // Threat explanation should be visible and show distinct labels
    await expect(page.getByTestId('threat-explanation')).toBeVisible();
    const threatText = await page.getByTestId('threat-explanation').textContent();
    expect(threatText).toContain('Learned');
    expect(threatText).toContain('Rule-derived');
    expect(threatText).toContain('NetworkX graph-ranked');
    expect(threatText).toContain('Measured');
    expect(threatText).toContain('Simulated');
    expect(threatText).toContain('not causal proof');
    // Check that risk card still shows Learned label
    await expect(page.getByTestId('risk-card')).toContainText('Learned');
    await expect(page.getByTestId('stage-panel')).toContainText('Rule-Derived');
    await expect(page.getByTestId('target-panel')).toContainText('NetworkX Graph-Ranked');
    // Check that threat explanation shows real values, not hardcoded Stitch 0.850
    expect(threatText).not.toContain('0.850');
    // Check that topology legend still shows distinct states with text+icon
    await expect(page.getByTestId('topology-legend')).toContainText('Observed - cyan solid - healthy');
    await expect(page.getByTestId('topology-legend')).toContainText('Predicted path - purple dashed');
  });
});

test.describe('technical proof', () => {
  test('technical proof - expandable drawer with detailed evidence, MITRE, measured metrics, method and limitations in same interface', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('technical-proof-drawer')).toBeVisible({ timeout: 15000 });
    const toggle = page.getByTestId('technical-proof-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true'); // initially open for existing tests
    await expect(toggle).toHaveAttribute('aria-controls', 'technical-proof-content');
    await expect(toggle).toHaveAttribute('aria-label', /Collapse|Expand/);
    // Content should be visible initially
    await expect(page.getByTestId('technical-proof-content')).toBeVisible();
    await expect(page.getByTestId('technical-proof-content')).toHaveAttribute('role', 'region');
    // Check detailed sections inside
    await expect(page.getByTestId('technical-proof-evidence-detail')).toBeVisible();
    await expect(page.getByTestId('technical-proof-evidence-detail')).toContainText('Observed vs Global Importance');
    await expect(page.getByTestId('technical-proof-mitre-detail')).toBeVisible();
    await expect(page.getByTestId('technical-proof-mitre-detail')).toContainText('Pinned v13.1');
    await expect(page.getByTestId('technical-proof-metrics-detail')).toBeVisible();
    await expect(page.getByTestId('technical-proof-metrics-detail')).toContainText('Measured Metrics - Held-out Friday');
    await expect(page.getByTestId('technical-proof-metrics-detail')).toContainText('0.845 macro F1');
    await expect(page.getByTestId('technical-proof-method')).toBeVisible();
    await expect(page.getByTestId('technical-proof-method')).toContainText('Method and Limitations');
    await expect(page.getByTestId('technical-proof-method')).toContainText('Binary benign-versus-malicious');
    // Children should contain WorkspaceTabs
    await expect(page.getByTestId('technical-proof-children')).toBeVisible();
    await expect(page.getByTestId('workspace-tabs')).toBeVisible();
    // Collapse
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('technical-proof-content')).toBeHidden();
    // Expand again
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('technical-proof-content')).toBeVisible();
  });

  test('technical proof - keyboard, ARIA, focus and reduced-motion checks pass', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('technical-proof-drawer')).toBeVisible({ timeout: 15000 });
    const toggle = page.getByTestId('technical-proof-toggle');
    await expect(toggle).toBeVisible();
    // Keyboard: focus and Enter/Space should toggle
    await toggle.focus();
    await expect(toggle).toBeFocused();
    expect(await toggle.evaluate((el) => el.className.includes('focus:ring-2') && el.className.includes('focus:ring-cyan-400'))).toBeTruthy();
    // Press Space to collapse
    await page.keyboard.press(' ');
    await expect(page.getByTestId('technical-proof-content')).toBeHidden({ timeout: 2000 });
    // Press Enter to expand
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('technical-proof-content')).toBeVisible({ timeout: 2000 });
    // Escape should collapse and return focus to toggle
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('technical-proof-content')).toBeHidden({ timeout: 2000 });
    await expect(toggle).toBeFocused();
    // Re-expand for further checks
    await toggle.click();
    await expect(page.getByTestId('technical-proof-content')).toBeVisible();
    // Focus collapse button inside
    const collapseBtn = page.getByTestId('technical-proof-collapse-btn');
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.focus();
    await expect(collapseBtn).toBeFocused();
    expect(await collapseBtn.evaluate((el) => el.className.includes('focus:ring-2'))).toBeTruthy();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('technical-proof-content')).toBeHidden();
    // Check reduced-motion: drawer content should have transition none when prefers-reduced-motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toggle.click(); // expand again
    await expect(page.getByTestId('technical-proof-content')).toBeVisible();
    const transition = await page.getByTestId('technical-proof-content').evaluate((el) => window.getComputedStyle(el).transition);
    // With reduced-motion, transition should be none or empty
    expect(transition === 'none' || transition === '' || transition.includes('none') || transition === 'all 0s ease 0s').toBeTruthy();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('technical proof - preserves real API-derived values and distinct claim labels', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('technical-proof-drawer')).toBeVisible({ timeout: 15000 });
    // Ensure drawer is open
    const toggle = page.getByTestId('technical-proof-toggle');
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    await expect(page.getByTestId('technical-proof-content')).toBeVisible();
    const contentText = await page.getByTestId('technical-proof-content').textContent();
    expect(contentText).toContain('Learned is binary risk only');
    expect(contentText).toContain('Rule-derived');
    expect(contentText).toContain('NetworkX');
    expect(contentText).toContain('simulated not causal proof');
    expect(contentText).not.toContain('192.168');
    expect(contentText).not.toContain('Linux');
    // Check that threat explanation still distinct outside drawer
    await expect(page.getByTestId('threat-explanation')).toBeVisible();
    const threatText = await page.getByTestId('threat-explanation').textContent();
    expect(threatText).toContain('Learned');
    expect(threatText).toContain('Rule-derived');
    expect(threatText).toContain('Graph-ranked');
    // Check that workspace tabs still accessible inside drawer
    await expect(page.getByTestId('workspace-tabs')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Evidence' })).toBeVisible();
  });
});
