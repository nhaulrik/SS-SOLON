/**
 * E2E tests for Phase 2: Metadata Assignment Step
 *
 * Use cases covered:
 * UC1: Basic Happy Path - User assigns metadata to 3 slides
 * UC2: Error Handling - Validation errors and corrections
 * UC3: Keyboard Navigation - Tab, Shift+Tab, Arrow keys
 * UC4: Preview Interactions - Hover updates preview, click persists selection
 * UC5: Responsive Design - Mobile/tablet layout
 * UC6: Large Projects - 10+ slides with scrolling
 * UC7: Batch Corrections - Editing multiple rows
 */

import { test, expect, SEL, doHtmlApplyContent, doHtmlApplyMultiSlide } from './fixtures.js';

// ── UC1: Basic Happy Path ────────────────────────────────────────────

test.describe('UC1: Basic Happy Path - Assign metadata to 3 slides', () => {
  test('metadata assignment step appears after preview', async ({ page }) => {
    await doHtmlApplyContent(page);
    
    // Should be on preview step
    expect(page.url()).toContain('preview');
    
    // Click "Assign Metadata" button
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    // Should navigate to metadata step
    expect(page.url()).toContain('metadata');
  });

  test('metadata table displays 3 slides', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    // Table should show 3 rows
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(3);
  });

  test('table has correct headers', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    expect(page.locator('thead th')).toContainText(['#', 'Slide ID', 'Slide Name', 'Type']);
  });

  test('preview panel shows slide 1 initially', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    // Preview counter should show "1 / 1" or "1 / 3" depending on slide count
    const counter = page.locator('.metadata-assignment-preview-counter');
    await expect(counter).toContainText('1 /');
  });

  test('user can edit slide 1 metadata', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    // Get first row inputs
    const slideIdInput = page.locator('input[value="slide-1"]').first();
    const nameInput = page.locator('input[value="Slide 1"]').first();
    const typeSelect = page.locator('select').first();
    
    // Edit fields
    await slideIdInput.clear();
    await slideIdInput.fill('product-intro');
    
    await nameInput.clear();
    await nameInput.fill('Product Introduction');
    
    await typeSelect.selectOption('title');
    
    // Verify changes
    await expect(slideIdInput).toHaveValue('product-intro');
    await expect(nameInput).toHaveValue('Product Introduction');
    await expect(typeSelect).toHaveValue('title');
  });

  test('user can save with valid metadata', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    // Edit all 3 slides
    const slideIdInputs = page.locator('input[id*="slideId"]');
    const nameInputs = page.locator('input[id*="name"]');
    const typeSelects = page.locator('select[id*="type"]');
    
    // Slide 1
    await slideIdInputs.nth(0).clear();
    await slideIdInputs.nth(0).fill('intro');
    await nameInputs.nth(0).clear();
    await nameInputs.nth(0).fill('Introduction');
    await typeSelects.nth(0).selectOption('title');
    
    // Slide 2
    await slideIdInputs.nth(1).clear();
    await slideIdInputs.nth(1).fill('features');
    await nameInputs.nth(1).clear();
    await nameInputs.nth(1).fill('Features');
    await typeSelects.nth(1).selectOption('content');
    
    // Slide 3
    await slideIdInputs.nth(2).clear();
    await slideIdInputs.nth(2).fill('conclusion');
    await nameInputs.nth(2).clear();
    await nameInputs.nth(2).fill('Thank You');
    await typeSelects.nth(2).selectOption('conclusion');
    
    // Intercept save request
    const savePromise = page.waitForResponse(
      response => response.url().includes('/api/html-flow/save-project') && response.status() === 200
    );
    
    // Click Save & Continue
    await page.locator('button:has-text("Save & Continue")').click();
    
    const response = await savePromise;
    const data = await response.json();
    
    expect(data.ok).toBe(true);
    expect(data.slideCount).toBe(3);
  });

  test('success message appears after save', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    // Edit all slides with valid data
    const slideIdInputs = page.locator('input[id*="slideId"]');
    const nameInputs = page.locator('input[id*="name"]');
    const typeSelects = page.locator('select[id*="type"]');
    
    for (let i = 0; i < 3; i++) {
      await slideIdInputs.nth(i).clear();
      await slideIdInputs.nth(i).fill(`slide-${i + 1}`);
      await nameInputs.nth(i).clear();
      await nameInputs.nth(i).fill(`Slide ${i + 1}`);
      await typeSelects.nth(i).selectOption('content');
    }
    
    // Save
    await page.locator('button:has-text("Save & Continue")').click();
    
    // Success toast should appear
    await expect(page.locator('text=saved with metadata')).toBeVisible();
  });
});

