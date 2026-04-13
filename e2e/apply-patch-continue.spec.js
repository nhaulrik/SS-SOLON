/**
 * Apply Patch & Continue spec — UC1 through UC9.
 *
 * Starts from: taggedPage fixture (slide 2 repeatable, two AI-tagged elements).
 * Each test drives the full Preview → Apply → Tag loop and asserts the correct
 * post-apply state.
 *
 * Use-case coverage:
 *   UC1  — Basic flow: navigates back to Tag step after apply
 *   UC2  — Tags with keys are preserved
 *   UC3  — Hints are preserved
 *   UC4  — AI toggle is reset to OFF (keys and hints preserved)
 *   UC5  — Repeatable slides are cleared
 *   UC6  — Generated preview appears in Tag step
 *   UC7  — Preview shows multiple slides (repeatable instances)
 *   UC8  — Propagation config is preserved
 *   UC9  — PPTX file is downloaded with correct naming convention
 */

import {
  test, expect,
  SEL,
  selectSlide, tagElement, doFullApply,
  REPEATABLE_JSON, STATIC_JSON
} from './fixtures.js';

// ─── UC1: Basic flow ──────────────────────────────────────────────────────────

test.describe('UC1 — Basic Apply & Continue flow', () => {
  test('navigates back to Tag step after clicking Apply Patch & Continue', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    // Breadcrumb should read "Tag"
    await expect(page.locator('.breadcrumb-item.active')).toContainText('Tag');
  });

  test('slide carousel is visible after apply', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await expect(page.locator('.tag-slides .tag-slide-btn').first()).toBeVisible();
  });
});

// ─── UC2: Tags with keys preserved ───────────────────────────────────────────

test.describe('UC2 — Tags with keys are preserved after apply', () => {
  test('initiative_group tag is still present on slide 2', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await selectSlide(page, 2);
    await expect(page.locator(SEL.patchRowByKey('initiative_group'))).toBeVisible();
  });

  test('initiative_group_subheader tag is still present on slide 2', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await selectSlide(page, 2);
    await expect(page.locator(SEL.patchRowByKey('initiative_group_subheader'))).toBeVisible();
  });

  test('key values in inputs are unchanged after apply', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await selectSlide(page, 2);
    await expect(
      page.locator(SEL.patchRowByKey('initiative_group')).locator(SEL.patchKeyInput)
    ).toHaveValue('initiative_group');
  });
});

// ─── UC3: Hints preserved ─────────────────────────────────────────────────────

test.describe('UC3 — Hints are preserved after apply', () => {
  test('initiative_group hint is unchanged', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await selectSlide(page, 2);
    await expect(
      page.locator(SEL.patchRowByKey('initiative_group')).locator(SEL.hintInput)
    ).toHaveValue('Title of the initiative group');
  });

  test('initiative_group_subheader hint is unchanged', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await selectSlide(page, 2);
    await expect(
      page.locator(SEL.patchRowByKey('initiative_group_subheader')).locator(SEL.hintInput)
    ).toHaveValue('subheader of initiative group');
  });
});

// --- UC4: AI toggle reset to OFF after apply ---

test.describe('UC4 - AI toggle is reset to OFF after apply', () => {
  test('AI toggle for initiative_group is OFF after apply', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await selectSlide(page, 2);
    await expect(
      page.locator(SEL.patchRowByKey('initiative_group')).locator('input[type="checkbox"]')
    ).not.toBeChecked();
  });

  test('AI toggle for initiative_group_subheader is OFF after apply', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await selectSlide(page, 2);
    await expect(
      page.locator(SEL.patchRowByKey('initiative_group_subheader')).locator('input[type="checkbox"]')
    ).not.toBeChecked();
  });

  test('key and hint are preserved even though AI is reset to OFF', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await selectSlide(page, 2);
    // Key is preserved
    await expect(page.locator(SEL.patchRowByKey('initiative_group'))).toBeVisible();
    // AI is off
    await expect(
      page.locator(SEL.patchRowByKey('initiative_group')).locator('input[type="checkbox"]')
    ).not.toBeChecked();
  });
});

// ─── UC5: Repeatable slides cleared ──────────────────────────────────────────

test.describe('UC5 — Repeatable configuration is cleared after apply', () => {
  test('slide 2 is no longer marked as repeatable after apply', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    // The repeatable badge (⟳) on slide 2 thumbnail should not be active
    await expect(page.locator(SEL.slideThumb(2))).not.toHaveClass(/record/);
  });

  test('repeatable checkbox for slide 2 is unchecked after apply', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await selectSlide(page, 2);
    await expect(page.locator(SEL.repeatableToggle)).not.toBeChecked();
  });

  test('repeatable config section is hidden for slide 2 after apply', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await selectSlide(page, 2);
    await expect(page.locator('.repeatable-config')).not.toBeVisible();
  });
});

// ─── UC6: Preview shows generated slides in Tag step ─────────────────────────

