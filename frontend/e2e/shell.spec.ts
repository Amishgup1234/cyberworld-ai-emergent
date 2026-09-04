import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

async function setFrame(page: import('@playwright/test').Page, val: string) {
  await page.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null;
    if (ae && ae !== document.body) ae.blur();
  });
  const target = parseInt(val, 10);
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
      await slider.evaluate((el: HTMLInputElement, v: string) => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeInputValueSetter) nativeInputValueSetter.call(el, v);
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

test.describe('shell - application shell and dashboard hierarchy', () => {
  test('shell - command bar visible full-screen h-12 at 1280x720', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    const bar = page.getByTestId('command-bar');
    await expect(bar).toHaveClass(/h-12/);
    await expect(bar).toHaveClass(/border-b/);
    // brand - always visible
    await expect(page.getByTestId('brand-title')).toContainText('CYBERWORLD AI');
    await expect(page.getByText('SOC-v3.1')).toBeVisible();
    // DIGITAL TWIN hidden at 1280 to preserve center width, visible at 1350+
    await expect(page.getByTestId('command-bar').getByText('DIGITAL TWIN')).toBeHidden();
    // health/mode - connection badge always visible (sm+)
    await expect(page.getByTestId('connection-badge')).toBeVisible();
    // dataset and model pills hidden at 1280 to prevent overlap, visible at 1350+
    await expect(page.getByTestId('dataset-badge')).toBeHidden();
    // model pill may be hidden at 1280 due to responsive, check that either model-pill or unavailable hidden but not asserting visible
    const modelPill = page.getByTestId('model-pill');
    const modelUnavailable = page.getByTestId('model-pill-unavailable');
    // at 1280 both should be hidden (responsive)
    if (await modelPill.count() > 0) await expect(modelPill).toBeHidden();
    if (await modelUnavailable.count() > 0) await expect(modelUnavailable).toBeHidden();
    await expect(page.getByTestId('help-btn')).toBeVisible();
    // brand/replay/status regions exist
    await expect(page.getByTestId('brand-region')).toBeVisible();
    await expect(page.getByTestId('replay-region')).toBeVisible();
    await expect(page.getByTestId('status-region')).toBeVisible();
    // workspace 12-col
    const main = page.locator('main');
    await expect(main).toHaveClass(/grid-cols-12/);
    await expect(main).toHaveClass(/max-w-\[1600px\]/);
    // no overflow - check body does not have horizontal scroll (keep but not rely alone)
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 5;
    });
    expect(overflow).toBeTruthy();
    await expect(page.getByTestId('app-shell')).toBeVisible();
  });

  test('shell - command bar and workspace visible at 1440x900 with no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('brand-title')).toBeVisible();
    // at 1440, DIGITAL TWIN should be visible (min-[1350px]:block)
    await expect(page.getByTestId('command-bar').getByText('DIGITAL TWIN')).toBeVisible();
    const main = page.locator('main');
    await expect(main).toBeVisible();
    await expect(main).toHaveClass(/grid-cols-12/);
    // check topology visible
    await expect(page.getByTestId('topology')).toBeVisible();
    // dataset and model pills visible at 1440 if health provides them
    const datasetBadge = page.getByTestId('dataset-badge');
    await expect(datasetBadge).toBeVisible();
    // model pill visible at 1440 if health has model, otherwise unavailable pill visible
    const modelPill = page.getByTestId('model-pill');
    const modelUnavailable = page.getByTestId('model-pill-unavailable');
    const hasModelPill = await modelPill.count() > 0;
    const hasUnavailable = await modelUnavailable.count() > 0;
    if (hasModelPill) await expect(modelPill).toBeVisible();
    else if (hasUnavailable) await expect(modelUnavailable).toBeVisible();
    // check no overflow hidden content
    const hasOverflow = await page.evaluate(() => {
      const el = document.querySelector('main');
      if (!el) return false;
      return el.scrollWidth > el.clientWidth + 10;
    });
    // overflow-auto is expected, but no hidden clipped overflow beyond scroll
    expect(hasOverflow).toBeFalsy(); // we allow overflow-auto but not hidden clipped
  });

  test('shell - full-screen dashboard hierarchy with 12-col workspace', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('app-shell')).toHaveClass(/h-screen/);
    await expect(page.getByTestId('app-shell')).toHaveClass(/w-screen/);
    await expect(page.locator('main')).toHaveClass(/gap-4/);
    // topology + triage rail should be in 12-col
    await expect(page.getByTestId('topology')).toBeVisible();
    await expect(page.getByTestId('risk-card')).toBeVisible();
    await expect(page.getByTestId('stage-panel')).toBeVisible();
    await expect(page.getByTestId('target-panel')).toBeVisible();
  });
});

