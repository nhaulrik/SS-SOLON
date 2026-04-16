/**
 * E2E tests for Carousel Preview Sizing
 *
 * Ensures that the carousel preview canvas displays at the correct size
 * and doesn't expand unexpectedly.
 */

import { test, expect, SEL, doHtmlApplyMultiSlide } from './fixtures.js';

test.describe('Carousel Preview Sizing', () => {
  test('carousel container has constrained height', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();

    const carouselPanel = page.locator('.metadata-assignment-carousel-panel');
    const panelBox = await carouselPanel.boundingBox();

    // Carousel panel should have a reasonable height (max 200px + padding)
    expect(panelBox.height).toBeLessThanOrEqual(240); // 200px + padding
    expect(panelBox.height).toBeGreaterThan(100); // Should not be too small
  });

  test('carousel items maintain 16:9 aspect ratio', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();

    const carouselItem = page.locator('.slide-carousel-item').first();
    const itemBox = await carouselItem.boundingBox();

    // 16:9 aspect ratio: height should be width * 9/16
    const expectedHeight = itemBox.width * (9 / 16);
    const tolerance = 5; // Allow 5px tolerance for rounding

    expect(Math.abs(itemBox.height - expectedHeight)).toBeLessThan(tolerance);
  });

  test('carousel preview is smaller than full preview', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    
    // Get the size of the full preview on preview step
    const fullPreviewWrapper = page.locator('.html-preview-step-frame-wrap');
    const fullPreviewBox = await fullPreviewWrapper.boundingBox();

    // Navigate to metadata assignment
    await page.locator('[data-testid="btn-assign-metadata"]').click();

    // Get carousel item size
    const carouselItem = page.locator('.slide-carousel-item').first();
    const carouselBox = await carouselItem.boundingBox();

    // Carousel preview should be much smaller than full preview
    expect(carouselBox.width).toBeLessThan(fullPreviewBox.width / 2);
    expect(carouselBox.height).toBeLessThan(fullPreviewBox.height / 2);
  });

  test('carousel does not overflow its container', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();

    const carouselPanel = page.locator('.metadata-assignment-carousel-panel');
    const carousel = page.locator('.slide-carousel');

    const panelBox = await carouselPanel.boundingBox();
    const carouselBox = await carousel.boundingBox();

    // Carousel height should not exceed panel height
    expect(carouselBox.height).toBeLessThanOrEqual(panelBox.height + 1); // +1 for rounding
  });

  test('carousel scrolls horizontally without vertical overflow', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 10);
    await page.locator('[data-testid="btn-assign-metadata"]').click();

    const carousel = page.locator('.slide-carousel');
    const carouselPanel = page.locator('.metadata-assignment-carousel-panel');

    const carouselBox = await carousel.boundingBox();
    const panelBox = await carouselPanel.boundingBox();

    // Carousel should have horizontal scrollbar but not vertical
    const hasHorizontalScroll = carouselBox.width > panelBox.width;
    expect(hasHorizontalScroll).toBe(true);

    // Height should still be constrained
    expect(carouselBox.height).toBeLessThanOrEqual(panelBox.height + 1);
  });

  test('carousel items are properly sized at different breakpoints', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();

    const carouselItem = page.locator('.slide-carousel-item').first();
    const itemBox = await carouselItem.boundingBox();

    // At default viewport (1280px), items should be 200px wide
    expect(itemBox.width).toBeLessThanOrEqual(210); // 200px + border
    expect(itemBox.width).toBeGreaterThanOrEqual(190);

    // Verify 16:9 aspect ratio is maintained
    const expectedHeight = itemBox.width * (9 / 16);
    expect(Math.abs(itemBox.height - expectedHeight)).toBeLessThan(5);
  });

  test('carousel preview canvas is scaled correctly for viewing', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();

    // The carousel should display thumbnails at a readable size
    // not at full 1280x720 scale
    const carouselItem = page.locator('.slide-carousel-item').first();
    const itemBox = await carouselItem.boundingBox();

    // Item width should be much less than original 1280px slide width
    // We expect approximately 200px (0.15625 scale of 1280px)
    expect(itemBox.width).toBeLessThan(300);
    expect(itemBox.width).toBeGreaterThan(150);
  });

  test('metadata table takes remaining space after carousel', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();

    const layout = page.locator('.metadata-assignment-step-layout');
    const carouselPanel = page.locator('.metadata-assignment-carousel-panel');
    const tablePanel = page.locator('.metadata-assignment-table-panel');

    const layoutBox = await layout.boundingBox();
    const carouselBox = await carouselPanel.boundingBox();
    const tableBox = await tablePanel.boundingBox();

    // Table should take up most of the remaining space
    const totalHeight = carouselBox.height + tableBox.height;
    expect(totalHeight).toBeGreaterThan(layoutBox.height * 0.8); // At least 80% of layout
  });

  test('carousel maintains height when scrolling', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 10);
    await page.locator('[data-testid="btn-assign-metadata"]').click();

    const carousel = page.locator('.slide-carousel');
    const initialBox = await carousel.boundingBox();
    const initialHeight = initialBox.height;

    // Scroll to the right
    await carousel.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });

    // Wait a bit for any layout recalculation
    await page.waitForTimeout(100);

    const afterScrollBox = await carousel.boundingBox();
    const afterScrollHeight = afterScrollBox.height;

    // Height should remain the same
    expect(Math.abs(initialHeight - afterScrollHeight)).toBeLessThan(2);
  });

  test('carousel preview is visually distinct from metadata table', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();

    const carouselPanel = page.locator('.metadata-assignment-carousel-panel');
    const tablePanel = page.locator('.metadata-assignment-table-panel');

    const carouselBox = await carouselPanel.boundingBox();
    const tableBox = await tablePanel.boundingBox();

    // Carousel should be above table
    expect(carouselBox.y).toBeLessThan(tableBox.y);

    // They should not overlap
    expect(carouselBox.y + carouselBox.height).toBeLessThanOrEqual(tableBox.y + 1); // +1 for rounding
  });
});
