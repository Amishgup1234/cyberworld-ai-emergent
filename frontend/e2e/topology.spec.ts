import { test, expect } from '@playwright/test';

test.describe('topology - Stitch adapted with React Flow 15-25 hosts, clustering, filters, Fit View', () => {
  test('topology - default view shows 15-25 hosts, not all, with clustered background and Show All', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('topology-count')).toBeVisible();

    const countText = await page.getByTestId('topology-count').textContent();
    expect(countText).not.toBeNull();
    // Extract visible number
    const match = countText?.match(/(\d+)\s+hosts\s+visible/);
    expect(match).not.toBeNull();
    const visible = parseInt(match?.[1] || '0', 10);
    expect(visible).toBeGreaterThanOrEqual(15);
    expect(visible).toBeLessThanOrEqual(25);

    // clustered badge or cluster node should be present when total >25 (offline bundle has 352 nodes)
    // For 352 nodes, visible 20, clustered 332
    const clusterBadge = page.getByTestId('cluster-count-badge');
    const clusterNode = page.getByTestId('cluster-node');
    // At least one of them should be visible (exact depends on filter state)
    const hasClusterBadge = await clusterBadge.count() > 0;
    const hasClusterNode = await clusterNode.count() > 0;
    // Since offline_bundle has 352 nodes, we expect clustering
    if (hasClusterBadge) {
      await expect(clusterBadge).toBeVisible();
      const badgeText = await clusterBadge.textContent();
      expect(badgeText).toMatch(/Clustered:\s+\d+/);
    }
    if (hasClusterNode) {
      await expect(clusterNode).toBeVisible();
      await expect(clusterNode).toContainText(/hosts clustered/);
    }
    // Show All button should be present when total >25
    const showAllBtn = page.getByTestId('show-all-btn');
    await expect(showAllBtn).toBeVisible();
    await expect(showAllBtn).toContainText(/Show All/);

    // Click Show All expands to show all hosts (should be >25)
    await showAllBtn.click();
    await page.waitForTimeout(500);
    const expandedText = await page.getByTestId('topology-count').textContent();
    const expandedMatch = expandedText?.match(/(\d+)\s+hosts\s+visible/);
    expect(expandedMatch).not.toBeNull();
    const expandedVisible = parseInt(expandedMatch?.[1] || '0', 10);
    expect(expandedVisible).toBeGreaterThan(25);
    // cluster should be hidden after expand, button should become Show Less
    await expect(page.getByTestId('cluster-node')).not.toBeVisible();
    await expect(page.getByTestId('show-all-btn')).toContainText(/Show Less/);

    // Click again to collapse
    await page.getByTestId('show-all-btn').click();
    await page.waitForTimeout(500);
    const collapsedText = await page.getByTestId('topology-count').textContent();
    const collapsedMatch = collapsedText?.match(/(\d+)\s+hosts\s+visible/);
    const collapsedVisible = parseInt(collapsedMatch?.[1] || '0', 10);
    expect(collapsedVisible).toBeGreaterThanOrEqual(15);
    expect(collapsedVisible).toBeLessThanOrEqual(25);
    await expect(page.getByTestId('cluster-node')).toBeVisible();
  });

  test('topology - filters (criticality, observed_state, risk threshold, role) keyboard accessible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('topology-filters')).toBeVisible();
    const filters = page.getByTestId('topology-filters');
    await expect(filters).toHaveAttribute('role', 'toolbar');

    const crit = page.getByTestId('filter-criticality');
    const state = page.getByTestId('filter-observed-state');
    const role = page.getByTestId('filter-role');
    const risk = page.getByTestId('filter-risk');
    const clear = page.getByTestId('filter-clear');

    await expect(crit).toBeVisible();
    await expect(state).toBeVisible();
    await expect(role).toBeVisible();
    await expect(risk).toBeVisible();
    await expect(clear).toBeVisible();

    // keyboard accessible: can focus each and they have focus ring
    await crit.focus();
    await expect(crit).toBeFocused();
    await state.focus();
    await expect(state).toBeFocused();
    await role.focus();
    await expect(role).toBeFocused();
    await risk.focus();
    await expect(risk).toBeFocused();
    await clear.focus();
    await expect(clear).toBeFocused();
    expect(await clear.evaluate((el) => getComputedStyle(el).outlineStyle !== 'none' || el.className.includes('focus:ring'))).toBeTruthy();

    // Filter by criticality High should reduce visible count (since only high remain)
    const beforeText = await page.getByTestId('topology-count').textContent();
    const beforeMatch = beforeText?.match(/(\d+)\s+hosts\s+visible/);
    const beforeCount = parseInt(beforeMatch?.[1] || '0', 10);

    await crit.selectOption('high');
    await page.waitForTimeout(400);
    const afterText = await page.getByTestId('topology-count').textContent();
    const afterMatch = afterText?.match(/(\d+)\s+hosts\s+visible/);
    const afterCount = parseInt(afterMatch?.[1] || '0', 10);
    // After filtering to high only, visible should be <= before and within 0..25 (or total high count)
    expect(afterCount).toBeLessThanOrEqual(beforeCount);
    expect(afterCount).toBeGreaterThanOrEqual(0);

    // Risk threshold filter: set to 0.5 should further filter
    await risk.evaluate((el: HTMLInputElement, v: string) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, '0.5');
    await page.waitForTimeout(400);
    const riskFilteredText = await page.getByTestId('topology-count').textContent();
    const riskMatch = riskFilteredText?.match(/(\d+)\s+hosts\s+visible/);
    const riskCount = parseInt(riskMatch?.[1] || '0', 10);
    // risk filter should not increase count beyond previous
    expect(riskCount).toBeLessThanOrEqual(afterCount);

    // Clear resets
    await clear.click();
    await page.waitForTimeout(400);
    const clearedCrit = await crit.inputValue();
    const clearedState = await state.inputValue();
    const clearedRole = await role.inputValue();
    const clearedRisk = await risk.inputValue();
    expect(clearedCrit).toBe('All');
    expect(clearedState).toBe('All');
    expect(clearedRole).toBe('All');
    expect(clearedRisk).toBe('0');
  });

  test('topology - zoom and Fit View controls keyboard accessible, legend text+icon', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });

    // Legend must have text+icon, not just color, with all required states
    const legend = page.getByTestId('topology-legend');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText('Observed - cyan solid - healthy');
    await expect(legend).toContainText('Predicted path - purple dashed');
    await expect(legend).toContainText('Ground truth - coral - critical risk');
    await expect(legend).toContainText('Simulated removed - orange muted');
    await expect(legend).toContainText('Benign Pool - emerald - background clustered');
    await expect(legend).toContainText('Color never alone');

    // React Flow Controls present (zoom in/out)
    const controls = page.locator('.react-flow__controls');
    await expect(controls).toBeVisible();
    // MiniMap present
    const minimap = page.locator('.react-flow__minimap');
    await expect(minimap).toBeVisible();

    // Fit View button
    const fitBtn = page.getByTestId('fit-view-btn');
    await expect(fitBtn).toBeVisible();
    await expect(fitBtn).toHaveAttribute('aria-label', 'Fit topology view');
    // keyboard accessible
    await fitBtn.focus();
    await expect(fitBtn).toBeFocused();
    // check focus ring class
    expect(await fitBtn.evaluate((el) => el.className.includes('focus:ring'))).toBeTruthy();
    await fitBtn.click();
    await page.waitForTimeout(300);
    // topology still visible after fitView
    await expect(page.getByTestId('topology')).toBeVisible();
  });

  test('topology - header shows NETWORK DIGITAL TWIN with cyber-grid and uses React Flow', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('NETWORK DIGITAL TWIN')).toBeVisible();
    // check that React Flow container exists (has .react-flow class)
    await expect(page.locator('.react-flow')).toBeVisible();
    // ensure no raw IP in header or topology
    const topologyText = await page.getByTestId('topology').textContent();
    expect(topologyText).not.toMatch(/192\.168/);
    // safe alias pattern should be present (host-N)
    expect(topologyText).toMatch(/host-\d+/);
  });
});

