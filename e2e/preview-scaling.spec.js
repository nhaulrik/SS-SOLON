/**
 * Slide preview scaling spec (TDD).
 *
 * Tests that the preview canvas properly uses actual PPTX slide dimensions
 * for both aspect ratio and element positioning.
 */

import { test, expect, SEL, selectSlide } from './fixtures.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCT_CATALOG_PPTX = path.resolve(__dirname, 'fixtures/product_catalog.pptx');

test.describe('Slide preview scaling', () => {
  test('canvas uses PPTX aspect ratio', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles(SEL.fileInput, PRODUCT_CATALOG_PPTX);
    await page.waitForSelector('.tag-slides .tag-slide-btn', { timeout: 10000 });
    
    await selectSlide(page, 1);
    await page.waitForTimeout(500);
    
    const canvas = page.locator('.slide-preview .slide-preview-canvas');
    const box = await canvas.boundingBox();
    
    // Using PPTX aspect ratio (13.33x7.5 = 1.78)
    const aspectRatio = box.width / box.height;
    console.log('Canvas aspect ratio:', aspectRatio.toFixed(2));
    
    expect(aspectRatio).toBeGreaterThan(1.7);
    expect(aspectRatio).toBeLessThan(1.9);
  });

  test('elements are positioned using max element bounds for normalization', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles(SEL.fileInput, PRODUCT_CATALOG_PPTX);
    await page.waitForSelector('.tag-slides .tag-slide-btn', { timeout: 10000 });
    
    await selectSlide(page, 1);
    await page.waitForTimeout(500);
    
    const canvas = page.locator('.slide-preview .slide-preview-canvas');
    const canvasBox = await canvas.boundingBox();
    
    const elements = canvas.locator('> div');
    const count = await elements.count();
    expect(count).toBeGreaterThan(0);
    
    const positions = [];
    for (let i = 0; i < count; i++) {
      const el = elements.nth(i);
      const box = await el.boundingBox();
      if (box) {
        positions.push({
          leftPct: ((box.x - canvasBox.x) / canvasBox.width) * 100,
          topPct: ((box.y - canvasBox.y) / canvasBox.height) * 100,
          rightPct: ((box.x - canvasBox.x + box.width) / canvasBox.width) * 100,
          bottomPct: ((box.y - canvasBox.y + box.height) / canvasBox.height) * 100
        });
      }
    }
    
    const minLeft = Math.min(...positions.map(p => p.leftPct));
    const maxRight = Math.max(...positions.map(p => p.rightPct));
    const minTop = Math.min(...positions.map(p => p.topPct));
    const maxBottom = Math.max(...positions.map(p => p.bottomPct));
    
    console.log(`Position ranges - X: ${minLeft.toFixed(1)}% to ${maxRight.toFixed(1)}%, Y: ${minTop.toFixed(1)}% to ${maxBottom.toFixed(1)}%`);
    
    // Content fills the canvas (0-100% range)
    expect(maxRight).toBeGreaterThan(80);
    expect(maxBottom).toBeGreaterThan(80);
  });

  test('overlay elements align with preview canvas', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles(SEL.fileInput, PRODUCT_CATALOG_PPTX);
    await page.waitForSelector('.tag-slides .tag-slide-btn', { timeout: 10000 });
    
    await selectSlide(page, 1);
    await page.waitForTimeout(500);
    
    const canvas = page.locator('.slide-preview .slide-preview-canvas');
    const overlay = page.locator('.slide-overlay');
    const inner = page.locator('.slide-preview-inner');
    
    const canvasBox = await canvas.boundingBox();
    const overlayBox = await overlay.boundingBox();
    const innerBox = await inner.boundingBox();
    
    console.log('Canvas:', canvasBox.width.toFixed(0), 'x', canvasBox.height.toFixed(0));
    console.log('Overlay:', overlayBox.width.toFixed(0), 'x', overlayBox.height.toFixed(0));
    console.log('Inner:', innerBox.width.toFixed(0), 'x', innerBox.height.toFixed(0));
    
    // The overlay should match the inner container
    const overlayMatchesInner = 
      Math.abs(overlayBox.width - innerBox.width) < 10 && 
      Math.abs(overlayBox.height - innerBox.height) < 10;
    
    expect(overlayMatchesInner).toBe(true);
  });

  test('chart element is positioned correctly in preview', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles(SEL.fileInput, PRODUCT_CATALOG_PPTX);
    await page.waitForSelector('.tag-slides .tag-slide-btn', { timeout: 10000 });
    
    await selectSlide(page, 1);
    await page.waitForTimeout(500);
    
    const canvas = page.locator('.slide-preview .slide-preview-canvas');
    const canvasBox = await canvas.boundingBox();
    
    const chartDivs = canvas.locator('div').filter({ has: page.locator('text=Category') });
    const chartCount = await chartDivs.count();
    
    if (chartCount > 0) {
      const chartBox = await chartDivs.first().boundingBox();
      const leftPct = ((chartBox.x - canvasBox.x) / canvasBox.width) * 100;
      const topPct = ((chartBox.y - canvasBox.y) / canvasBox.height) * 100;
      
      console.log(`Chart position: ${leftPct.toFixed(1)}%, ${topPct.toFixed(1)}%`);
      
      expect(leftPct).toBeGreaterThan(0);
      expect(topPct).toBeGreaterThan(0);
    }
  });
});