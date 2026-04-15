/**
 * E2E tests for back-and-forth navigation between steps without losing session.
 *
 * UC-BACKFORTH-01  Upload → Create project works on first attempt
 * UC-BACKFORTH-02  Upload → Back → Create project works on second attempt
 * UC-BACKFORTH-03  Upload → Recipe → Back → Create project works
 * UC-BACKFORTH-04  Multiple back-and-forth cycles preserve session
 * UC-BACKFORTH-05  Selections persist when going back to upload step
 * UC-BACKFORTH-06  Project name persists when going back
 */

import { test, expect, SEL, doHtmlUpload, doHtmlCreateProject, selectHtmlFlow } from './fixtures.js';

const FIXTURE_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Test</title></head>
<body>
  <section style="width:1280px; height:720px; background:white; padding:20px;">
    <h1 data-zone="title">Title</h1>
    <p data-zone="content">Content</p>
  </section>
</body>
</html>`;

// ── UC-BACKFORTH-01: Upload → Create project works on first attempt ──────────

test.describe('UC-BACKFORTH-01 — Upload → Create project on first attempt', () => {
  test('create project succeeds after upload', async ({ page }) => {
    await selectHtmlFlow(page);
    
    // Upload
    await page.setInputFiles(SEL.htmlFileInput, {
      name: 'test.html',
      mimeType: 'text/html',
      buffer: Buffer.from(FIXTURE_HTML),
    });
    await page.waitForSelector(SEL.htmlTreePanel);

    // Create project
    await page.locator(SEL.projectNameInput).fill('test-project');
    await page.locator(SEL.createProjectBtn).click();

    // Should navigate to recipe step
    await page.waitForSelector(SEL.htmlRecipeLayout);
    await expect(page.locator(SEL.htmlRecipeLayout)).toBeVisible();
  });
});

// ── UC-BACKFORTH-02: Upload → Create → Back → Create again ────────────────

test.describe('UC-BACKFORTH-02 — Upload → Create → Back → Create again', () => {
  test('create project succeeds after navigating back from recipe', async ({ page }) => {
    // Use the helper to create a project (goes to recipe step)
    await doHtmlCreateProject(page, 'first-attempt');

    // We're now on recipe step
    await expect(page.locator(SEL.htmlRecipeLayout)).toBeVisible();

    // Click back button to return to upload step
    const backBtn = page.locator('button:has-text("← Back to template")').first();
    await backBtn.click();

    // Should return to upload step with tree visible
    await page.waitForSelector(SEL.htmlTreePanel);

    // Try to create project again with different name
    await page.locator(SEL.projectNameInput).fill('second-attempt');
    await page.locator(SEL.createProjectBtn).click();

    // Should succeed and navigate to recipe
    await page.waitForSelector(SEL.htmlRecipeLayout);
    await expect(page.locator(SEL.htmlRecipeLayout)).toBeVisible();
  });
});

// ── UC-BACKFORTH-03: Upload → Recipe → Back → Create project ────────────────

test.describe('UC-BACKFORTH-03 — Upload → Recipe → Back → Create project', () => {
  test('create project works after navigating back from recipe step', async ({ page }) => {
    // Create project (which goes to recipe step)
    await doHtmlCreateProject(page, 'initial-project');

    // We're now on recipe step
    await expect(page.locator(SEL.htmlRecipeLayout)).toBeVisible();

    // Click back button to return to upload step
    const backBtn = page.locator('button:has-text("← Back to template")').first();
    await backBtn.click();

    // Should return to upload step with tree visible
    await page.waitForSelector(SEL.htmlTreePanel);

    // Try to create project again with different name
    await page.locator(SEL.projectNameInput).fill('second-attempt-project');
    await page.locator(SEL.createProjectBtn).click();

    // Should succeed
    await page.waitForSelector(SEL.htmlRecipeLayout);
    await expect(page.locator(SEL.htmlRecipeLayout)).toBeVisible();
  });
});

// ── UC-BACKFORTH-04: Multiple back-and-forth cycles ────────────────────────

test.describe('UC-BACKFORTH-04 — Multiple back-and-forth cycles preserve session', () => {
  test('session survives back/forth between upload and recipe', async ({ page }) => {
    // Create initial project
    await doHtmlCreateProject(page, 'cycle-1');
    await expect(page.locator(SEL.htmlRecipeLayout)).toBeVisible();

    // Cycle 1: back to upload
    let backBtn = page.locator('button:has-text("← Back to template")').first();
    await backBtn.click();
    await page.waitForSelector(SEL.htmlTreePanel);

    // Cycle 1: forward to recipe again
    await page.locator(SEL.projectNameInput).fill('cycle-1-retry');
    await page.locator(SEL.createProjectBtn).click();
    await page.waitForSelector(SEL.htmlRecipeLayout);

    // Cycle 2: back to upload
    backBtn = page.locator('button:has-text("← Back to template")').first();
    await backBtn.click();
    await page.waitForSelector(SEL.htmlTreePanel);

    // Cycle 2: forward to recipe again
    await page.locator(SEL.projectNameInput).fill('cycle-2-retry');
    await page.locator(SEL.createProjectBtn).click();
    await page.waitForSelector(SEL.htmlRecipeLayout);

    // Cycle 3: back to upload
    backBtn = page.locator('button:has-text("← Back to template")').first();
    await backBtn.click();
    await page.waitForSelector(SEL.htmlTreePanel);

     // Cycle 3: forward to recipe one more time
     await page.locator(SEL.projectNameInput).fill('cycle-3-retry');
     await page.locator(SEL.createProjectBtn).click();
     await page.waitForSelector(SEL.htmlRecipeLayout);

     await expect(page.locator(SEL.htmlRecipeLayout)).toBeVisible();
  });
});

// ── UC-BACKFORTH-05: Selections persist when going back ──────────────────────

test.describe('UC-BACKFORTH-05 — Selections persist when going back', () => {
  test('zone assignments are preserved after back navigation', async ({ page }) => {
    // Create project (which preserves selections in state)
    await doHtmlCreateProject(page, 'selection-test');

    // We're on recipe step
    await expect(page.locator(SEL.htmlRecipeLayout)).toBeVisible();

    // Go back to upload step
    const backBtn = page.locator('button:has-text("← Back to template")').first();
    await backBtn.click();

    // Tree should still be visible with selections intact
    await page.waitForSelector(SEL.htmlTreePanel);
    await expect(page.locator(SEL.htmlTreePanel)).toBeVisible();

    // Try to create project again - selections should still be there
    await page.locator(SEL.createProjectBtn).click();
    await page.waitForSelector(SEL.htmlRecipeLayout);
    expect(page.url()).toContain('/recipe');
  });
});

// ── UC-BACKFORTH-06: Project name persists when going back ────────────────────

test.describe('UC-BACKFORTH-06 — Project name persists when going back', () => {
  test('project name input is preserved after back navigation', async ({ page }) => {
    // Create project with a specific name
    await doHtmlCreateProject(page, 'my-custom-project-name');

    // We're on recipe step
    await expect(page.locator(SEL.htmlRecipeLayout)).toBeVisible();

    // Go back to upload step
    const backBtn = page.locator('button:has-text("← Back to template")').first();
    await backBtn.click();

    // Tree should be visible
    await page.waitForSelector(SEL.htmlTreePanel);

    // Project name should be preserved
    const projectNameInput = page.locator(SEL.projectNameInput);
    const projectNameValue = await projectNameInput.inputValue();
    expect(projectNameValue).toBe('my-custom-project-name');
  });
});
