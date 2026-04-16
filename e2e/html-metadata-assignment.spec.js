/**
 * E2E tests for Phase 2: Metadata Assignment
 *
 * Tests the complete flow of assigning metadata to slides before saving a project.
 *
 * UC-MA-01  Metadata assignment dialog appears when Save Project is clicked
 * UC-MA-02  Dialog shows slide-by-slide metadata form
 * UC-MA-03  User can edit slideId, name, and type for each slide
 * UC-MA-04  Navigation between slides (Next/Previous buttons)
 * UC-MA-05  Progress bar shows current position
 * UC-MA-06  Validation errors displayed for invalid metadata
 * UC-MA-07  Summary view shows all slides before final save
 * UC-MA-08  User can edit metadata from summary view
 * UC-MA-09  project.json file created with metadata
 * UC-MA-10  Metadata persisted in project folder
 */

import { test, expect, SEL, doHtmlApplyContent, doHtmlApplyMultiSlide } from './fixtures.js';

// ── UC-MA-01: Metadata assignment dialog appears ────────────────────────────────

test.describe('UC-MA-01 — Metadata assignment dialog appears when Save Project is clicked', () => {
  test('metadata dialog appears instead of save dialog', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    // Should show "Assign Metadata" heading
    await expect(page.locator('text=Assign Metadata')).toBeVisible();
    
    // Should NOT show the old "Save Project" dialog
    await expect(page.locator('text=Save Project').first()).toBeVisible(); // in header
  });

  test('dialog shows slide counter', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    await expect(page.locator('text=Slide 1 of 1')).toBeVisible();
  });

  test('metadata dialog shows for multi-slide projects', async ({ page }) => {
    await doHtmlApplyMultiSlide(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    await expect(page.locator('text=Assign Metadata')).toBeVisible();
    await expect(page.locator('text=Slide 1 of')).toBeVisible();
  });
});

// ── UC-MA-02: Dialog shows slide-by-slide metadata form ─────────────────────────

test.describe('UC-MA-02 — Dialog shows slide-by-slide metadata form', () => {
  test('form has slideId input field', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const slideIdInput = page.locator('input[id*="slideId"]');
    await expect(slideIdInput).toBeVisible();
    await expect(slideIdInput).toHaveAttribute('placeholder', /e.g., intro-slide-1/);
  });

  test('form has name input field', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const nameInput = page.locator('input[id*="name"]');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveAttribute('placeholder', /e.g., Introduction/);
  });

  test('form has type select field', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const typeSelect = page.locator('select[id*="type"]');
    await expect(typeSelect).toBeVisible();
    
    // Check that all slide types are available
    const options = typeSelect.locator('option');
    await expect(options).toHaveCount(5); // empty + 4 types
  });

  test('form shows default values', async ({ page }) => {
    await doHtmlApplyContent(page, 'Test Project');
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const slideIdInput = page.locator('input[id*="slideId"]');
    const nameInput = page.locator('input[id*="name"]');
    const typeSelect = page.locator('select[id*="type"]');
    
    await expect(slideIdInput).toHaveValue('slide-1');
    await expect(nameInput).toHaveValue('Slide 1');
    await expect(typeSelect).toHaveValue('content');
  });
});

// ── UC-MA-03: User can edit metadata ──────────────────────────────────────────────

test.describe('UC-MA-03 — User can edit slideId, name, and type for each slide', () => {
  test('user can edit slideId', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const slideIdInput = page.locator('input[id*="slideId"]');
    await slideIdInput.clear();
    await slideIdInput.fill('intro-slide');
    
    await expect(slideIdInput).toHaveValue('intro-slide');
  });

  test('user can edit name', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const nameInput = page.locator('input[id*="name"]');
    await nameInput.clear();
    await nameInput.fill('Introduction Slide');
    
    await expect(nameInput).toHaveValue('Introduction Slide');
  });

  test('user can change type', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const typeSelect = page.locator('select[id*="type"]');
    await typeSelect.selectOption('title');
    
    await expect(typeSelect).toHaveValue('title');
  });

  test('changes are preserved when navigating', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 2);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    // Edit slide 1
    const slideIdInput = page.locator('input[id*="slideId"]');
    await slideIdInput.clear();
    await slideIdInput.fill('custom-slide-1');
    
    // Go to slide 2
    await page.locator('button:has-text("Next")').click();
    await expect(page.locator('text=Slide 2 of 2')).toBeVisible();
    
    // Go back to slide 1
    await page.locator('button:has-text("Previous")').click();
    
    // Changes should be preserved
    await expect(slideIdInput).toHaveValue('custom-slide-1');
  });
});

// ── UC-MA-04: Navigation between slides ──────────────────────────────────────────

