/**
 * Playwright fixtures for the Solon E2E suite (HTML Visual Flow).
 *
 * Fixture hierarchy:
 *   page             — blank browser page (base Playwright fixture)
 *   htmlUploadedPage — test_slide.html uploaded, tree panel visible
 *   htmlProjectPage  — uploaded + project created, on recipe step
 */

import { test as base, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURE_HTML = path.resolve(__dirname, '../input/test_slide.html');

// ─── Expected zones in test_slide.html ───────────────────────────────────────
export const EXPECTED_ZONES = [
  { key: 'initiative_group_title',    type: 'text',   slideIndex: 1 },
  { key: 'initiative_group_subtitle', type: 'text',   slideIndex: 1 },
  { key: 'total_hours',               type: 'number', slideIndex: 1 },
  { key: 'initiative_count',          type: 'number', slideIndex: 1 },
  { key: 'feature_count',             type: 'number', slideIndex: 1 },
  { key: 'completion_pct',            type: 'number', slideIndex: 1 },
  { key: 'business_value',            type: 'text',   slideIndex: 1 },
  { key: 'market_relevance',          type: 'text',   slideIndex: 1 },
];

// ─── Selectors ────────────────────────────────────────────────────────────────

export const SEL = {
  // ── Flow selector ──────────────────────────────────────────────────────────
  flowSelectContainer: '.flow-select-container',
  flowCards:           '.flow-card',
  flowCardVisual:      '.flow-card--visual',

  // ── HTML upload step ───────────────────────────────────────────────────────
  htmlFileInput:    'input[type="file"][accept=".html,.htm"]',
  htmlUploadZone:   '.html-upload-zone',
  htmlFileLoaded:   '.html-file-loaded',
  htmlFileName:     '.html-file-name',
  htmlFileMeta:     '.html-file-meta',
  htmlViolations:   '.html-violations',
  htmlViolationItems: '.html-violation-item',

  // DOM Tree panel
  htmlTreePanel:      '[data-testid="html-tree-panel"]',
  treeNodes:          '.tree-node',
  treeNodeById:       (id) => `[data-node-id="${id}"]`,
  treeAssignBtn:      (id) => `[data-testid="tree-assign-btn-${id}"]`,
  treeCheckbox:       (id) => `[data-testid="tree-check-${id}"]`,
  treeGroupAssignBtn: '[data-testid="tree-group-assign-btn"]',
  treeExpandAll:      'button:has-text("Expand all")',
  treeZoneBadges:     '.tree-zone-badge',
  treeConflictWarning: '[data-testid="tree-conflict-warning"]',
  treeClearAllBtn:     '[data-testid="tree-clear-all-btn"]',

  // Assignment panel
  assignPanel:       '[data-testid="tree-assign-panel"]',
  assignKeyInput:    '[data-testid="tree-assign-key"]',
  assignHintInput:   '[data-testid="tree-assign-hint"]',
  assignPromptInput: '[data-testid="tree-assign-prompt"]',
  assignTypeSelect:  '[data-testid="tree-assign-type"]',
  assignAiToggle:    '[data-testid="tree-assign-ai"]',
  assignConfirmBtn:  '[data-testid="tree-assign-confirm"]',
  assignClearBtn:    '[data-testid="tree-assign-clear"]',

  // Project footer
  projectNameInput: '.html-project-footer .form-input',
  createProjectBtn: '[data-testid="create-project-btn"]',

  // Preview panel
  htmlPreviewPanel:        '.html-preview-panel',
  htmlPreviewFrameWrapper: '.html-preview-frame-wrapper',
  htmlPreviewFrame:        '.html-preview-frame',

  // Breadcrumbs
  breadcrumbs:         '.breadcrumbs',
  breadcrumbItems:     '.breadcrumb-item',
  breadcrumbActive:    '.breadcrumb-item.active',
  breadcrumbCompleted: '.breadcrumb-item.completed',
  breadcrumbClickable: '.breadcrumb-item.clickable',

  // HTML recipe step
  htmlRecipeLayout:      '.html-recipe-layout',
  htmlGenerateRecipeBtn: 'button:has-text("Generate recipe")',
  htmlRecipeArea:        '.html-recipe-area',
  htmlJsonInput:         '.html-recipe-right .json-input',
  htmlApplyBtn:          'button:has-text("Apply content")',

  // HTML preview step
  htmlPreviewStepLayout:    '.html-preview-step-layout',
  htmlPreviewStepFrameWrap: '.html-preview-step-frame-wrap',
  htmlPreviewStepFrame:     '.html-preview-step-frame',
  htmlDownloadBtn:          'button:has-text("Download HTML")',
  htmlStartNewBtn:          'button:has-text("Start new project")',

  // Navigation
  changeFlowBtn: 'button:has-text("Change flow")',
};

// ─── Action helpers ───────────────────────────────────────────────────────────

/** Navigate to the app and select the Visual (HTML) flow. */
export async function selectHtmlFlow(page) {
  await page.goto('/');
  await page.locator(SEL.flowCardVisual).click();
}

/**
 * Upload the fixture HTML template and wait for the tree panel to appear.
 */
export async function doHtmlUpload(page) {
  await selectHtmlFlow(page);
  await page.setInputFiles(SEL.htmlFileInput, FIXTURE_HTML);
  await page.waitForSelector(SEL.htmlTreePanel);
}

/**
 * Upload the fixture HTML, fill the project name, and create the project.
 * Returns after the HTML recipe step is shown.
 */
export async function doHtmlCreateProject(page, projectName = 'test-project') {
  await doHtmlUpload(page);
  await page.locator(SEL.projectNameInput).fill(projectName);
  await page.locator(SEL.createProjectBtn).click();
  await page.waitForSelector(SEL.htmlRecipeLayout);
}

/**
 * Create a multi-slide (repeatable) project via the API and return the
 * apply-content response body.  Produces N cloned sections in previewHtml.
 *
 * @param {Page}   page
 * @param {number} instanceCount — number of slide clones to produce (default 3)
 */
export async function doHtmlApplyMultiSlide(page, instanceCount = 3) {
  const html = `<!DOCTYPE html><html><body>
    <section>
      <p data-zone="title" data-hint="slide title">Title</p>
    </section>
  </body></html>`;

  const uploadRes = await page.request.post('http://localhost:3001/api/html-flow/upload-template', {
    data: { html, fileName: 'multi.html' }
  });
  const { templateId, selections } = await uploadRes.json();

  const repSlides = [{ slideIndex: 1, key: 'deck', prompt: 'one per item' }];
  const modified  = selections.map(s => ({ ...s, unique: true }));
  const createRes = await page.request.post('http://localhost:3001/api/html-flow/create-project', {
    data: { templateId, selections: modified, projectName: 'multi-test', repeatableSlides: repSlides }
  });
  const { chainId } = await createRes.json();

  const instances = Array.from({ length: instanceCount }, (_, i) => ({ title: `Slide ${i + 1}` }));
  const json      = JSON.stringify({ slides: { deck: { instances } } });
  const applyRes  = await page.request.post('http://localhost:3001/api/html-flow/apply-content', {
    data: { chainId, jsonString: json }
  });
  return applyRes.json();
}

/**
 * Navigate all the way to the HTML preview step by applying minimal valid JSON.
 * Uses the API directly to bypass the recipe UI — fast and deterministic.
 */
export async function doHtmlApplyContent(page, projectName = 'test-project') {
  await doHtmlCreateProject(page, projectName);

  // Paste minimal valid JSON into the recipe textarea and click Apply
  const minimalJson = JSON.stringify({
    static: {
      initiative_group_title:    'Test Initiative',
      initiative_group_subtitle: 'Test Subtitle',
      total_hours:               '1,000',
      initiative_count:          '3',
      feature_count:             '10',
      completion_pct:            '50%',
      business_value:            'Test value',
      market_relevance:          'Test relevance',
    }
  });
  await page.locator(SEL.htmlJsonInput).fill(minimalJson);
  await page.locator(SEL.htmlApplyBtn).click();
  await page.waitForSelector(SEL.htmlPreviewStepLayout);
}

// ─── Fixture definitions ──────────────────────────────────────────────────────

export const test = base.extend({
  /**
   * Visual flow: test_slide.html uploaded, tree panel visible.
   */
  htmlUploadedPage: async ({ page }, use) => {
    await doHtmlUpload(page);
    await use(page);
  },

  /**
   * Visual flow: test_slide.html uploaded + project created.
   * App is on the HTML recipe step (Stage 2).
   */
  htmlProjectPage: async ({ page }, use) => {
    await doHtmlCreateProject(page, 'test-project');
    await use(page);
  },
});

export { expect };
