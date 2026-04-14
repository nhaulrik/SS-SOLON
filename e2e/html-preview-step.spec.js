/**
 * E2E tests for HtmlPreviewStep iframe scaling — UC-PS-01 through UC-PS-04
 *
 * The preview step must scale the 1280×720 slide to fit its container,
 * matching the behaviour of the upload-step preview panel.
 *
 * UC-PS-01  Preview frame is visible on the preview step
 * UC-PS-02  Preview frame fills its wrapper (no whitespace gap)
 * UC-PS-03  Slide shell is scaled to fit the iframe bounds (scale < 1)
 * UC-PS-04  Slide shell is anchored to the top-left of the iframe
 */

import { test, expect, SEL, doHtmlApplyContent } from './fixtures.js';

// ── UC-PS-01: Frame is visible ────────────────────────────────────────────────

test.describe('UC-PS-01 — Preview frame is visible on the preview step', () => {
  test('preview iframe is present after applying content', async ({ page }) => {
    await doHtmlApplyContent(page);
    await expect(page.locator(SEL.htmlPreviewStepFrame)).toBeVisible();
  });

  test('preview frame wrapper is visible', async ({ page }) => {
    await doHtmlApplyContent(page);
    await expect(page.locator(SEL.htmlPreviewStepFrameWrap)).toBeVisible();
  });
});

// ── UC-PS-02: Frame fills its wrapper ────────────────────────────────────────

test.describe('UC-PS-02 — Preview frame fills its wrapper', () => {
  test('iframe height matches wrapper height (no whitespace gap)', async ({ page }) => {
    await doHtmlApplyContent(page);
    const wBox = await page.locator(SEL.htmlPreviewStepFrameWrap).boundingBox();
    const iBox = await page.locator(SEL.htmlPreviewStepFrame).boundingBox();
    expect(wBox).not.toBeNull();
    expect(iBox).not.toBeNull();
    expect(Math.abs(iBox.height - wBox.height)).toBeLessThanOrEqual(8);
    expect(Math.abs(iBox.width  - wBox.width )).toBeLessThanOrEqual(8);
  });
});

// ── UC-PS-03: Slide shell is scaled to fit ────────────────────────────────────

test.describe('UC-PS-03 — Slide shell is scaled to fit the iframe bounds', () => {
  test('solon-slide-shell has a CSS transform scale applied (scale < 1)', async ({ page }) => {
    await doHtmlApplyContent(page);
    const shell = page.frameLocator(SEL.htmlPreviewStepFrame).locator('#solon-slide-shell');

    let scale;
    await expect(async () => {
      const matrix = await shell.evaluate(el => window.getComputedStyle(el).transform);
      expect(matrix).not.toBe('none');
      const m = matrix.match(/matrix\(([^,]+)/);
      expect(m).not.toBeNull();
      scale = parseFloat(m[1]);
      expect(scale).toBeLessThan(1);
    }).toPass({ timeout: 5000 });

    expect(scale).toBeGreaterThan(0);
    const iBox = await page.locator(SEL.htmlPreviewStepFrame).boundingBox();
    expect(1280 * scale).toBeLessThanOrEqual(iBox.width  + 4);
    expect(720  * scale).toBeLessThanOrEqual(iBox.height + 4);
  });
});

// ── UC-PS-04: Shell anchored to top-left ─────────────────────────────────────

test.describe('UC-PS-04 — Slide shell is anchored to top-left of the iframe', () => {
  test('shell top-left matches iframe top-left (within 4px)', async ({ page }) => {
    await doHtmlApplyContent(page);
    const iBox  = await page.locator(SEL.htmlPreviewStepFrame).boundingBox();
    const shell = page.frameLocator(SEL.htmlPreviewStepFrame).locator('#solon-slide-shell');
    const sBox  = await shell.boundingBox();
    expect(sBox).not.toBeNull();
    expect(Math.abs(sBox.x - iBox.x)).toBeLessThanOrEqual(4);
    expect(Math.abs(sBox.y - iBox.y)).toBeLessThanOrEqual(4);
  });
});