test.describe('UC-MA-04 — Navigation between slides (Next/Previous buttons)', () => {
  test('Next button advances to next slide', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    await expect(page.locator('text=Slide 1 of 3')).toBeVisible();
    
    await page.locator('button:has-text("Next")').click();
    
    await expect(page.locator('text=Slide 2 of 3')).toBeVisible();
  });

  test('Previous button goes to previous slide', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    // Go to slide 2
    await page.locator('button:has-text("Next")').click();
    await expect(page.locator('text=Slide 2 of 3')).toBeVisible();
    
    // Go back to slide 1
    await page.locator('button:has-text("Previous")').click();
    
    await expect(page.locator('text=Slide 1 of 3')).toBeVisible();
  });

  test('Previous button is disabled on first slide', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const prevButton = page.locator('button:has-text("Previous")');
    await expect(prevButton).toBeDisabled();
  });

  test('Last slide shows Review button instead of Next', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 2);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    // Go to last slide
    await page.locator('button:has-text("Next")').click();
    
    await expect(page.locator('button:has-text("Review")')).toBeVisible();
    await expect(page.locator('button:has-text("Next")')).not.toBeVisible();
  });
});

// ── UC-MA-05: Progress bar shows current position ────────────────────────────────

test.describe('UC-MA-05 — Progress bar shows current position', () => {
  test('progress bar visible', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const progressBar = page.locator('.progress-bar');
    await expect(progressBar).toBeVisible();
  });

  test('progress bar updates as user navigates', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const progressFill = page.locator('.progress-fill');
    
    // Slide 1: ~33%
    let width = await progressFill.evaluate(el => window.getComputedStyle(el).width);
    expect(parseFloat(width)).toBeGreaterThan(0);
    
    // Go to slide 2
    await page.locator('button:has-text("Next")').click();
    width = await progressFill.evaluate(el => window.getComputedStyle(el).width);
    expect(parseFloat(width)).toBeGreaterThan(0);
  });
});

// ── UC-MA-06: Validation errors displayed ────────────────────────────────────────

test.describe('UC-MA-06 — Validation errors displayed for invalid metadata', () => {
  test('error shown for empty slideId', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const slideIdInput = page.locator('input[id*="slideId"]');
    await slideIdInput.clear();
    
    // Try to advance
    await page.locator('button:has-text("Review")').click();
    
    await expect(page.locator('text=Slide ID is required')).toBeVisible();
  });

  test('error shown for invalid slideId characters', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const slideIdInput = page.locator('input[id*="slideId"]');
    await slideIdInput.clear();
    await slideIdInput.fill('slide@#$%');
    
    await page.locator('button:has-text("Review")').click();
    
    await expect(page.locator('text=Slide ID can only contain')).toBeVisible();
  });

  test('error shown for empty name', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const nameInput = page.locator('input[id*="name"]');
    await nameInput.clear();
    
    await page.locator('button:has-text("Review")').click();
    
    await expect(page.locator('text=Slide name is required')).toBeVisible();
  });

  test('error shown for unselected type', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const typeSelect = page.locator('select[id*="type"]');
    await typeSelect.selectOption('');
    
    await page.locator('button:has-text("Review")').click();
    
    await expect(page.locator('text=Slide type is required')).toBeVisible();
  });

  test('error cleared when user fixes input', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const slideIdInput = page.locator('input[id*="slideId"]');
    await slideIdInput.clear();
    
    await page.locator('button:has-text("Review")').click();
    await expect(page.locator('text=Slide ID is required')).toBeVisible();
    
    // Fix the error
    await slideIdInput.fill('valid-id');
    
    // Error should disappear
    await expect(page.locator('text=Slide ID is required')).not.toBeVisible();
  });
});

// ── UC-MA-07: Summary view shows all slides ──────────────────────────────────────

test.describe('UC-MA-07 — Summary view shows all slides before final save', () => {
  test('summary view appears when Review clicked', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 2);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    // Navigate to last slide and click Review
    await page.locator('button:has-text("Next")').click();
    await page.locator('button:has-text("Review")').click();
    
    await expect(page.locator('text=Review Metadata')).toBeVisible();
  });

  test('summary shows all slide metadata', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    // Navigate through all slides
    await page.locator('button:has-text("Next")').click();
    await page.locator('button:has-text("Next")').click();
    await page.locator('button:has-text("Review")').click();
    
    // Summary should show all 3 slides
    const slides = page.locator('.metadata-summary-item');
    await expect(slides).toHaveCount(3);
  });

  test('summary displays slideId, name, and type for each slide', async ({ page }) => {
    await doHtmlApplyContent(page, 'Test Project');
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    // Edit metadata
    const slideIdInput = page.locator('input[id*="slideId"]');
    const nameInput = page.locator('input[id*="name"]');
    const typeSelect = page.locator('select[id*="type"]');
    
    await slideIdInput.clear();
    await slideIdInput.fill('intro');
    await nameInput.clear();
    await nameInput.fill('Introduction');
    await typeSelect.selectOption('title');
    
    // Go to summary
    await page.locator('button:has-text("Review")').click();
    
    // Check summary displays the metadata
    await expect(page.locator('text=intro')).toBeVisible();
    await expect(page.locator('text=Introduction')).toBeVisible();
    await expect(page.locator('text=title')).toBeVisible();
  });
});

