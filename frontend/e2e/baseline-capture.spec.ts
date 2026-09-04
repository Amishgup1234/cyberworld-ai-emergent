import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Baseline screenshots for Phase 10 - 4 states captured at default viewport
// Captures offline_bundle deterministic replay: frame 0 normal, frame 8 warning, frame 20 ground truth, simulation isolated
// Stored in design/screenshots/baseline/ and output/screenshots/baseline/ (both)

test.describe('Phase 10 baseline screenshots', () => {
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
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        }, val);
        await page.waitForTimeout(300);
        break;
      }
      current = newInt;
      attempts++;
    }
    await expect(slider).toHaveValue(val, { timeout: 5000 });
    await page.waitForTimeout(400);
  }

  test('capture four baseline states - normal 0, warning 8, ground truth 20, simulation isolated', async ({ page }) => {
    // Use deterministic viewport for baseline - default is fine but ensure consistent 1280x720 style
    // Not required for Phase 10 gates but capture fullPage for evidence
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('brand-title')).toContainText('CYBERWORLD AI');
    await expect(page.getByTestId('mode-banner')).toBeVisible();
    await expect(page.getByTestId('risk-card')).toBeVisible();

    // Ensure directories exist for screenshots via fs - relative to frontend root
    const designDir = path.resolve(process.cwd(), '..', 'design', 'screenshots', 'baseline');
    const outputDir = path.resolve(process.cwd(), '..', 'output', 'screenshots', 'baseline');
    fs.mkdirSync(designDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // 1 - normal frame 0
    await setFrame(page, '0');
    await expect(page.getByTestId('stage-panel')).toContainText('Normal');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Hidden - gated');
    // capture
    const normalDesign = path.join(designDir, 'normal-frame-0.png');
    const normalOutput = path.join(outputDir, 'normal-frame-0.png');
    await page.screenshot({ path: normalDesign, fullPage: true });
    // copy to output as well
    fs.copyFileSync(normalDesign, normalOutput);
    console.log(`captured normal-frame-0.png -> ${normalDesign} and ${normalOutput}`);

    // 2 - warning frame 8 (smoothed >0.45 and slope>0 before ground truth 20)
    await setFrame(page, '8');
    await expect(page.getByTestId('risk-card')).toContainText('Warning');
    await expect(page.getByTestId('risk-card')).toContainText('Early warning active');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Hidden - gated');
    await expect(page.getByTestId('stage-panel')).toContainText(/Reconnaissance|Credential Attack|Compromise|Impact/);
    const warningDesign = path.join(designDir, 'warning-frame-8.png');
    const warningOutput = path.join(outputDir, 'warning-frame-8.png');
    await page.screenshot({ path: warningDesign, fullPage: true });
    fs.copyFileSync(warningDesign, warningOutput);
    console.log(`captured warning-frame-8.png`);

    // 3 - ground truth frame 20 (revealed)
    await setFrame(page, '20');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Revealed');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Infiltration');
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Label distribution');
    const gtDesign = path.join(designDir, 'ground-truth-frame-20.png');
    const gtOutput = path.join(outputDir, 'ground-truth-frame-20.png');
    await page.screenshot({ path: gtDesign, fullPage: true });
    fs.copyFileSync(gtDesign, gtOutput);
    console.log(`captured ground-truth-frame-20.png`);

    // 4 - simulation with host isolated (at current frame 20 or go back to 8 for more visible warning context - use 8 per spec suggestion)
    // Spec says simulation with host isolated - after Simulate click, before/after comparison, muted edges
    // WorkspaceTabs: simulation-panel is inside tab-simulation, need to activate tab first (Phase 13)
    await setFrame(page, '8');
    await page.getByRole('tab', { name: 'What-if Isolation' }).click();
    await expect(page.getByTestId('tab-simulation')).toBeVisible();
    await expect(page.getByTestId('simulation-panel')).toBeVisible();
    const hostSelect = page.getByTestId('host-select');
    await expect(hostSelect).toBeVisible();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="host-select"]') as HTMLSelectElement | null;
      return el && el.options.length > 1;
    }, { timeout: 5000 });
    const val = await hostSelect.inputValue();
    if (!val) {
      await hostSelect.selectOption({ index: 1 });
    }
    await expect(hostSelect).not.toHaveValue('');
    await page.getByTestId('simulate-btn').click();
    await expect(page.getByTestId('simulation-comparison')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('simulation-label')).toContainText('Estimated simulated effect - not causal proof');
    await expect(page.getByTestId('simulation-deltas')).toContainText('Risk reduction');
    // capture simulation state - ensure comparison visible and contrasts with earlier warning state
    const simDesign = path.join(designDir, 'simulation-isolated.png');
    const simOutput = path.join(outputDir, 'simulation-isolated.png');
    await page.screenshot({ path: simDesign, fullPage: true });
    fs.copyFileSync(simDesign, simOutput);
    console.log(`captured simulation-isolated.png`);

    // verify all 4 exist
    for (const p of [normalDesign, warningDesign, gtDesign, simDesign]) {
      expect(fs.existsSync(p)).toBeTruthy();
      const stat = fs.statSync(p);
      expect(stat.size).toBeGreaterThan(10000);
    }
    for (const p of [normalOutput, warningOutput, gtOutput, simOutput]) {
      expect(fs.existsSync(p)).toBeTruthy();
    }
  });
});