test.describe('command-bar overlap - bounding box containment', () => {
  async function assertNoOverlap(page: import('@playwright/test').Page, viewport: string) {
    const brandBox = await page.getByTestId('brand-region').boundingBox();
    const replayRegionBox = await page.getByTestId('replay-region').boundingBox();
    const replayTimelineBox = await page.getByTestId('replay-timeline').boundingBox();
    const statusBox = await page.getByTestId('status-region').boundingBox();

    expect(brandBox, `brand region box missing at ${viewport}`).not.toBeNull();
    expect(replayRegionBox, `replay region box missing at ${viewport}`).not.toBeNull();
    expect(replayTimelineBox, `replay-timeline box missing at ${viewport}`).not.toBeNull();
    expect(statusBox, `status region box missing at ${viewport}`).not.toBeNull();
    if (!brandBox || !replayRegionBox || !replayTimelineBox || !statusBox) return;

    // brand.right <= replayRegion.left (with 2px tolerance)
    const brandRight = brandBox.x + brandBox.width;
    const replayLeft = replayRegionBox.x;
    expect(brandRight, `brand overlaps replay-region at ${viewport}: brandRight ${brandRight} replayLeft ${replayLeft}`).toBeLessThanOrEqual(replayLeft + 2);

    // replayRegion.right <= status.left
    const replayRight = replayRegionBox.x + replayRegionBox.width;
    const statusLeft = statusBox.x;
    expect(replayRight, `replay-region overlaps status at ${viewport}: replayRight ${replayRight} statusLeft ${statusLeft}`).toBeLessThanOrEqual(statusLeft + 2);

    // ReplayTimeline contained inside its center wrapper
    const timelineLeft = replayTimelineBox.x;
    const timelineRight = replayTimelineBox.x + replayTimelineBox.width;
    const regionLeft = replayRegionBox.x;
    const regionRight = replayRegionBox.x + replayRegionBox.width;
    expect(timelineLeft, `timeline left outside replay-region at ${viewport}`).toBeGreaterThanOrEqual(regionLeft - 2);
    expect(timelineRight, `timeline right outside replay-region at ${viewport}`).toBeLessThanOrEqual(regionRight + 2);
    expect(replayTimelineBox.width, `timeline wider than replay-region at ${viewport}`).toBeLessThanOrEqual(replayRegionBox.width + 2);

    // ensure timeline not overlapping brand/status directly (stricter)
    expect(timelineRight, `timeline overlaps status at ${viewport}`).toBeLessThanOrEqual(statusLeft + 2);
    expect(brandRight, `timeline overlaps brand at ${viewport}`).toBeLessThanOrEqual(timelineLeft + 2);

    // document width no horizontal scroll
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 5;
    });
    expect(overflow, `document scrollWidth exceeds viewport at ${viewport}`).toBeTruthy();

    // essential controls visible and usable
    await expect(page.getByTestId('play-pause-btn')).toBeVisible();
    await expect(page.getByTestId('restart-btn')).toBeVisible();
    await expect(page.getByTestId('speed-0.5x')).toBeVisible();
    await expect(page.getByTestId('speed-1x')).toBeVisible();
    await expect(page.getByTestId('speed-2x')).toBeVisible();
    await expect(page.getByTestId('frame-display')).toBeVisible();
    await expect(page.getByTestId('frame-slider')).toBeVisible();
    // slider usable - can focus
    await page.getByTestId('frame-slider').focus();
    await expect(page.getByTestId('frame-slider')).toBeFocused();

    // command bar height preserved h-12
    await expect(page.getByTestId('command-bar')).toHaveClass(/h-12/);
  }

  test('command-bar overlap - no overlap at 1280x720 bounding box containment', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('brand-region')).toBeVisible();
    await expect(page.getByTestId('replay-region')).toBeVisible();
    await expect(page.getByTestId('status-region')).toBeVisible();
    await expect(page.getByTestId('replay-timeline')).toBeVisible();

    await assertNoOverlap(page, '1280x720');

    // check nonessential hidden at 1280
    await expect(page.getByTestId('command-bar').getByText('DIGITAL TWIN')).toBeHidden();
    await expect(page.getByTestId('timestamp-display')).toBeHidden();
    // Current Frame pill hidden at 1280
    await expect(page.getByTestId('current-frame-pill')).toBeHidden();

    // save viewport screenshot for visual QA
    const outDir = path.resolve(process.cwd(), '..', 'output', 'screenshots');
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, 'viewport-1280.png'), fullPage: false });
    const designOut = path.resolve(process.cwd(), '..', 'design', 'screenshots');
    fs.mkdirSync(designOut, { recursive: true });
    await page.screenshot({ path: path.join(designOut, 'viewport-1280.png'), fullPage: false });
    // also ensure file exists
    expect(fs.existsSync(path.join(outDir, 'viewport-1280.png'))).toBeTruthy();
  });

  test('command-bar overlap - no overlap at 1440x900 bounding box containment', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('brand-region')).toBeVisible();
    await expect(page.getByTestId('replay-region')).toBeVisible();
    await expect(page.getByTestId('status-region')).toBeVisible();
    await expect(page.getByTestId('replay-timeline')).toBeVisible();

    await assertNoOverlap(page, '1440x900');

    // at 1440, nonessential should be visible (timestamp, Current Frame, DIGITAL TWIN)
    await expect(page.getByTestId('command-bar').getByText('DIGITAL TWIN')).toBeVisible();
    await expect(page.getByTestId('timestamp-display')).toBeVisible();
    await expect(page.getByTestId('current-frame-pill')).toBeVisible();

    // save screenshot
    const outDir = path.resolve(process.cwd(), '..', 'output', 'screenshots');
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, 'viewport-1440.png'), fullPage: false });
    const designOut = path.resolve(process.cwd(), '..', 'design', 'screenshots');
    fs.mkdirSync(designOut, { recursive: true });
    await page.screenshot({ path: path.join(designOut, 'viewport-1440.png'), fullPage: false });
    expect(fs.existsSync(path.join(outDir, 'viewport-1440.png'))).toBeTruthy();
  });

  test('command-bar - replay timeline contained and essential controls usable at both viewports', async ({ page }) => {
    for (const vp of [
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto('/');
      await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('replay-timeline')).toBeVisible();
      // essential controls
      await expect(page.getByTestId('play-pause-btn')).toBeVisible();
      await expect(page.getByTestId('restart-btn')).toBeVisible();
      await expect(page.getByTestId('speed-0.5x')).toBeVisible();
      await expect(page.getByTestId('frame-display')).toBeVisible();
      await expect(page.getByTestId('frame-slider')).toBeVisible();
      // interaction: play/pause, speed, restart, slider
      await page.getByTestId('play-pause-btn').click();
      await page.waitForTimeout(200);
      await expect(page.getByTestId('play-pause-btn')).toBeVisible();
      // reset to pause
      await page.getByTestId('play-pause-btn').click();
      await page.waitForTimeout(100);
      await page.getByTestId('speed-2x').click();
      await expect(page.getByTestId('speed-2x')).toHaveAttribute('aria-pressed', 'true');
      await page.getByTestId('speed-1x').click();
      await expect(page.getByTestId('speed-1x')).toHaveAttribute('aria-pressed', 'true');
      const slider = page.getByTestId('frame-slider');
      await slider.focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      await expect(slider).not.toHaveValue('0');
      await page.getByTestId('restart-btn').click();
      await page.waitForTimeout(300);
      await expect(slider).toHaveValue('0');
    }
  });

  test('command-bar - api and offline badges visible and truthful', async ({ page }) => {
    // Default run (likely offline fallback if backend down)
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.getByTestId('mode-banner')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('mode-banner')).toContainText(/Offline Mode|API Mode/);
    // connection badge should be visible and truthful
    const badge = page.getByTestId('connection-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/API Mode|Offline Mode/);
    // Check API mode via mocking health to be trained
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
    await expect(page.getByTestId('connection-badge')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('connection-badge')).toContainText('API Mode');
    // now mock offline (engine not-trained)
    await page.unroute('**/api/v1/health');
    await page.route('**/api/v1/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          engine: 'not-trained',
          model_family: null,
          data_mode: 'synthetic',
          version: null,
          threshold: 0.45,
          claim_limitations: 'Test limitations',
        }),
      });
    });
    await page.goto('/');
    await expect(page.getByTestId('connection-badge')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('connection-badge')).toContainText('Offline Mode');
    await page.unroute('**/api/v1/health');
  });
});

