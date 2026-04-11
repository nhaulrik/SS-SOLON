/**
 * Propagation spec.
 *
 * Tests the propagation feature: when the same key exists on multiple
 * non-repeatable slides, the user can configure whether the AI generates
 * one shared value (non-unique → static) or slide-specific values with
 * a linked context field (unique → contextual with linked-key hint).
 *
 * Fixture PPTX facts relied on here:
 *   - "Netcompany" text exists on slides 1, 2, and 3
 *   - Slides 1 and 3 are non-repeatable
 *   - "Feature Catalog for SteerCo" exists on slide 1 only
 *   - "Business Scope" exists on slide 3 only
 */

import { test, expect, SEL, doUpload, selectSlide, tagElement } from './fixtures.js';

async function openPropagateModal(page) {
  await page.locator(SEL.propagateIcon).first().click();
  await page.waitForSelector(SEL.propagateModal);
}

async function generateRecipe(page) {
  await page.locator(SEL.generateRecipe).click();
  await page.waitForSelector(SEL.recipeArea);
}

// ── Icon visibility ───────────────────────────────────────────────────────────

test.describe('Propagate icon visibility', () => {
  test('icon appears when the same key is tagged on two non-repeatable slides', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    await expect(page.locator(SEL.propagateIcon)).toBeVisible();
  });

  test('icon does not appear on a key that exists only on one slide', async ({ propagatedPage: page }) => {
    // Tag a unique key on slide 1 only
    await selectSlide(page, 1);
    await tagElement(page, { originalText: 'Feature Catalog for SteerCo', key: 'catalog', hint: 'Catalog title', ai: true });
    // The catalog row should have no propagate icon
    await expect(page.locator('.patch-row[data-key="catalog"] .propagate-icon')).toHaveCount(0);
  });

  test('icon appears on the shared key when viewed from slide 3 as well', async ({ propagatedPage: page }) => {
    await selectSlide(page, 3);
    await expect(page.locator(SEL.propagateIcon)).toBeVisible();
  });
});

// ── Modal ─────────────────────────────────────────────────────────────────────

test.describe('Propagate modal', () => {
  test('modal opens when icon is clicked', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    await openPropagateModal(page);
    await expect(page.locator(SEL.propagateModal)).toBeVisible();
  });

  test('modal shows the correct slides that share the key', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    await openPropagateModal(page);
    const text = await page.locator(SEL.propagateModal).innerText();
    expect(text).toContain('1');
    expect(text).toContain('3');
  });

  test('modal closes on Cancel without saving', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    await openPropagateModal(page);
    await page.locator(SEL.propagateModal).locator('button:has-text("Cancel")').click();
    await expect(page.locator(SEL.propagateModal)).not.toBeVisible();
  });

  test('linked key dropdown is hidden when non-unique mode is selected', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    await openPropagateModal(page);
    await page.locator(SEL.propagateModeNonUniq).check();
    await expect(page.locator(SEL.propagateLinkedKey)).not.toBeVisible();
  });

  test('linked key dropdown appears when unique mode is selected', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    await openPropagateModal(page);
    await page.locator(SEL.propagateModeUnique).check();
    await expect(page.locator(SEL.propagateLinkedKey)).toBeVisible();
  });
});

// ── Recipe output — non-unique ────────────────────────────────────────────────

test.describe('Non-unique propagation — recipe', () => {
  test('shared key appears in static section (not contextual) after non-unique config', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    await openPropagateModal(page);
    await page.locator(SEL.propagateModeNonUniq).check();
    await page.locator(SEL.propagateSave).click();
    await expect(page.locator(SEL.propagateModal)).not.toBeVisible();

    await generateRecipe(page);
    const text = await page.locator(SEL.recipeArea).innerText();

    const staticIdx     = text.indexOf('"static"');
    const contextualIdx = text.indexOf('"contextual"');
    const keyIdx        = text.indexOf('"netcompany"');

    // Key must appear in the recipe
    expect(keyIdx).toBeGreaterThan(-1);
    // Key must be in the static section (before contextual, or contextual absent)
    if (contextualIdx !== -1) {
      expect(keyIdx).toBeLessThan(contextualIdx);
    }
    expect(keyIdx).toBeGreaterThan(staticIdx);
  });
});

// ── Recipe output — unique ────────────────────────────────────────────────────

test.describe('Unique propagation — recipe', () => {
  test('shared key appears in contextual section with linked-key hint', async ({ propagatedPage: page }) => {
    // Add a context field on both slides so the dropdown has an option
    await selectSlide(page, 1);
    await tagElement(page, { originalText: 'Feature Catalog for SteerCo', key: 'catalog', hint: 'Catalog title', ai: true });
    await selectSlide(page, 3);
    await tagElement(page, { originalText: 'Business Scope', key: 'catalog', hint: 'Catalog title', ai: true });

    // Configure unique propagation for netcompany using catalog as context
    await selectSlide(page, 1);
    await openPropagateModal(page);
    await page.locator(SEL.propagateModeUnique).check();
    await page.locator(SEL.propagateLinkedKey).selectOption('catalog');
    await page.locator(SEL.propagateSave).click();
    await expect(page.locator(SEL.propagateModal)).not.toBeVisible();

    await generateRecipe(page);
    const text = await page.locator(SEL.recipeArea).innerText();

    // Must appear in contextual section
    expect(text).toContain('"contextual"');
    // Must contain the linked-key hint
    expect(text).toContain("Use the value of 'catalog'");
  });
});

