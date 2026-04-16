/**
 * E2E tests for Slide Carousel Component
 *
 * Test coverage:
 * - Carousel rendering and slide display
 * - Click interactions (selecting slides)
 * - Hover interactions (previewing slides)
 * - Keyboard navigation (arrow keys, home, end)
 * - Synchronization with metadata table
 * - Smooth scroll-to-center animation
 * - Responsive behavior on different screen sizes
 * - Accessibility features
 */

import { test, expect, SEL, doHtmlApplyMultiSlide } from './fixtures.js';

test.describe('Carousel Interactions', () => {
  // ── Carousel Rendering ─────────────────────────────────────────────────
  test.describe('Carousel Rendering', () => {
    test('carousel displays all slides as thumbnails', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 5);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      // Should display 5 slide carousel items
      const carouselItems = page.locator('.slide-carousel-item');
      await expect(carouselItems).toHaveCount(5);
    });

    test('carousel shows slide counter', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      // Counter should show current selection
      const counter = page.locator('.slide-carousel-counter');
      await expect(counter).toContainText('1 / 3');
    });

    test('carousel items have slide numbers', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      // Each carousel item should have a number overlay
      const numbers = page.locator('.slide-carousel-number');
      await expect(numbers).toHaveCount(3);
      
      // Check numbers are visible
      for (let i = 0; i < 3; i++) {
        await expect(numbers.nth(i)).toContainText(String(i + 1));
      }
    });

    test('carousel is positioned above metadata table', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carousel = page.locator('.slide-carousel-container');
      const table = page.locator('.metadata-table-wrapper');
      
      // Both should be visible
      await expect(carousel).toBeVisible();
      await expect(table).toBeVisible();
      
      // Carousel should be above table (lower Y coordinate)
      const carouselBox = await carousel.boundingBox();
      const tableBox = await table.boundingBox();
      expect(carouselBox.y).toBeLessThan(tableBox.y);
    });
  });

  // ── Click Interactions ─────────────────────────────────────────────────
  test.describe('Click Interactions', () => {
    test('clicking carousel slide selects it', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      // Click slide 2
      const carouselItems = page.locator('.slide-carousel-item');
      await carouselItems.nth(1).click();

      // Should have selected class
      await expect(carouselItems.nth(1)).toHaveClass(/selected/);
      
      // Counter should update
      const counter = page.locator('.slide-carousel-counter');
      await expect(counter).toContainText('2 / 3');
    });

    test('clicking carousel slide highlights corresponding table row', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      // Click slide 3 in carousel
      const carouselItems = page.locator('.slide-carousel-item');
      await carouselItems.nth(2).click();

      // Table row 3 should be selected
      const tableRows = page.locator('tbody tr');
      await expect(tableRows.nth(2)).toHaveClass(/selected/);
    });

    test('clicking different carousel slides changes selection', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 5);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carouselItems = page.locator('.slide-carousel-item');
      const counter = page.locator('.slide-carousel-counter');

      // Click slide 1
      await carouselItems.nth(0).click();
      await expect(counter).toContainText('1 / 5');
      await expect(carouselItems.nth(0)).toHaveClass(/selected/);

      // Click slide 4
      await carouselItems.nth(3).click();
      await expect(counter).toContainText('4 / 5');
      await expect(carouselItems.nth(3)).toHaveClass(/selected/);

      // Click slide 2
      await carouselItems.nth(1).click();
      await expect(counter).toContainText('2 / 5');
      await expect(carouselItems.nth(1)).toHaveClass(/selected/);
    });
  });

  // ── Hover Interactions ─────────────────────────────────────────────────
  test.describe('Hover Interactions', () => {
    test('hovering carousel slide shows hover state', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carouselItems = page.locator('.slide-carousel-item');
      
      // Hover slide 2
      await carouselItems.nth(1).hover();
      await expect(carouselItems.nth(1)).toHaveClass(/hovered/);
    });

    test('hovering carousel slide updates counter temporarily', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carouselItems = page.locator('.slide-carousel-item');
      const counter = page.locator('.slide-carousel-counter');

      // Initially shows slide 1
      await expect(counter).toContainText('1 / 3');

      // Hover slide 3
      await carouselItems.nth(2).hover();
      await expect(counter).toContainText('3 / 3');

      // Move away from carousel
      await page.locator('.metadata-table').hover();
      // Should revert to selected slide
      await expect(counter).toContainText('1 / 3');
    });

    test('hovering carousel slide highlights corresponding table row', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carouselItems = page.locator('.slide-carousel-item');
      const tableRows = page.locator('tbody tr');

      // Hover slide 2 in carousel
      await carouselItems.nth(1).hover();

      // Table row 2 should show hover state
      await expect(tableRows.nth(1)).toHaveClass(/hovered/);
    });

    test('hovering table row highlights corresponding carousel slide', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carouselItems = page.locator('.slide-carousel-item');
      const tableRows = page.locator('tbody tr');

      // Hover table row 3
      await tableRows.nth(2).hover();

      // Carousel item 3 should show hover state
      await expect(carouselItems.nth(2)).toHaveClass(/hovered/);
    });
  });

  // ── Keyboard Navigation ────────────────────────────────────────────────
  test.describe('Keyboard Navigation', () => {
    test('arrow right key moves to next slide', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 5);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carousel = page.locator('.slide-carousel');
      const counter = page.locator('.slide-carousel-counter');

      // Focus carousel and press arrow right
      await carousel.focus();
      await page.keyboard.press('ArrowRight');

      // Should move to slide 2
      await expect(counter).toContainText('2 / 5');
    });

    test('arrow left key moves to previous slide', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 5);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carousel = page.locator('.slide-carousel');
      const counter = page.locator('.slide-carousel-counter');

      // Click slide 3 first
      await page.locator('.slide-carousel-item').nth(2).click();
      await expect(counter).toContainText('3 / 5');

      // Press arrow left
      await carousel.focus();
      await page.keyboard.press('ArrowLeft');

      // Should move to slide 2
      await expect(counter).toContainText('2 / 5');
    });

    test('home key moves to first slide', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 5);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carousel = page.locator('.slide-carousel');
      const counter = page.locator('.slide-carousel-counter');

      // Click slide 4 first
      await page.locator('.slide-carousel-item').nth(3).click();
      await expect(counter).toContainText('4 / 5');

      // Press Home
      await carousel.focus();
      await page.keyboard.press('Home');

      // Should move to slide 1
      await expect(counter).toContainText('1 / 5');
    });

    test('end key moves to last slide', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 5);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carousel = page.locator('.slide-carousel');
      const counter = page.locator('.slide-carousel-counter');

      // Focus carousel
      await carousel.focus();

      // Press End
      await page.keyboard.press('End');

      // Should move to last slide
      await expect(counter).toContainText('5 / 5');
    });

    test('keyboard navigation prevents boundary overflow', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carousel = page.locator('.slide-carousel');
      const counter = page.locator('.slide-carousel-counter');

      // At first slide, press left arrow
      await carousel.focus();
      await page.keyboard.press('ArrowLeft');

      // Should stay at slide 1
      await expect(counter).toContainText('1 / 3');

      // Navigate to last slide
      await page.keyboard.press('End');
      await expect(counter).toContainText('3 / 3');

      // Press right arrow
      await page.keyboard.press('ArrowRight');

      // Should stay at slide 3
      await expect(counter).toContainText('3 / 3');
    });

    test('enter key selects carousel slide', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carouselItems = page.locator('.slide-carousel-item');
      const counter = page.locator('.slide-carousel-counter');

      // Focus second carousel item
      await carouselItems.nth(1).focus();
      
      // Press Enter
      await page.keyboard.press('Enter');

      // Should select slide 2
      await expect(counter).toContainText('2 / 3');
      await expect(carouselItems.nth(1)).toHaveClass(/selected/);
    });
  });

  // ── Scroll Behavior ────────────────────────────────────────────────────
  test.describe('Scroll Behavior', () => {
    test('carousel scrolls to center selected slide', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 10);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carousel = page.locator('.slide-carousel');

      // Click slide 8 (far right)
      await page.locator('.slide-carousel-item').nth(7).click();

      // Carousel should have scrolled
      const scrollLeft = await carousel.evaluate(el => el.scrollLeft);
      expect(scrollLeft).toBeGreaterThan(0);
    });

    test('carousel smooth scrolls when selection changes', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 10);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carousel = page.locator('.slide-carousel');

      // Get initial scroll position
      const initialScroll = await carousel.evaluate(el => el.scrollLeft);

      // Click slide 5
      await page.locator('.slide-carousel-item').nth(4).click();

      // Wait a bit for smooth scroll
      await page.waitForTimeout(400);

      // Scroll position should have changed
      const newScroll = await carousel.evaluate(el => el.scrollLeft);
      expect(newScroll).not.toEqual(initialScroll);
    });
  });

  // ── Synchronization with Table ─────────────────────────────────────────
  test.describe('Carousel-Table Synchronization', () => {
    test('clicking table row selects corresponding carousel slide', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carouselItems = page.locator('.slide-carousel-item');
      const tableRows = page.locator('tbody tr');

      // Click table row 2
      await tableRows.nth(1).click();

      // Carousel slide 2 should be selected
      await expect(carouselItems.nth(1)).toHaveClass(/selected/);
    });

    test('carousel and table stay synchronized during navigation', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 5);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carouselItems = page.locator('.slide-carousel-item');
      const tableRows = page.locator('tbody tr');

      // Click carousel slide 3
      await carouselItems.nth(2).click();
      await expect(tableRows.nth(2)).toHaveClass(/selected/);

      // Click table row 1
      await tableRows.nth(0).click();
      await expect(carouselItems.nth(0)).toHaveClass(/selected/);

      // Use keyboard to navigate
      const carousel = page.locator('.slide-carousel');
      await carousel.focus();
      await page.keyboard.press('ArrowRight');
      
      // Both should show slide 2
      await expect(carouselItems.nth(1)).toHaveClass(/selected/);
      await expect(tableRows.nth(1)).toHaveClass(/selected/);
    });

    test('hovering carousel and table rows sync correctly', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carouselItems = page.locator('.slide-carousel-item');
      const tableRows = page.locator('tbody tr');

      // Hover carousel slide 2
      await carouselItems.nth(1).hover();
      await expect(tableRows.nth(1)).toHaveClass(/hovered/);

      // Move away
      await page.locator('.metadata-assignment-actions').hover();

      // Hover table row 3
      await tableRows.nth(2).hover();
      await expect(carouselItems.nth(2)).toHaveClass(/hovered/);
    });
  });

  // ── Large Projects ─────────────────────────────────────────────────────
  test.describe('Large Project Handling', () => {
    test('carousel handles 20+ slides', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 20);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carouselItems = page.locator('.slide-carousel-item');
      await expect(carouselItems).toHaveCount(20);

      // Navigate to slide 15
      const carousel = page.locator('.slide-carousel');
      await carousel.focus();
      
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('ArrowRight');
      }

      const counter = page.locator('.slide-carousel-counter');
      await expect(counter).toContainText('15 / 20');
    });

    test('carousel scrolls horizontally with many slides', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 20);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carousel = page.locator('.slide-carousel');

      // Click last slide
      await page.locator('.slide-carousel-item').nth(19).click();

      // Carousel should be scrolled to show last slide
      const scrollLeft = await carousel.evaluate(el => el.scrollLeft);
      const maxScroll = await carousel.evaluate(el => el.scrollWidth - el.clientWidth);
      
      // Should be near the end
      expect(scrollLeft).toBeGreaterThan(maxScroll * 0.7);
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────
  test.describe('Accessibility', () => {
    test('carousel has proper ARIA labels', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carousel = page.locator('.slide-carousel');
      await expect(carousel).toHaveAttribute('role', 'region');
      await expect(carousel).toHaveAttribute('aria-label', 'Slide carousel');
    });

    test('carousel items have ARIA labels', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carouselItems = page.locator('.slide-carousel-item');
      
      for (let i = 0; i < 3; i++) {
        await expect(carouselItems.nth(i)).toHaveAttribute(
          'aria-label',
          `Slide ${i + 1} of 3`
        );
      }
    });

    test('carousel is keyboard navigable', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const carousel = page.locator('.slide-carousel');
      
      // Should be focusable
      await carousel.focus();
      const focused = await carousel.evaluate(el => el === document.activeElement);
      expect(focused).toBe(true);
    });

    test('carousel counter is announced to screen readers', async ({ page }) => {
      await doHtmlApplyMultiSlide(page, 3);
      await page.locator('[data-testid="btn-assign-metadata"]').click();

      const counterContainer = page.locator('.slide-carousel-info');
      await expect(counterContainer).toHaveAttribute('aria-live', 'polite');
      await expect(counterContainer).toHaveAttribute('aria-atomic', 'true');
    });
  });
});