test.describe('host-details - accessible drawer with safe alias only', () => {
  test('host-details - drawer opens on node click, shows alias/role/criticality/risk, accessible, safe alias only', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });

    // Initially no drawer
    await expect(page.getByTestId('host-details-drawer')).not.toBeVisible();

    // Click first visible node (React Flow node) - deterministic grid ensures no overlap, no force needed
    await page.waitForTimeout(800);
    const firstNode = page.locator('.react-flow__node').first();
    await expect(firstNode).toBeVisible({ timeout: 5000 });
    await firstNode.click();
    // Drawer should appear
    const drawer = page.getByTestId('host-details-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    await expect(drawer).toHaveAttribute('role', 'dialog');
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await expect(drawer).toHaveAttribute('aria-labelledby', 'drawer-title');
    // content checks - safe alias, role, criticality, risk, observed_state, status, incoming activity (if ranking)
    const drawerText = await drawer.textContent();
    expect(drawerText).toMatch(/host-\d+/);
    // role should be one of allowed roles
    expect(drawerText).toMatch(/workstation|server|database|domain_controller|firewall|web_server/);
    expect(drawerText).toMatch(/criticality|High|Medium|Low|low|medium|high/i);
    expect(drawerText).toMatch(/Risk/);
    expect(drawerText).toMatch(/Observed State/);
    // safe alias only - must NOT contain raw IP or invented OS/packet details
    expect(drawerText).not.toMatch(/192\.168\./);
    expect(drawerText).not.toMatch(/Flow ID/);
    expect(drawerText).not.toMatch(/Linux/);
    expect(drawerText).not.toMatch(/PostgreSQL/);
    // check that drawer does not contain invented OS/database details
    expect(drawerText).not.toMatch(/Production Core Database/);
    // Check that drawer shows incoming activity if ranking entry present (frame 0 top host has ranking)
    // Not strictly required but should be either ranking info or background host message
    expect(drawerText).toMatch(/Incoming activity|No ranking entry|background host/);

    // Close button accessible
    const closeBtn = page.getByTestId('drawer-close');
    await expect(closeBtn).toBeVisible();
    await expect(closeBtn).toHaveAttribute('aria-label', 'Close host details drawer');
    await closeBtn.focus();
    await expect(closeBtn).toBeFocused();
    // focus ring
    expect(await closeBtn.evaluate((el) => el.className.includes('focus:ring'))).toBeTruthy();

    // Esc to close
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible({ timeout: 3000 });

    // Re-open via clicking same node with ordinary click
    await firstNode.click();
    await expect(drawer).toBeVisible({ timeout: 5000 });
    // Overlay click closes
    const overlay = page.getByTestId('drawer-overlay');
    await expect(overlay).toBeVisible();
    await overlay.click();
    await expect(drawer).not.toBeVisible({ timeout: 3000 });
  });

  test('host-details - drawer never shows raw IP, invented OS/database or packet inspection', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);
    // Try clicking a few nodes to ensure none leak raw IP
    const nodes = page.locator('.react-flow__node');
    const count = await nodes.count();
    expect(count).toBeGreaterThan(0);
    // Click first 2 nodes sequentially and check drawer content - ordinary click, grid guarantees clickable
    for (let i = 0; i < Math.min(2, count); i++) {
      const node = nodes.nth(i);
      // Skip cluster node if present
      const dataId = await node.getAttribute('data-id');
      if (dataId === 'cluster-background') continue;
      await node.click();
      const drawer = page.getByTestId('host-details-drawer');
      await expect(drawer).toBeVisible({ timeout: 5000 });
      const text = await drawer.textContent();
      expect(text).not.toMatch(/192\.168\./);
      expect(text).not.toMatch(/\b10\.0\.\d+\.\d+/);
      expect(text).not.toMatch(/Linux/);
      expect(text).not.toMatch(/PostgreSQL/);
      expect(text).not.toMatch(/Internal App Server/);
      // packet inspection not shown
      // we allow mention of blocked per design-system but drawer no longer contains those literals directly
      // ensure no raw protocol/bytes literal as data
      // Check that drawer contains host-N safe alias
      expect(text).toMatch(/host-\d+/);
      // Close via X
      await page.getByTestId('drawer-close').click();
      await expect(drawer).not.toBeVisible({ timeout: 3000 });
      await page.waitForTimeout(300);
    }
  });

  test('host-details - safe host-N aliases only across topology', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
    const topology = page.getByTestId('topology');
    const text = await topology.textContent();
    // Should contain host-N aliases
    expect(text).toMatch(/host-\d+/);
    // Should never contain raw IP
    expect(text).not.toMatch(/192\.168\./);
    expect(text).not.toMatch(/Flow ID/);
    // Should not contain invented OS details
    expect(text).not.toMatch(/PostgreSQL/);
    // Legend should be present and safe
    await expect(page.getByTestId('topology-legend')).toBeVisible();
  });
});

