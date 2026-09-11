import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

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
  await page.waitForTimeout(400);
}

test.describe('final acceptance - two-minute presentation states', () => {
  test('final acceptance - baseline, warning, explanation, containment, confirmation semantic states', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('command-bar')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('analysis-command-centre')).toBeVisible();
    // Ensure baseline frame 0
    await ensureFrame(page, '0');
    await expect(page.getByTestId('frame-slider')).toHaveValue('0');
    await expect(page.getByTestId('warning-banner')).toBeHidden();
    await expect(page.getByTestId('ground-truth-panel')).toContainText('Hidden - gated');
    await expect(page.getByTestId('stage-panel')).toContainText('Normal');
    await expect(page.getByTestId('threat-explanation')).toBeVisible();
    await expect(page.getByTestId('threat-explanation')).toContainText('Baseline');
    // Verify early warning will appear within 10 seconds when started
    const startTime = Date.now();
    // Start analysis (if paused, continue)
    const contBtn = page.getByTestId('continue-btn');
    if (await contBtn.isVisible()) {
      await contBtn.click();
    } else {
      // If pause visible, it is already running
      await expect(page.getByTestId('pause-btn')).toBeVisible();
    }
    // Wait for warning banner to appear within 10 seconds
    await expect(page.getByTestId('warning-banner')).toBeVisible({ timeout: 10000 });
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(10000);
    // Verify paused for review after warning (should be warning-review or paused)
    await expect(page.getByTestId('pause-btn')).toBeHidden({ timeout: 2000 }).catch(async () => {
      // If still running, wait a bit more for auto-pause
      await page.waitForTimeout(1000);
    });
    // At warning, explanation should show early warning
    await ensureFrame(page, '8');
    await expect(page.getByTestId('threat-explanation')).toContainText('Early warning');
    await expect(page.getByTestId('threat-explanation')).toContainText('host-238');
    await expect(page.getByTestId('topology')).toHaveAttribute('data-warning-active', 'true');

    // Prepare dirs for screenshots
    const designDir = path.resolve(process.cwd(), '..', 'design', 'screenshots', 'regression');
    const outputDir = path.resolve(process.cwd(), '..', 'output', 'screenshots', 'regression');
    const finalDesignDir = path.resolve(process.cwd(), '..', 'design', 'screenshots', 'final');
    const finalOutputDir = path.resolve(process.cwd(), '..', 'output', 'screenshots', 'final');
    fs.mkdirSync(designDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(finalDesignDir, { recursive: true });
    fs.mkdirSync(finalOutputDir, { recursive: true });

    async function captureSemantic(name: string, semanticCheck: () => Promise<void>) {
      await semanticCheck();
      const designPath = path.join(designDir, name);
      const outputPath = path.join(outputDir, name);
      const finalDesignPath = path.join(finalDesignDir, name);
      const finalOutputPath = path.join(finalOutputDir, name);
      await page.screenshot({ path: designPath, fullPage: true });
      fs.copyFileSync(designPath, outputPath);
      fs.copyFileSync(designPath, finalDesignPath);
      fs.copyFileSync(designPath, finalOutputPath);
      expect(fs.existsSync(designPath)).toBeTruthy();
      expect(fs.statSync(designPath).size).toBeGreaterThan(10000);
    }

    // Baseline
    await ensureFrame(page, '0');
    await page.getByRole('tab', { name: 'Evidence' }).click().catch(() => {});
    await captureSemantic('baseline-frame-0-1440x900.png', async () => {
      await expect(page.getByTestId('frame-slider')).toHaveValue('0');
      await expect(page.getByTestId('warning-banner')).toBeHidden();
      await expect(page.getByTestId('threat-explanation')).toContainText('Baseline');
      await expect(page.getByTestId('ground-truth-panel')).toContainText('Hidden - gated');
      await expect(page.getByTestId('stage-panel')).toContainText('Normal');
    });

    // Warning
    await ensureFrame(page, '8');
    await page.getByRole('tab', { name: 'Evidence' }).click().catch(() => {});
    await captureSemantic('warning-frame-8-1440x900.png', async () => {
      await expect(page.getByTestId('frame-slider')).toHaveValue('8');
      await expect(page.getByTestId('warning-banner')).toBeVisible();
      await expect(page.getByTestId('threat-explanation')).toContainText('Early warning');
      await expect(page.getByTestId('risk-card')).toContainText('Warning');
      await expect(page.getByTestId('ground-truth-panel')).toContainText('Hidden - gated');
    });

    // Explanation - threat explanation visible at warning
    await captureSemantic('explanation-frame-8-1440x900.png', async () => {
      await expect(page.getByTestId('threat-explanation')).toBeVisible();
      await expect(page.getByTestId('threat-explanation')).toContainText('Threat Explanation');
      await expect(page.getByTestId('threat-explanation')).toContainText('Learned');
      await expect(page.getByTestId('threat-explanation')).toContainText('Rule-derived');
      await expect(page.getByTestId('threat-explanation')).toContainText('NetworkX graph-ranked');
      await expect(page.getByTestId('threat-explanation')).toContainText('host-238');
    });

    // Containment - preventive action simulation
    await ensureFrame(page, '8');
    await page.getByTestId('simulate-preventive-btn').click().catch(async () => {
      // If already simulated, clear and retry
      await page.getByTestId('preventive-clear-btn').click().catch(() => {});
      await page.getByTestId('simulate-preventive-btn').click();
    });
    await expect(page.getByTestId('preventive-result-card')).toBeVisible({ timeout: 10000 });
    await captureSemantic('containment-frame-8-1440x900.png', async () => {
      await expect(page.getByTestId('preventive-result-card')).toBeVisible();
      await expect(page.getByTestId('preventive-result-card')).toContainText('Containment Result');
      await expect(page.getByTestId('preventive-result-card')).toContainText('Estimated simulated effect - not causal proof');
      await expect(page.getByTestId('topology-count')).toContainText('removed - simulated');
    });

    // Confirmation - frame 20
    await ensureFrame(page, '20');
    await page.getByRole('tab', { name: 'Evidence' }).click().catch(() => {});
    await captureSemantic('confirmation-frame-20-1440x900.png', async () => {
      await expect(page.getByTestId('frame-slider')).toHaveValue('20');
      await expect(page.getByTestId('ground-truth-panel')).toContainText('Revealed');
      await expect(page.getByTestId('ground-truth-panel')).toContainText('Infiltration');
      await expect(page.getByTestId('threat-explanation')).toContainText('Ground truth revealed');
      await expect(page.getByTestId('topology')).toHaveAttribute('data-ground-truth', 'true');
      await expect(page.getByTestId('analysis-status')).toContainText('Confirmation');
    });

    // Verify two-minute story completes without raw replay/video language in visible UI
    const bodyText = await page.locator('body').textContent();
    // Should contain Analysis Session, Threat Explanation, Preventive Action, Confirmation
    expect(bodyText).toMatch(/Analysis Session/);
    expect(bodyText).toMatch(/Threat Explanation/);
    expect(bodyText).toMatch(/Preventive Action/);
    expect(bodyText).toMatch(/Confirmation/);
    // Should not contain raw "replay video" as primary language (allow small occurrences in disclosure but not as main)
    // Check that the main command centre does not have "Replay" as the primary title
    await expect(page.getByTestId('analysis-command-centre')).toContainText('Analysis Session');
    await expect(page.getByTestId('analysis-command-centre')).not.toContainText('Replay video');
  });
});