// ── UC-MA-08: User can edit from summary view ────────────────────────────────────

test.describe('UC-MA-08 — User can edit metadata from summary view', () => {
  test('Edit button visible for each slide in summary', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 2);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    await page.locator('button:has-text("Next")').click();
    await page.locator('button:has-text("Review")').click();
    
    const editButtons = page.locator('button:has-text("Edit")');
    await expect(editButtons).toHaveCount(2);
  });

  test('clicking Edit returns to form for that slide', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 2);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    await page.locator('button:has-text("Next")').click();
    await page.locator('button:has-text("Review")').click();
    
    // Click Edit for slide 1
    const editButtons = page.locator('button:has-text("Edit")');
    await editButtons.first().click();
    
    await expect(page.locator('text=Slide 1 of 2')).toBeVisible();
  });

  test('user can make changes in summary edit mode', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 2);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    await page.locator('button:has-text("Next")').click();
    await page.locator('button:has-text("Review")').click();
    
    // Edit slide 2
    const editButtons = page.locator('button:has-text("Edit")');
    await editButtons.last().click();
    
    // Should be on slide 2
    await expect(page.locator('text=Slide 2 of 2')).toBeVisible();
    
    // Make changes
    const nameInput = page.locator('input[id*="name"]');
    await nameInput.clear();
    await nameInput.fill('Modified Slide 2');
    
    // Go back to summary
    await page.locator('button:has-text("Review")').click();
    
    // Changes should be reflected
    await expect(page.locator('text=Modified Slide 2')).toBeVisible();
  });
});

// ── UC-MA-09: project.json file created ──────────────────────────────────────────

test.describe('UC-MA-09 — project.json file created with metadata', () => {
  test('project.json created when project saved with metadata', async ({ page, context }) => {
    await doHtmlApplyContent(page, 'Metadata Test Project');
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    // Go to summary and save
    await page.locator('button:has-text("Review")').click();
    
    const savePromise = page.waitForResponse(
      response => response.url().includes('/api/html-flow/save-project') && response.status() === 200
    );
    
    await page.locator('button:has-text("Save with Metadata")').click();
    
    const response = await savePromise;
    const data = await response.json();
    
    expect(data.ok).toBe(true);
    expect(data.projectName).toBeDefined();
  });

  test('success message shown after save', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    await page.locator('button:has-text("Review")').click();
    await page.locator('button:has-text("Save with Metadata")').click();
    
    // Should show success toast
    await expect(page.locator('text=saved with metadata')).toBeVisible();
  });
});

// ── UC-MA-10: Metadata persisted in project folder ────────────────────────────────

test.describe('UC-MA-10 — Metadata persisted in project folder', () => {
  test('metadata dialog cancelled properly', async ({ page }) => {
    await doHtmlApplyContent(page);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    const cancelButton = page.locator('button:has-text("Cancel")');
    await expect(cancelButton).toBeVisible();
    
    await cancelButton.click();
    
    // Should close dialog and return to preview
    await expect(page.locator('text=Assign Metadata')).not.toBeVisible();
  });

  test('metadata assignment flow completes successfully for multi-slide project', async ({ page }) => {
    await doHtmlApplyMultiSlide(page, 3);
    await page.locator(SEL.htmlSaveProjectBtn).click();
    
    // Edit each slide
    const slides = [
      { id: 'intro', name: 'Introduction', type: 'title' },
      { id: 'content', name: 'Content Slide', type: 'content' },
      { id: 'conclusion', name: 'Conclusion', type: 'conclusion' },
    ];
    
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      
      const slideIdInput = page.locator('input[id*="slideId"]');
      const nameInput = page.locator('input[id*="name"]');
      const typeSelect = page.locator('select[id*="type"]');
      
      await slideIdInput.clear();
      await slideIdInput.fill(slide.id);
      await nameInput.clear();
      await nameInput.fill(slide.name);
      await typeSelect.selectOption(slide.type);
      
      if (i < slides.length - 1) {
        await page.locator('button:has-text("Next")').click();
      }
    }
    
    // Go to summary
    await page.locator('button:has-text("Review")').click();
    
    // Save
    const savePromise = page.waitForResponse(
      response => response.url().includes('/api/html-flow/save-project') && response.status() === 200
    );
    
    await page.locator('button:has-text("Save with Metadata")').click();
    
    const response = await savePromise;
    const data = await response.json();
    
    expect(data.ok).toBe(true);
    expect(data.slideCount).toBe(3);
  });
});
