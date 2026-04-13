import { test, expect, SEL, selectSlide } from './fixtures.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCT_CATALOG_PPTX = path.resolve(__dirname, 'fixtures/product_catalog.pptx');

test.describe('Product catalog PPTX - slide parsing and rendering', () => {
  
  test('all slides load without errors', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles(SEL.fileInput, PRODUCT_CATALOG_PPTX);
    await page.waitForSelector('.tag-slides .tag-slide-btn', { timeout: 10000 });
    
    const slideButtons = page.locator('.tag-slide-btn');
    const slideCount = await slideButtons.count();
    console.log(`Found ${slideCount} slides`);
    expect(slideCount).toBeGreaterThan(0);
  });

  test('slide 1 has chart element in server data', async ({ page }) => {
    const pptxBuffer = fs.readFileSync(PRODUCT_CATALOG_PPTX);
    const base64 = pptxBuffer.toString('base64');
    
    const response = await page.request.post('http://localhost:3001/api/upload-pptx', {
      data: { file: base64, fileName: 'product_catalog.pptx' }
    });
    
    const json = await response.json();
    if (!json.slides) throw new Error('No slides in response');
    
    const slide1 = json.slides[0];
    const chartElements = slide1.elements.filter(el => el.type === 'chart');
    
    console.log('Chart elements from server:', chartElements.length);
    if (chartElements.length > 0) {
      console.log('Chart data:', JSON.stringify(chartElements[0].chartData, null, 2));
    }
    
    expect(chartElements.length).toBeGreaterThan(0);
    expect(chartElements[0].chartData).toBeDefined();
  });

  test('slide 1 shows chart in preview', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles(SEL.fileInput, PRODUCT_CATALOG_PPTX);
    await page.waitForSelector('.tag-slides .tag-slide-btn', { timeout: 10000 });
    
    await selectSlide(page, 1);
    await page.waitForTimeout(500);
    
    const slidePreview = page.locator('.slide-preview .slide-preview-canvas');
    const content = await slidePreview.textContent();
    
    const hasChartContent = content.includes('Chart') || content.includes('Category');
    console.log('Preview contains chart content:', hasChartContent);
    console.log('Preview content:', content.substring(0, 300));
    
    expect(hasChartContent).toBe(true);
  });

  test('slide 1 shows expected text content from product catalog', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles(SEL.fileInput, PRODUCT_CATALOG_PPTX);
    await page.waitForSelector('.tag-slides .tag-slide-btn', { timeout: 10000 });
    
    await selectSlide(page, 1);
    await page.waitForTimeout(500);
    
    const slidePreview = page.locator('.slide-preview .slide-preview-canvas');
    const content = await slidePreview.textContent();
    console.log('Slide 1 preview content:', content.substring(0, 200));
    
    expect(content.length).toBeGreaterThan(10);
  });

  test('slide preview aspect ratio is correct (16:9)', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles(SEL.fileInput, PRODUCT_CATALOG_PPTX);
    await page.waitForSelector('.tag-slides .tag-slide-btn', { timeout: 10000 });
    
    await selectSlide(page, 1);
    await page.waitForTimeout(300);
    
    const container = page.locator('.slide-preview .slide-preview-canvas');
    await expect(container).toHaveCSS('aspect-ratio', '16 / 9');
  });

  test('elements span full canvas height', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles(SEL.fileInput, PRODUCT_CATALOG_PPTX);
    await page.waitForSelector('.tag-slides .tag-slide-btn', { timeout: 10000 });
    
    await selectSlide(page, 1);
    await page.waitForTimeout(500);
    
    const slidePreview = page.locator('.slide-preview .slide-preview-canvas');
    const canvasBox = await slidePreview.boundingBox();
    
    const elements = slidePreview.locator('> div');
    const elementCount = await elements.count();
    
    const positions = [];
    for (let i = 0; i < elementCount; i++) {
      const el = elements.nth(i);
      const box = await el.boundingBox();
      if (box) {
        positions.push({
          top: (box.y - canvasBox.y) / canvasBox.height,
          bottom: (box.y - canvasBox.y + box.height) / canvasBox.height
        });
      }
    }
    
    const minTop = Math.min(...positions.map(p => p.top));
    const maxBottom = Math.max(...positions.map(p => p.bottom));
    
    expect(minTop).toBeLessThan(0.1);
    expect(maxBottom).toBeGreaterThan(0.9);
  });
});