test.describe('UC6 — Generated preview appears in Tag step after apply', () => {
  test('generated preview panel is visible after apply', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await expect(page.locator(SEL.tagStepPreview)).toBeVisible();
  });

  test('preview main canvas renders a slide', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await expect(page.locator(SEL.tagStepPreviewMain)).toBeVisible();
  });

  test('preview thumbnail strip is visible', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    await expect(page.locator(SEL.tagStepPreviewThumbs)).toBeVisible();
  });

  test('navigation label shows "1 / N" for at least one slide', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    const label = page.locator(SEL.tagPreviewNavLabel);
    await expect(label).toBeVisible();
    await expect(label).toContainText('1 /');
  });

  test('← button is disabled on first slide', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    const prevBtn = page.locator(SEL.tagPreviewNavBtn).first();
    await expect(prevBtn).toBeDisabled();
  });
});

// ─── UC7: Preview shows new repeatable instances ──────────────────────────────

test.describe('UC7 — Preview shows all generated slides including repeatable instances', () => {
  test('preview shows at least one slide after repeatable apply', async ({ taggedPage: page }) => {
    await doFullApply(page, REPEATABLE_JSON);
    const thumbs = page.locator(`${SEL.tagStepPreviewThumbs} .preview-thumb`);
    const count  = await thumbs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('preview shows more slides when JSON includes multiple repeatable instances', async ({ taggedPage: page }) => {
    const multiInstanceJson = {
      slides: {
        'Initiatie Group': [
          { structure_type: 'Initiatie Group', initiative_group: 'Group A', initiative_group_subheader: 'Sub A' },
          { structure_type: 'Initiatie Group', initiative_group: 'Group B', initiative_group_subheader: 'Sub B' },
          { structure_type: 'Initiatie Group', initiative_group: 'Group C', initiative_group_subheader: 'Sub C' }
        ]
      }
    };
    await doFullApply(page, multiInstanceJson);

    // Slide count should reflect 3 repeatable instances + static slides
    const thumbs = page.locator(`${SEL.tagStepPreviewThumbs} .preview-thumb`);
    const count  = await thumbs.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('→ button is enabled when there is more than one preview slide', async ({ taggedPage: page }) => {
    const multiInstanceJson = {
      slides: {
        'Initiatie Group': [
          { structure_type: 'Initiatie Group', initiative_group: 'Group A', initiative_group_subheader: 'Sub A' },
          { structure_type: 'Initiatie Group', initiative_group: 'Group B', initiative_group_subheader: 'Sub B' }
        ]
      }
    };
    await doFullApply(page, multiInstanceJson);

    const thumbs = page.locator(`${SEL.tagStepPreviewThumbs} .preview-thumb`);
    const count  = await thumbs.count();
    if (count > 1) {
      const nextBtn = page.locator(SEL.tagPreviewNavBtn).last();
      await expect(nextBtn).toBeEnabled();
    }
  });
});

// ─── UC8: Propagation config preserved ───────────────────────────────────────

test.describe('UC8 — Propagation config is preserved after apply', () => {
  test('propagation icon stays active after apply', async ({ page }) => {
    // Set up two non-repeatable slides with the same key + propagation
    await page.request.delete('http://localhost:3001/api/patches');
    await page.request.delete('http://localhost:3001/api/patch-chains');
    await page.goto('/');
    await page.setInputFiles(SEL.fileInput, (await import('./fixtures.js')).FIXTURE_PPTX);
    await page.waitForSelector('.tag-slides .tag-slide-btn');

    await selectSlide(page, 2);
    await tagElement(page, { originalText: 'Core Revenue Management', key: 'shared_key', hint: 'Shared hint', ai: true });
    await selectSlide(page, 3);
    await tagElement(page, { originalText: 'Core Revenue Management', key: 'shared_key', hint: 'Shared hint', ai: true });

    // Configure non-unique propagation on the shared key
    await selectSlide(page, 2);
    await page.locator(SEL.propagateIcon).click();
    await page.waitForSelector(SEL.propagateModal);
    await page.locator(SEL.propagateModeNonUniq).click();
    await page.locator(SEL.propagateSave).click();
    await page.waitForSelector(SEL.propagateModal, { state: 'detached' });

    // Apply with non-unique static JSON
    await doFullApply(page, { static: { shared_key: 'Shared Value' } });

    // After apply, select slide 2 and verify propagation icon is still active
    await selectSlide(page, 2);
    await expect(page.locator(SEL.propagateIconActive)).toBeVisible();
  });
});

// ─── UC9: PPTX is downloaded ──────────────────────────────────────────────────

test.describe('UC9 — Generated PPTX is downloaded', () => {
  test('a file is downloaded when Apply Patch & Continue is clicked', async ({ taggedPage: page }) => {
    const download = await doFullApply(page, REPEATABLE_JSON);
    expect(download).toBeTruthy();
    expect(download.suggestedFilename()).toMatch(/\.pptx$/);
  });

  test('downloaded filename follows the patch naming convention', async ({ taggedPage: page }) => {
    const download = await doFullApply(page, REPEATABLE_JSON);
    // Filename: {original-name}-patch-{n}.pptx — first patch should be -patch-1
    expect(download.suggestedFilename()).toMatch(/sample-patch-1\.pptx$/);
  });

  test('second apply increments the patch number in the filename', async ({ taggedPage: page }) => {
    // First apply
    await doFullApply(page, REPEATABLE_JSON);

    // Second apply (repeatableSlides cleared, so use static JSON)
    await selectSlide(page, 2);
    const download2 = await doFullApply(page, STATIC_JSON);
    expect(download2.suggestedFilename()).toMatch(/sample-patch-2\.pptx$/);
  });
});