// ── Recipe output — no config (auto-detect fallback) ─────────────────────────

test.describe('No propagation config — auto-detect fallback', () => {
  test('shared key falls back to contextual section with no config', async ({ propagatedPage: page }) => {
    await generateRecipe(page);
    const text = await page.locator(SEL.recipeArea).innerText();

    // Without config, shared key is auto-detected as contextual
    expect(text).toContain('"contextual"');
    expect(text).toContain('"netcompany"');

    const contextualIdx = text.indexOf('"contextual"');
    const keyIdx        = text.indexOf('"netcompany"');
    expect(keyIdx).toBeGreaterThan(contextualIdx);
  });
});

// ── Key rename confirmation ───────────────────────────────────────────────────

test.describe('Key rename — shared key confirmation', () => {
  test('renaming a shared key shows a confirmation dialog', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    const keyInput = page.locator('.patch-row[data-key="netcompany"] .patch-key-input');
    await keyInput.fill('company');
    await keyInput.blur();
    await expect(page.locator('.rename-confirm-modal')).toBeVisible();
  });

  test('"This slide only" renames the key only on the current slide', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    const keyInput = page.locator('.patch-row[data-key="netcompany"] .patch-key-input');
    await keyInput.fill('company');
    await keyInput.blur();
    await page.locator('[data-testid="rename-this-slide"]').click();

    // Slide 1 should now show 'company'
    await expect(page.locator('.patch-row[data-key="company"] .patch-key-input')).toHaveValue('company');

    // Slide 3 should still show 'netcompany'
    await selectSlide(page, 3);
    await expect(page.locator('.patch-row[data-key="netcompany"] .patch-key-input')).toHaveValue('netcompany');
  });

  test('"All slides" renames the key on every slide that shared it', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    const keyInput = page.locator('.patch-row[data-key="netcompany"] .patch-key-input');
    await keyInput.fill('company');
    await keyInput.blur();
    await page.locator('[data-testid="rename-all-slides"]').click();

    // Slide 1 should show 'company'
    await expect(page.locator('.patch-row[data-key="company"] .patch-key-input')).toHaveValue('company');

    // Slide 3 should also show 'company'
    await selectSlide(page, 3);
    await expect(page.locator('.patch-row[data-key="company"] .patch-key-input')).toHaveValue('company');
  });

  test('no confirmation shown when renaming a non-shared key', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    await tagElement(page, { originalText: 'Feature Catalog for SteerCo', key: 'catalog', hint: 'Catalog', ai: false });
    const keyInput = page.locator('.patch-row[data-key="catalog"] .patch-key-input');
    await keyInput.fill('catalog_renamed');
    await keyInput.blur();
    await expect(page.locator('.rename-confirm-modal')).not.toBeVisible();
  });

  test('dialog closes without changes when dismissed via Cancel area', async ({ propagatedPage: page }) => {
    await selectSlide(page, 1);
    const keyInput = page.locator('.patch-row[data-key="netcompany"] .patch-key-input');
    await keyInput.fill('company');
    await keyInput.blur();
    // Click the overlay to dismiss
    await page.locator('.modal-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.rename-confirm-modal')).not.toBeVisible();
    // The current slide's tag retains the typed value (this-slide-only change stands)
    await expect(page.locator('.patch-row[data-key="company"] .patch-key-input')).toHaveValue('company');
    // Slide 3 is untouched
    await selectSlide(page, 3);
    await expect(page.locator('.patch-row[data-key="netcompany"] .patch-key-input')).toHaveValue('netcompany');
  });
});

// ── Clearing config ───────────────────────────────────────────────────────────

test.describe('Clearing propagation config', () => {
  test('clearing config after non-unique reverts key to contextual', async ({ propagatedPage: page }) => {
    // First set non-unique
    await selectSlide(page, 1);
    await openPropagateModal(page);
    await page.locator(SEL.propagateModeNonUniq).check();
    await page.locator(SEL.propagateSave).click();

    // Verify it's static
    await generateRecipe(page);
    const staticText = await page.locator(SEL.recipeArea).innerText();
    const staticIdx  = staticText.indexOf('"static"');
    const keyIdxStatic = staticText.indexOf('"netcompany"');
    expect(keyIdxStatic).toBeGreaterThan(staticIdx);

    // Now clear the config
    await page.locator('.breadcrumb-item:has-text("Tag")').click();
    await selectSlide(page, 1);
    await openPropagateModal(page);
    await page.locator('button:has-text("Clear")').click();
    await page.locator(SEL.propagateSave).click();

    // Regenerate and verify key is back in contextual
    await generateRecipe(page);
    const text = await page.locator(SEL.recipeArea).innerText();
    expect(text).toContain('"contextual"');
    const contextualIdx = text.indexOf('"contextual"');
    const keyIdx        = text.indexOf('"netcompany"');
    expect(keyIdx).toBeGreaterThan(contextualIdx);
  });
});