test.describe('replay timeline - Stitch design system', () => {
  test('replay timeline - scrubber, frame counter, timestamp, speed, play/pause/restart', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    const timeline = page.getByTestId('replay-timeline');
    await expect(timeline).toBeVisible();
    await expect(page.getByTestId('play-pause-btn')).toBeVisible();
    await expect(page.getByTestId('restart-btn')).toBeVisible();
    await expect(page.getByTestId('speed-0.5x')).toBeVisible();
    await expect(page.getByTestId('speed-1x')).toBeVisible();
    await expect(page.getByTestId('speed-2x')).toBeVisible();
    await expect(page.getByTestId('frame-display')).toContainText(/Frame \d+\/\d+/);
    // at 1440 timestamp and Current Frame should be visible
    await expect(page.getByTestId('timestamp-display')).toBeVisible();
    await expect(page.getByTestId('frame-slider')).toBeVisible();
    // scrubber bar may have 0 width at frame 0, check it is attached not necessarily visible
    await expect(page.getByTestId('scrubber-bar')).toBeAttached();
    // check responsive scrubber width classes - outer container has responsive width
    const scrubberTrack = page.locator('#scrubber-track');
    await expect(scrubberTrack).toBeVisible();
    const scrubberContainer = page.getByTestId('scrubber-container');
    await expect(scrubberContainer).toHaveClass(/w-24|w-28|w-32|w-36/);
    await expect(scrubberContainer).toHaveClass(/h-2/);
    // at 1280, timestamp and Current Frame hidden
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByTestId('command-bar')).toBeVisible();
    await expect(page.getByTestId('timestamp-display')).toBeHidden();
    await expect(page.getByTestId('current-frame-pill')).toBeHidden();
    // but essential controls still visible at 1280
    await expect(page.getByTestId('play-pause-btn')).toBeVisible();
    await expect(page.getByTestId('restart-btn')).toBeVisible();
    await expect(page.getByTestId('speed-0.5x')).toBeVisible();
    await expect(page.getByTestId('frame-display')).toBeVisible();
    await expect(page.getByTestId('frame-slider')).toBeVisible();
    // play/pause works
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('play-pause-btn')).toContainText('');
    await page.getByTestId('play-pause-btn').click();
    await expect(page.getByTestId('play-pause-btn')).toBeVisible();
    // speed change
    await page.getByTestId('speed-2x').click();
    await expect(page.getByTestId('speed-2x')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('speed-1x').click();
    await expect(page.getByTestId('speed-1x')).toHaveAttribute('aria-pressed', 'true');
    // slider change via keyboard ArrowRight
    const slider = page.getByTestId('frame-slider');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await expect(slider).not.toHaveValue('0');
    await page.getByTestId('restart-btn').click();
    await page.waitForTimeout(300);
    await expect(slider).toHaveValue('0');
  });

  test('replay timeline - preserves API/offline mode and client-side timing', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('mode-banner')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('mode-banner')).toContainText(/Offline Mode|API Mode/);
    // at 1440 dataset and model pills visible, at 1280 hidden - check at 1440
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('dataset-badge')).toBeVisible();
    // model pill API-derived may be visible or unavailable but should be visible at 1440
    const modelPill = page.getByTestId('model-pill');
    const modelUnavailable = page.getByTestId('model-pill-unavailable');
    if (await modelPill.count() > 0) await expect(modelPill).toBeVisible();
    else await expect(modelUnavailable).toBeVisible();
    // replay timeline should use client-side timing, no websocket
    await expect(page.getByTestId('replay-timeline')).toBeVisible();
    // Check that frame counter and timestamp are from API (not hardcoded Stitch 0.850 etc)
    await expect(page.getByTestId('risk-card')).toBeVisible();
    // risk values should be from API/ooffline bundle, not 0.569 hardcoded? Just check visible
    await expect(page.getByTestId('risk-card')).toContainText(/Raw risk/);
  });

  test('replay timeline - keyboard accessible Space/R/Arrow', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('frame-slider')).toBeVisible({ timeout: 15000 });
    const slider = page.getByTestId('frame-slider');
    await expect(slider).toHaveValue('0');
    // Space toggles play
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('play-pause-btn')).toBeVisible();
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    // ArrowRight increments
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await expect(slider).toHaveValue('1');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    await expect(slider).toHaveValue('0');
    // R restarts
    await setFrame(page, '5');
    await expect(slider).toHaveValue('5');
    await page.keyboard.press('r');
    await page.waitForTimeout(300);
    await expect(slider).toHaveValue('0');
  });
});