// ── UC2: Error Handling ──────────────────────────────────────────────

test.describe('UC2: Error Handling - Validation errors', () => {
  test('error shown for invalid slideId characters', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const slideIdInput = page.locator('input[value="slide-1"]').first();
    await slideIdInput.clear();
    await slideIdInput.fill('slide@#$%123');
    
    // Try to save
    await page.locator('button:has-text("Save & Continue")').click();
    
    // Error toast should appear
    await expect(page.locator('text=fix validation errors')).toBeVisible();
  });

  test('error icon appears in table for invalid field', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const slideIdInput = page.locator('input[value="slide-1"]').first();
    await slideIdInput.clear();
    await slideIdInput.fill('invalid@#$');
    
    // Try to save
    await page.locator('button:has-text("Save & Continue")').click();
    
    // Error icon should appear
    await expect(page.locator('text=⚠')).toBeVisible();
  });

  test('error clears when user fixes the field', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const slideIdInput = page.locator('input[value="slide-1"]').first();
    
    // Make invalid
    await slideIdInput.clear();
    await slideIdInput.fill('invalid@#$');
    
    // Try to save
    await page.locator('button:has-text("Save & Continue")').click();
    
    // Error icon appears
    await expect(page.locator('text=⚠')).toBeVisible();
    
    // Fix the error
    await slideIdInput.clear();
    await slideIdInput.fill('valid-id');
    
    // Error should be cleared
    await expect(page.locator('text=⚠')).not.toBeVisible();
  });

  test('error shown for empty name field', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const nameInput = page.locator('input[value="Slide 1"]').first();
    await nameInput.clear();
    
    // Try to save
    await page.locator('button:has-text("Save & Continue")').click();
    
    // Error should appear
    await expect(page.locator('text=fix validation errors')).toBeVisible();
  });

  test('error shown for unselected type', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const typeSelect = page.locator('select').first();
    await typeSelect.selectOption('');
    
    // Try to save
    await page.locator('button:has-text("Save & Continue")').click();
    
    // Error should appear
    await expect(page.locator('text=fix validation errors')).toBeVisible();
  });
});

// ── UC3: Keyboard Navigation ─────────────────────────────────────────

test.describe('UC3: Keyboard Navigation - Tab, Arrow keys', () => {
  test('Tab key moves to next field', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const slideIdInput = page.locator('input[value="slide-1"]').first();
    await slideIdInput.focus();
    
    await page.keyboard.press('Tab');
    
    const nameInput = page.locator('input[value="Slide 1"]').first();
    await expect(nameInput).toBeFocused();
  });

  test('user can complete form with keyboard only', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const slideIdInputs = page.locator('input[id*="slideId"]');
    
    // Focus first field
    await slideIdInputs.nth(0).focus();
    
    // Type and tab through all fields
    await page.keyboard.type('intro');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Introduction');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    
    // Verify first field was edited
    await expect(slideIdInputs.nth(0)).toHaveValue('intro');
  });

  test('ArrowDown moves to same field in next row', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const slideIdInputs = page.locator('input[id*="slideId"]');
    await slideIdInputs.nth(0).focus();
    
    await page.keyboard.press('ArrowDown');
    
    await expect(slideIdInputs.nth(1)).toBeFocused();
  });

  test('ArrowUp moves to same field in previous row', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const slideIdInputs = page.locator('input[id*="slideId"]');
    await slideIdInputs.nth(1).focus();
    
    await page.keyboard.press('ArrowUp');
    
    await expect(slideIdInputs.nth(0)).toBeFocused();
  });
});

// ── UC4: Preview Interactions ────────────────────────────────────────

