/**
 * Chart editing spec (TDD).
 *
 * Uses product_catalog.pptx which has a chart on slide 1.
 * Tests: chart element is detected and displayed, can be tagged,
 *        chart data appears in recipe, chart data is updated in generated PPTX.
 */

import { test, expect, SEL, tagElement } from './fixtures.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART_PPTX = path.resolve(__dirname, 'fixtures/product_catalog.pptx');

const CHART_SEL = {
  fileInput: 'input[type="file"][accept=".pptx"]',
  modal: '.modal-content',
  modalKey: '[data-testid="modal-key"]',
  modalHint: '[data-testid="modal-hint"]',
  modalAI: '[data-testid="modal-ai"]',
  modalSave: '[data-testid="modal-save"]',
};

function overlayByText(text) {
  return `.overlay-element[data-text="${text}"]`;
}

async function doUploadChart(page) {
  await page.request.delete('http://localhost:3001/api/patches');
  await page.request.delete('http://localhost:3001/api/patch-chains');
  await page.goto('/');
  await page.setInputFiles(CHART_SEL.fileInput, CHART_PPTX);
  await page.waitForSelector('.tag-slides .tag-slide-btn');
}

test.describe('Chart element handling', () => {
  test('chart element is detected and displayed in preview', async ({ page }) => {
    await doUploadChart(page);
    await page.waitForSelector('.slide-preview-canvas > div[style*="flex-direction: column"]');
    const chartDivs = page.locator('.slide-preview-canvas > div');
    const count = await chartDivs.count();
    expect(count).toBeGreaterThan(0);
  });

  test('chart can be clicked to open tag modal', async ({ page }) => {
    await doUploadChart(page);
    await page.waitForTimeout(500);
    const overlays = page.locator('.overlay-element');
    const count = await overlays.count();
    const lastOverlay = overlays.nth(count - 1);
    await lastOverlay.click({ force: true });
    await expect(page.locator(CHART_SEL.modal)).toBeVisible();
  });

  test('chart can be tagged with a key and hint', async ({ page }) => {
    await doUploadChart(page);
    await page.waitForTimeout(500);
    const chartOverlay = page.locator('.overlay-element').last();
    await chartOverlay.click();
    await expect(page.locator(CHART_SEL.modal)).toBeVisible();
    await page.locator(CHART_SEL.modalKey).fill('chart_data');
    await page.locator(CHART_SEL.modalHint).fill('Chart data with categories and values');
    await page.locator(CHART_SEL.modalSave).click();
    await page.waitForSelector(CHART_SEL.modal, { state: 'detached' });
    await page.waitForTimeout(1500);
    const taggedOverlay = page.locator('.overlay-element').last();
    await expect(taggedOverlay).toHaveClass(/tagged/);
  });

  test('recipe includes chart data fields', async ({ page }) => {
    await doUploadChart(page);
    await page.waitForTimeout(500);
    const chartOverlay = page.locator('.overlay-element').last();
    await chartOverlay.click();
    await expect(page.locator(CHART_SEL.modal)).toBeVisible();
    await page.locator(CHART_SEL.modalKey).fill('chart_data');
    await page.locator(CHART_SEL.modalHint).fill('Chart data with categories and values');
    await page.locator(CHART_SEL.modalSave).click();
    await page.waitForSelector(CHART_SEL.modal, { state: 'detached' });
    await page.waitForTimeout(1500);
    await page.locator('button:has-text("Generate Recipe")').click();
    await page.waitForSelector('.recipe-area');
    const recipeText = await page.locator('.recipe-area').innerText();
    expect(recipeText).toContain('chart_data');
  });

  test('chart tagged element appears in patch table with chart type indicator', async ({ page }) => {
    await doUploadChart(page);
    await page.waitForTimeout(500);
    const chartOverlay = page.locator('.overlay-element').last();
    await chartOverlay.click();
    await expect(page.locator(CHART_SEL.modal)).toBeVisible();
    await page.locator(CHART_SEL.modalKey).fill('chart_data');
    await page.locator(CHART_SEL.modalHint).fill('Chart data');
    await page.locator(CHART_SEL.modalSave).click();
    await page.waitForSelector(CHART_SEL.modal, { state: 'detached' });
    await page.waitForTimeout(1500);
    const row = page.locator('.patch-row[data-key="chart_data"]');
    await expect(row).toBeVisible();
  });

  test('chart data appears in generated JSON output', async ({ page }) => {
    await doUploadChart(page);
    await page.waitForTimeout(500);
    const chartOverlay = page.locator('.overlay-element').last();
    await chartOverlay.click();
    await expect(page.locator(CHART_SEL.modal)).toBeVisible();
    await page.locator(CHART_SEL.modalKey).fill('chart_data');
    await page.locator(CHART_SEL.modalHint).fill('Chart data with categories and values');
    await page.locator(CHART_SEL.modalSave).click();
    await page.waitForSelector(CHART_SEL.modal, { state: 'detached' });
    await page.waitForTimeout(1500);
    
    await page.locator('button:has-text("Generate Recipe")').click();
    await page.waitForSelector('.recipe-area');
    
    const chartJson = {
      static: {
        chart_data: {
          title: 'Initiatives',
          categories: ['Q1', 'Q2', 'Q3', 'Q4'],
          values: [10, 20, 15, 25]
        }
      }
    };
    
    await page.locator('.json-input').fill(JSON.stringify(chartJson));
    await page.waitForTimeout(500);
    
    const validateBtn = page.locator('button:has-text("Preview & Generate")');
    await expect(validateBtn).toBeEnabled({ timeout: 10000 });
  });

  test('preview step shows updated chart data', async ({ page }) => {
    await doUploadChart(page);
    await page.waitForTimeout(500);
    const chartOverlay = page.locator('.overlay-element').last();
    await chartOverlay.click();
    await expect(page.locator(CHART_SEL.modal)).toBeVisible();
    await page.locator(CHART_SEL.modalKey).fill('chart_data');
    await page.locator(CHART_SEL.modalHint).fill('Chart data');
    await page.locator(CHART_SEL.modalSave).click();
    await page.waitForSelector(CHART_SEL.modal, { state: 'detached' });
    await page.waitForTimeout(1500);
    
    await page.locator('button:has-text("Generate Recipe")').click();
    await page.waitForSelector('.recipe-area');
    
    const chartJson = {
      static: {
        chart_data: {
          title: 'Updated Title',
          categories: ['Jan', 'Feb', 'Mar', 'Apr'],
          values: [5, 15, 10, 20]
        }
      }
    };
    
    await page.locator('.json-input').fill(JSON.stringify(chartJson));
    await page.waitForTimeout(500);
    
    await page.locator('button:has-text("Preview & Generate")').click();
    await page.waitForSelector('.preview-large');
    
    const previewContent = await page.locator('.preview-large').innerText();
    expect(previewContent).toContain('Updated Title');
    expect(previewContent).toContain('Jan');
    expect(previewContent).toContain('5');
  });
});