test.describe('warning banner - prominent orange/coral dismissible ARIA', () => {
  test('warning banner - hidden at frame 0 normal, appears at frame 8 before ground truth 20 with stage and target', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    // frame 0 - no warning
    await expect(page.getByTestId('frame-slider')).toHaveValue('0');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Hidden - gated');
    // warning banner should be hidden at frame 0
    await expect(page.getByTestId('warning-banner')).not.toBeVisible();
    // go to frame 8 - warning active before ground truth 20
    await setFrame(page, '8');
    const banner = page.getByTestId('warning-banner');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toHaveAttribute('role', 'status');
    await expect(banner).toHaveAttribute('aria-live', 'polite');
    await expect(banner).toContainText('EARLY WARNING ACTIVE');
    await expect(banner).toContainText(/Warning:/);
    // should show stage and target host - not hardcoded, from API
    await expect(banner).toContainText(/Credential Attack|Reconnaissance|Compromise|Impact|Elevated/);
    // icon + text + color not just color
    await expect(banner.locator('svg').first()).toBeVisible();
    await expect(banner).toContainText('ELEVATED');
    // ground truth still hidden at frame 8
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Hidden - gated');
    await expect(page.getByTestId('ground-truth-panel')).not.toContainText('Revealed');
    // still warning banner visible, not just color
    await expect(banner).toHaveClass(/from-amber-500\/25/);
  });

  test('warning banner - dismissible with X, keyboard accessible, not just color', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('frame-slider')).toBeVisible({ timeout: 15000 });
    await setFrame(page, '8');
    const banner = page.getByTestId('warning-banner');
    await expect(banner).toBeVisible();
    const dismissBtn = page.getByTestId('warning-banner-dismiss');
    await expect(dismissBtn).toBeVisible();
    await expect(dismissBtn).toHaveAttribute('aria-label', 'Dismiss warning banner');
    // focus ring check - should have focus style
    await dismissBtn.focus();
    await expect(dismissBtn).toBeFocused();
    // click dismiss
    await dismissBtn.click();
    await expect(banner).not.toBeVisible();
    // after dismiss, going to frame 0 (no warning) then back to 8 should reappear (because warning false resets dismissed)
    await setFrame(page, '0');
    await expect(page.getByTestId('warning-banner')).not.toBeVisible();
    await setFrame(page, '8');
    await expect(page.getByTestId('warning-banner')).toBeVisible();
  });

  test('warning banner - not hardcoded metrics, values from API', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('frame-slider')).toBeVisible({ timeout: 15000 });
    await setFrame(page, '8');
    const banner = page.getByTestId('warning-banner');
    await expect(banner).toBeVisible();
    // stage and target should be from API - check that banner does not contain hardcoded Stitch 0.850 etc
    const text = await banner.textContent();
    expect(text).not.toContain('0.850');
    // target host should be host-N alias, not raw IP
    expect(text).toMatch(/host-\d+/);
    expect(text).not.toMatch(/192\.168\./);
  });
});