test.describe('UC4: Preview Interactions - Hover and Click', () => {
  test('hovering row updates preview counter', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const rows = page.locator('tbody tr');
    
    // Hover row 2
    await rows.nth(1).hover();
    
    // Preview counter should update
    const counter = page.locator('.metadata-assignment-preview-counter');
    await expect(counter).toContainText('2 / 3');
  });

  test('clicking row selects it', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const rows = page.locator('tbody tr');
    const row2 = rows.nth(1);
    
    await row2.click();
    
    // Row should have selected class
    await expect(row2).toHaveClass(/selected/);
  });

  test('hovering different row updates preview while selection persists', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const rows = page.locator('tbody tr');
    const counter = page.locator('.metadata-assignment-preview-counter');
    
    // Select row 2
    await rows.nth(1).click();
    await expect(rows.nth(1)).toHaveClass(/selected/);
    
    // Hover row 3
    await rows.nth(2).hover();
    await expect(counter).toContainText('3 / 3');
    
    // Row 2 still selected
    await expect(rows.nth(1)).toHaveClass(/selected/);
    
    // Move away from row 3
    await page.locator('body').hover();
    
    // Preview returns to row 2
    await expect(counter).toContainText('2 / 3');
  });
});

// ── UC5: Responsive Design ───────────────────────────────────────────

test.describe('UC5: Responsive Design - Mobile/tablet', () => {
  test('layout is responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    // Table should be visible
    const table = page.locator('.metadata-table');
    await expect(table).toBeVisible();
    
    // Preview should be visible
    const preview = page.locator('.metadata-assignment-preview-panel');
    await expect(preview).toBeVisible();
  });

  test('table is scrollable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await doHtmlApplyMultiSlide(page, 10);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    // Table wrapper should be scrollable
    const tableWrapper = page.locator('.metadata-table-wrapper');
    const scrollHeight = await tableWrapper.evaluate(el => el.scrollHeight);
    const clientHeight = await tableWrapper.evaluate(el => el.clientHeight);
    
    expect(scrollHeight).toBeGreaterThan(clientHeight);
  });
});

// ── UC6: Large Projects ──────────────────────────────────────────────

test.describe('UC6: Large Projects - 10+ slides', () => {
  test('renders table with 10 slides', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 10);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(10);
  });

  test('can edit slides throughout table', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 10);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const slideIdInputs = page.locator('input[id*="slideId"]');
    
    // Edit first slide
    await slideIdInputs.nth(0).clear();
    await slideIdInputs.nth(0).fill('intro');
    
    // Edit last slide
    await slideIdInputs.nth(9).clear();
    await slideIdInputs.nth(9).fill('conclusion');
    
    await expect(slideIdInputs.nth(0)).toHaveValue('intro');
    await expect(slideIdInputs.nth(9)).toHaveValue('conclusion');
  });

  test('preview shows correct slide when hovering row 8', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 10);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const rows = page.locator('tbody tr');
    const counter = page.locator('.metadata-assignment-preview-counter');
    
    // Hover row 8 (index 7)
    await rows.nth(7).hover();
    
    await expect(counter).toContainText('8 / 10');
  });
});

// ── UC7: Batch Corrections ───────────────────────────────────────────

test.describe('UC7: Batch Corrections - Edit multiple rows', () => {
  test('user can quickly fix all slideIds', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 5);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const slideIdInputs = page.locator('input[id*="slideId"]');
    
    // Edit all 5 slides
    for (let i = 0; i < 5; i++) {
      await slideIdInputs.nth(i).clear();
      await slideIdInputs.nth(i).fill(`slide-${i + 1}`);
    }
    
    // Verify all changed
    for (let i = 0; i < 5; i++) {
      await expect(slideIdInputs.nth(i)).toHaveValue(`slide-${i + 1}`);
    }
  });

  test('user can change all types to specific type', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 5);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    const typeSelects = page.locator('select[id*="type"]');
    
    // Change all to "content"
    for (let i = 0; i < 5; i++) {
      await typeSelects.nth(i).selectOption('content');
    }
    
    // Verify all changed
    for (let i = 0; i < 5; i++) {
      await expect(typeSelects.nth(i)).toHaveValue('content');
    }
  });
});

// ── Navigation Tests ─────────────────────────────────────────────────

test.describe('Navigation', () => {
  test('Back button returns to preview step', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    // Should be on metadata step
    expect(page.url()).toContain('metadata');
    
    // Click back
    await page.locator('button:has-text("Back to preview")').click();
    
    // Should return to preview
    expect(page.url()).toContain('preview');
  });

  test('breadcrumb shows current step', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator('[data-testid="btn-assign-metadata"]').click();
    
    // Breadcrumb should show metadata step
    await expect(page.locator('text=Assign Metadata')).toBeVisible();
  });
});