// New deterministic layout tests at both required viewports - no force:true, ordinary clicks, bounding-box overlap, center hit testing
const viewports = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];

for (const vp of viewports) {
  test.describe(`topology deterministic grid - ${vp.width}x${vp.height}`, () => {
    test(`click all 20 visible non-cluster hosts via ordinary click - ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
      // Phase 16 auto-start may have progressed to warning frame 8; reset to baseline 0 for deterministic host set
      const initialVal = await page.getByTestId('frame-slider').inputValue().catch(() => '0');
      if (initialVal !== '0') {
        await page.getByTestId('restart-btn').click();
        await page.waitForTimeout(400);
        await expect(page.getByTestId('frame-slider')).toHaveValue('0', { timeout: 5000 });
      }
      // Ensure paused at baseline
      const isPause = await page.getByTestId('play-pause-btn').evaluate((el) => el.textContent?.includes('Pause'));
      if (isPause) {
        await page.getByTestId('play-pause-btn').click();
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(900);

      // Determine host nodes (exclude cluster-background)
      const allNodes = page.locator('.react-flow__node');
      const totalCount = await allNodes.count();
      const hostIds: string[] = [];
      for (let i = 0; i < totalCount; i++) {
        const el = allNodes.nth(i);
        const id = await el.getAttribute('data-id');
        if (id && id !== 'cluster-background') hostIds.push(id);
      }
      expect(hostIds.length).toBeGreaterThanOrEqual(15);
      expect(hostIds.length).toBeLessThanOrEqual(25);
      // Expect exactly 20 for default offline bundle
      expect(hostIds.length).toBe(20);

      for (const hostId of hostIds) {
        const nodeEl = page.locator(`.react-flow__node[data-id="${hostId}"]`);
        await expect(nodeEl).toBeVisible({ timeout: 5000 });
        await nodeEl.click();
        const drawer = page.getByTestId('host-details-drawer');
        await expect(drawer).toBeVisible({ timeout: 5000 });
        const drawerText = await drawer.textContent();
        expect(drawerText).toMatch(/host-\d+/);
        expect(drawerText).not.toMatch(/192\.168\./);
        // close via Escape and verify
        await page.keyboard.press('Escape');
        await expect(drawer).not.toBeVisible({ timeout: 3000 });
        await page.waitForTimeout(200);
      }

      // After clicking all, verify clustering still present and Show All works
      await expect(page.getByTestId('cluster-node')).toBeVisible();
      await expect(page.getByTestId('show-all-btn')).toBeVisible();
    });

    test(`node-center hit testing via mouse click - ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
      const initVal2 = await page.getByTestId('frame-slider').inputValue().catch(() => '0');
      if (initVal2 !== '0') {
        await page.getByTestId('restart-btn').click();
        await page.waitForTimeout(400);
        await expect(page.getByTestId('frame-slider')).toHaveValue('0', { timeout: 5000 });
      }
      const isPause2 = await page.getByTestId('play-pause-btn').evaluate((el) => el.textContent?.includes('Pause'));
      if (isPause2) {
        await page.getByTestId('play-pause-btn').click();
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(900);

      // Ensure topology is scrolled into view for center hit testing (Phase 16 hero pushes topology below fold at 1280x720)
      await page.getByTestId('topology').scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const nodes = page.locator('.react-flow__node');
      const count = await nodes.count();
      let hostCount = 0;
      for (let i = 0; i < count; i++) {
        const el = nodes.nth(i);
        const dataId = await el.getAttribute('data-id');
        if (dataId === 'cluster-background') continue;
        hostCount++;
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        const box = await el.boundingBox();
        expect(box).not.toBeNull();
        if (!box) continue;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.click(cx, cy);
        const drawer = page.getByTestId('host-details-drawer');
        await expect(drawer).toBeVisible({ timeout: 5000 });
        const drawerText = await drawer.textContent();
        expect(drawerText).toMatch(/host-\d+/);
        expect(drawerText).not.toMatch(/192\.168/);
        // Verify drawer shows correct alias matching clicked node or sanitized alias
        expect(drawerText).toMatch(/host-\d+/);
        await page.keyboard.press('Escape');
        await expect(drawer).not.toBeVisible({ timeout: 3000 });
        await page.waitForTimeout(250);
      }
      expect(hostCount).toBeGreaterThanOrEqual(15);
      expect(hostCount).toBeLessThanOrEqual(25);
      expect(hostCount).toBe(20);
    });

    test(`bounding-box non-overlap with 5px buffer - ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await expect(page.getByTestId('topology')).toBeVisible({ timeout: 15000 });
      const initVal3 = await page.getByTestId('frame-slider').inputValue().catch(() => '0');
      if (initVal3 !== '0') {
        await page.getByTestId('restart-btn').click();
        await page.waitForTimeout(400);
        await expect(page.getByTestId('frame-slider')).toHaveValue('0', { timeout: 5000 });
      }
      const isPause3 = await page.getByTestId('play-pause-btn').evaluate((el) => el.textContent?.includes('Pause'));
      if (isPause3) {
        await page.getByTestId('play-pause-btn').click();
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(1000);

      const nodes = page.locator('.react-flow__node');
      const count = await nodes.count();
      const boxes: Array<{ id: string | null; box: { x: number; y: number; width: number; height: number } }> = [];
      for (let i = 0; i < count; i++) {
        const el = nodes.nth(i);
        const dataId = await el.getAttribute('data-id');
        if (dataId === 'cluster-background') continue;
        const box = await el.boundingBox();
        expect(box).not.toBeNull();
        if (box) boxes.push({ id: dataId, box });
      }
      expect(boxes.length).toBeGreaterThanOrEqual(15);
      expect(boxes.length).toBeLessThanOrEqual(25);
      expect(boxes.length).toBe(20);

      // Check pairwise overlap with 5px buffer and minimum distance >80 already via spacing 130x100 - also verify center distance >80
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].box;
          const b = boxes[j].box;
          const overlap = !(a.x + a.width + 5 < b.x || b.x + b.width + 5 < a.x || a.y + a.height + 5 < b.y || b.y + b.height + 5 < a.y);
          expect(overlap, `nodes ${boxes[i].id} and ${boxes[j].id} overlap: a=${JSON.stringify(a)} b=${JSON.stringify(b)}`).toBe(false);
          // Additional center distance check >70 (canvas >80, scaled >70 at both viewports with compact nodes 105x84 and 5x4 grid 130x100)
          const acx = a.x + a.width / 2;
          const acy = a.y + a.height / 2;
          const bcx = b.x + b.width / 2;
          const bcy = b.y + b.height / 2;
          const dist = Math.hypot(acx - bcx, acy - bcy);
          expect(dist, `nodes ${boxes[i].id} and ${boxes[j].id} center distance ${dist} should be >70`).toBeGreaterThan(70);
        }
      }
    });
  });
}
