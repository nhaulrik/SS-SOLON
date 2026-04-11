/**
 * Composable Playwright fixtures for the Solon E2E suite.
 *
 * Each fixture builds on the previous, bringing the app to a well-defined state:
 *
 *   page            — blank browser page (base Playwright fixture)
 *   uploadedPage    — sample.pptx uploaded, app is on the Tag step
 *   repeatablePage  — slide 2 selected, marked repeatable, structure type + prompt filled
 *   taggedPage      — both target elements on slide 2 tagged with correct keys/hints/AI on
 */

import { test as base } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_PPTX = path.resolve(__dirname, 'fixtures/sample.pptx');

// ─── Selectors (single source of truth for the whole suite) ──────────────────

export const SEL = {
  // Upload step
  fileInput:        'input[type="file"][accept=".pptx"]',

  // Tag step — slide carousel
  slideThumb:       (n) => `.tag-slide-btn:nth-child(${n})`,

  // Tag step — repeatable config
  repeatableToggle: '.tag-repeatable input[type="checkbox"]',
  structureType:    '.repeatable-config input[type="text"]',
  customPrompt:     '.repeatable-config textarea',

  // Tag step — slide overlay click targets (by original text, stable regardless of tag state)
  overlayByText:    (text) => `.overlay-element[data-text="${text}"]`,

  // Tag modal
  modal:            '.modal-content',
  modalKey:         '[data-testid="modal-key"]',
  modalHint:        '[data-testid="modal-hint"]',
  modalAI:          '[data-testid="modal-ai"]',
  modalMax:         '[data-testid="modal-maxchars"]',
  modalSave:        '[data-testid="modal-save"]',

  // Patch table — rows
  patchRows:        '.patch-table-body .patch-row',
  patchRowByKey:    (key) => `.patch-row[data-key="${key}"]`,

  // Patch table — inline inputs
  patchKeyInput:    '.patch-key-input',
  hintInput:        '.patch-hint-input',
  patchMaxInput:    '.patch-max-input',

  // Propagation
  propagateIcon:        '.propagate-icon',
  propagateModal:       '.propagate-modal',
  propagateModeNonUniq: '[data-testid="mode-non-unique"]',
  propagateModeUnique:  '[data-testid="mode-unique"]',
  propagateLinkedKey:   '[data-testid="linked-key-select"]',
  propagateSave:        '[data-testid="propagate-save"]',

  // Actions
  generateRecipe:   'button:has-text("Generate Recipe")',

  // Recipe step
  recipeArea:       '.recipe-area'
};

// ─── Shared action helpers ────────────────────────────────────────────────────

/** Upload the fixture PPTX and wait for the Tag step to appear. */
export async function doUpload(page) {
  await page.goto('/');
  await page.setInputFiles(SEL.fileInput, FIXTURE_PPTX);
  // Wait for slide thumbnails to appear — confirms we're in the Tag step
  await page.waitForSelector('.tag-slides .tag-slide-btn');
}

/** Select slide N (1-based) in the carousel. */
export async function selectSlide(page, n) {
  await page.locator(SEL.slideThumb(n)).click();
  // Wait for the overlay to reflect the new slide
  await page.waitForTimeout(150);
}

/** Toggle the current slide as repeatable and fill its config. */
export async function configureRepeatable(page, { structureType, customPrompt }) {
  await page.locator(SEL.repeatableToggle).check();
  await page.locator(SEL.structureType).fill(structureType);
  await page.locator(SEL.customPrompt).fill(customPrompt);
}

/**
 * Click a slide overlay element (by its original text), fill the modal,
 * and save. Enables AI generation by default.
 */
export async function tagElement(page, { originalText, key, hint, ai = true }) {
  await page.locator(SEL.overlayByText(originalText)).click();
  await page.waitForSelector(SEL.modal);

  // Select all and replace key
  await page.locator(SEL.modalKey).fill(key);

  // Set hint
  await page.locator(SEL.modalHint).fill(hint);

  // Toggle AI if needed
  const checkbox = page.locator(SEL.modalAI);
  const checked  = await checkbox.isChecked();
  if (ai && !checked) await checkbox.check();
  if (!ai && checked) await checkbox.uncheck();

  await page.locator(SEL.modalSave).click();
  await page.waitForSelector(SEL.modal, { state: 'detached' });
}

// ─── Fixture definitions ──────────────────────────────────────────────────────

export const test = base.extend({
  /** App is on the Tag step with sample.pptx loaded. */
  uploadedPage: async ({ page }, use) => {
    await doUpload(page);
    await use(page);
  },

  /** Slide 2 is selected and configured as a repeatable slide. */
  repeatablePage: async ({ page }, use) => {
    await doUpload(page);
    await selectSlide(page, 2);
    await configureRepeatable(page, {
      structureType: 'Initiatie Group',
      customPrompt:  'an instance for each initiative group'
    });
    await use(page);
  },

  /** Both target elements on slide 2 are tagged with keys, hints, and AI on. */
  taggedPage: async ({ page }, use) => {
    await doUpload(page);
    await selectSlide(page, 2);
    await configureRepeatable(page, {
      structureType: 'Initiatie Group',
      customPrompt:  'an instance for each initiative group'
    });
    await tagElement(page, {
      originalText: 'Core Revenue Management',
      key:          'initiative_group',
      hint:         'Title of the initiative group'
    });
    await tagElement(page, {
      originalText: 'Group Summary | Roadmap Initiative Overview',
      key:          'initiative_group_subheader',
      hint:         'subheader of initiative group'
    });
    await use(page);
  },

  /**
   * "Netcompany" is tagged with the same key on slide 1 and slide 3 (both non-repeatable).
   * This gives a naturally shared key ready for propagation tests.
   */
  propagatedPage: async ({ page }, use) => {
    await doUpload(page);
    await selectSlide(page, 1);
    await tagElement(page, { originalText: 'Netcompany', key: 'netcompany', hint: 'Company name', ai: true });
    await selectSlide(page, 3);
    await tagElement(page, { originalText: 'Netcompany', key: 'netcompany', hint: 'Company name', ai: true });
    await use(page);
  }
});

export { expect } from '@playwright/test';
