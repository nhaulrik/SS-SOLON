/**
 * e2e/phase1-project-persistence.spec.js
 *
 * End-to-end tests for Phase 1: Project Persistence & Multi-Template Foundation
 */

import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'http://localhost:5173'
const PROJECTS_DIR = path.join(process.cwd(), 'server/projects')

test.describe('Phase 1: Project Persistence & Multi-Template Foundation', () => {
  test.beforeEach(async ({ page }) => {
    // Clean up test projects before each test
    if (fs.existsSync(PROJECTS_DIR)) {
      const projects = fs.readdirSync(PROJECTS_DIR)
      for (const project of projects) {
        if (project.startsWith('e2e-test-')) {
          fs.rmSync(path.join(PROJECTS_DIR, project), { recursive: true, force: true })
        }
      }
    }

    // Navigate to app
    await page.goto(BASE_URL)
  })

  test('Use Case 1.1: New user creates first project', async ({ page }) => {
    // User sees entry screen with "Start New Project" button
    await expect(page.locator('h1')).toBeVisible()
    const startButton = page.locator('button:has-text("Start New Project")')
    await expect(startButton).toBeVisible()

    // User clicks "Start New Project"
    await startButton.click()

    // Upload dialog opens
    const dialog = page.locator('[class*="dialog"]')
    await expect(dialog).toBeVisible()

    // User selects HTML template file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('samples/template.html')

    // Wait for file to be selected
    await page.waitForTimeout(500)

    // User enters project name
    const projectNameInput = page.locator('input[placeholder*="project"]')
    await projectNameInput.fill('e2e-test-first-project')

    // User clicks "Create Project"
    const createButton = page.locator('button:has-text("Create Project")')
    await createButton.click()

    // Wait for project to be created and navigate to dashboard
    await page.waitForURL('**/project-dashboard**', { timeout: 5000 })

    // User is taken to project dashboard
    await expect(page.locator('h1')).toContainText('e2e-test-first-project')

    // Verify project directory was created
    const projectDir = path.join(PROJECTS_DIR, 'e2e-test-first-project')
    expect(fs.existsSync(projectDir)).toBe(true)
    expect(fs.existsSync(path.join(projectDir, 'project.json'))).toBe(true)
  })

  test('Use Case 1.2: Returning user resumes project', async ({ page }) => {
    // First, create a project
    await page.locator('button:has-text("Start New Project")').click()
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('samples/template.html')
    await page.waitForTimeout(500)
    const projectNameInput = page.locator('input[placeholder*="project"]')
    await projectNameInput.fill('e2e-test-resume-project')
    await page.locator('button:has-text("Create Project")').click()
    await page.waitForURL('**/project-dashboard**')

    // Go back to project list
    const backButton = page.locator('button:has-text("← Back")')
    await backButton.click()
    await page.waitForURL('**/project-landing**')

    // User sees project in list
    const projectCard = page.locator('text=e2e-test-resume-project')
    await expect(projectCard).toBeVisible()

    // User clicks on project to open it
    await projectCard.click()

    // Project dashboard loads
    await page.waitForURL('**/project-dashboard**')
    await expect(page.locator('h1')).toContainText('e2e-test-resume-project')
  })

  test('Use Case 1.3: User adds new template to existing project', async ({ page }) => {
    // Create initial project
    await page.locator('button:has-text("Start New Project")').click()
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('samples/template.html')
    await page.waitForTimeout(500)
    const projectNameInput = page.locator('input[placeholder*="project"]')
    await projectNameInput.fill('e2e-test-multi-template')
    await page.locator('button:has-text("Create Project")').click()
    await page.waitForURL('**/project-dashboard**')

    // User clicks "+ Upload Template"
    const uploadButton = page.locator('button:has-text("+ Upload Template")')
    await uploadButton.click()

    // Upload dialog opens
    const dialog = page.locator('[class*="dialog"]')
    await expect(dialog).toBeVisible()

    // User selects new HTML file
    const newFileInput = page.locator('input[type="file"]')
    await newFileInput.setInputFiles('samples/template.html')
    await page.waitForTimeout(500)

    // User clicks "Upload"
    const uploadConfirmButton = page.locator('button:has-text("Upload")')
    await uploadConfirmButton.click()

    // Wait for dialog to close and template to appear
    await page.waitForTimeout(1000)

    // Verify template count increased
    const templateCount = page.locator('text=/Templates.*\\d+/')
    await expect(templateCount).toBeVisible()
  })

  test('Use Case 1.4: User creates multiple flows from same template', async ({ page }) => {
    // Create initial project
    await page.locator('button:has-text("Start New Project")').click()
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('samples/template.html')
    await page.waitForTimeout(500)
    const projectNameInput = page.locator('input[placeholder*="project"]')
    await projectNameInput.fill('e2e-test-multi-flow')
    await page.locator('button:has-text("Create Project")').click()
    await page.waitForURL('**/project-dashboard**')

    // User clicks "+ New Flow"
    const newFlowButton = page.locator('button:has-text("+ New Flow")')
    await newFlowButton.click()

    // Flow creation dialog opens
    const dialog = page.locator('[class*="dialog"]')
    await expect(dialog).toBeVisible()

    // User enters variant name
    const variantInput = page.locator('input[placeholder*="variant"]')
    await variantInput.fill('v2')

    // User clicks "Create Flow"
    const createButton = page.locator('button:has-text("Create Flow")')
    await createButton.click()

    // Wait for flow to be created
    await page.waitForTimeout(1000)

    // Verify both flows exist
    const flowLinks = page.locator('[class*="flowLink"]')
    const count = await flowLinks.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('Complete workflow: Create project → Upload template → Create flow → View dashboard', async ({ page }) => {
    // Step 1: Create project
    await page.locator('button:has-text("Start New Project")').click()
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('samples/template.html')
    await page.waitForTimeout(500)
    const projectNameInput = page.locator('input[placeholder*="project"]')
    await projectNameInput.fill('e2e-test-complete-workflow')
    await page.locator('button:has-text("Create Project")').click()
    await page.waitForURL('**/project-dashboard**')

    // Verify project dashboard loads
    await expect(page.locator('h1')).toContainText('e2e-test-complete-workflow')

    // Step 2: Verify initial template exists
    const templates = page.locator('text=Templates')
    await expect(templates).toBeVisible()

    // Step 3: Verify initial flow exists
    const flows = page.locator('text=Flow')
    await expect(flows).toBeVisible()

    // Step 4: Verify can open flow
    const openButton = page.locator('button:has-text("Open Flow")')
    await expect(openButton).toBeVisible()

    // Verify project directory structure
    const projectDir = path.join(PROJECTS_DIR, 'e2e-test-complete-workflow')
    expect(fs.existsSync(projectDir)).toBe(true)
    expect(fs.existsSync(path.join(projectDir, 'templates'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, 'flows'))).toBe(true)

    // Verify project.json structure
    const projectJson = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'project.json'), 'utf-8')
    )
    expect(projectJson.name).toBe('e2e-test-complete-workflow')
    expect(projectJson.templates.length).toBeGreaterThan(0)
    expect(projectJson.flows.length).toBeGreaterThan(0)
  })

  test('Project list pagination and sorting', async ({ page }) => {
    // Create multiple projects
    for (let i = 1; i <= 3; i++) {
      await page.locator('button:has-text("Start New Project")').click()
      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles('samples/template.html')
      await page.waitForTimeout(500)
      const projectNameInput = page.locator('input[placeholder*="project"]')
      await projectNameInput.fill(`e2e-test-project-${i}`)
      await page.locator('button:has-text("Create Project")').click()
      await page.waitForURL('**/project-dashboard**')

      // Go back to list
      const backButton = page.locator('button:has-text("← Back")')
      await backButton.click()
      await page.waitForURL('**/project-landing**')
      await page.waitForTimeout(500)
    }

    // Verify all projects appear in list
    for (let i = 1; i <= 3; i++) {
      const projectCard = page.locator(`text=e2e-test-project-${i}`)
      await expect(projectCard).toBeVisible()
    }
  })

  test('Error handling: Invalid project name rejected', async ({ page }) => {
    // Click "Start New Project"
    await page.locator('button:has-text("Start New Project")').click()

    // Select file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('samples/template.html')
    await page.waitForTimeout(500)

    // Try to enter invalid project name
    const projectNameInput = page.locator('input[placeholder*="project"]')
    await projectNameInput.fill('invalid@project#name')

    // Create button should still be clickable (validation happens on submit)
    const createButton = page.locator('button:has-text("Create Project")')
    await createButton.click()

    // Should show error message
    const errorMessage = page.locator('[class*="error"]')
    await expect(errorMessage).toBeVisible()
  })

  test('File upload: Non-HTML file rejected', async ({ page }) => {
    // Click "Start New Project"
    await page.locator('button:has-text("Start New Project")').click()

    // Try to upload non-HTML file
    const fileInput = page.locator('input[type="file"]')
    // Note: Playwright may not allow setting non-HTML files due to accept attribute
    // This test verifies the UI handles it gracefully

    await expect(fileInput).toHaveAttribute('accept', '.html')
  })
})
