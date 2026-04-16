/**
 * server/__tests__/html-flow-e2e.test.js
 *
 * End-to-end integration test for the complete HTML flow:
 * Upload Template -> Create Project -> Generate Recipe -> Apply Content -> Create Export
 *
 * Tests that exported HTMLs are correctly saved in:
 * server/projects/[projectName]/flows/[flowId]/exports/[exportId]/
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Use native fetch (available in Node 18+)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');
const BASE_URL = 'http://localhost:3001';

// Test data
const HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
    <title>E2E Test Template</title>
    <style>
        body { font-family: Arial; margin: 20px; }
        section { page-break-after: always; padding: 20px; border: 1px solid #ccc; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <section>
        <h1 data-zone="title">Title Placeholder</h1>
        <p data-zone="content">Content placeholder</p>
    </section>
    <section>
        <h2 data-zone="slide2_title">Slide 2 Title</h2>
        <p data-zone="slide2_content">Slide 2 Content</p>
    </section>
</body>
</html>`;

const JSON_RESPONSE = {
  title: 'Test Title',
  content: 'Test content body',
  slide2_title: 'Second Slide',
  slide2_content: 'Second slide content'
};

const PROJECT_NAME = 'E2ETestProject';

// Helper to make API requests
async function apiRequest(method, endpoint, body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  return {
    status: response.status,
    data,
  };
}

describe('HTML Flow E2E Tests', () => {
  let templateId;
  let projectName;
  let flowId;
  let outputFile;
  let roundId;
  let exportId;

  describe('Step 1: Upload Template', () => {
    it('should upload HTML template and return templateId', async () => {
      const response = await apiRequest('POST', '/api/html-flow/upload-template', {
        html: HTML_TEMPLATE,
      });

      expect(response.status).toBe(200);
      expect(response.data.ok).toBe(true);
      expect(response.data.templateId).toBeDefined();
      expect(response.data.slideCount).toBe(2);

      templateId = response.data.templateId;
    });
  });

  describe('Step 2: Create Project', () => {
    it('should create project and return projectName and flowId', async () => {
      const response = await apiRequest('POST', '/api/html-flow/create-project', {
        templateId,
        projectName: PROJECT_NAME,
        selections: [
          {
            nodeId: 'h1',
            key: 'title',
            slideIndex: 0,
            type: 'leaf',
            autoGenerate: true,
          },
          {
            nodeId: 'p',
            key: 'content',
            slideIndex: 0,
            type: 'leaf',
            autoGenerate: true,
          },
          {
            nodeId: 'h2',
            key: 'slide2_title',
            slideIndex: 1,
            type: 'leaf',
            autoGenerate: true,
          },
          {
            nodeId: 'p[1]',
            key: 'slide2_content',
            slideIndex: 1,
            type: 'leaf',
            autoGenerate: true,
          },
        ],
        repeatableSlides: [],
        fullSlideGeneration: [],
      });

      expect(response.status).toBe(200);
      expect(response.data.ok).toBe(true);
      expect(response.data.projectName).toBe(PROJECT_NAME);
      expect(response.data.flowId).toBeDefined();
      expect(response.data.zones).toBeDefined();
      expect(response.data.zones.length).toBeGreaterThan(0);

      projectName = response.data.projectName;
      flowId = response.data.flowId;
    });

    it('should create flow.json in the correct directory', () => {
      const flowJsonPath = path.join(
        PROJECT_ROOT,
        'server/projects',
        projectName,
        'flows',
        flowId,
        'flow.json'
      );

      expect(fs.existsSync(flowJsonPath)).toBe(true);

      const flowData = JSON.parse(fs.readFileSync(flowJsonPath, 'utf8'));
      expect(flowData.flowId).toBe(flowId);
      expect(flowData.status).toBe('active');
      expect(flowData._metadata).toBeDefined();
      expect(flowData._metadata.zones).toBeDefined();
    });

    it('should create template.html in the flow directory', () => {
      const templatePath = path.join(
        PROJECT_ROOT,
        'server/projects',
        projectName,
        'flows',
        flowId,
        'template.html'
      );

      expect(fs.existsSync(templatePath)).toBe(true);
      const content = fs.readFileSync(templatePath, 'utf8');
      expect(content).toContain('data-zone');
    });
  });

  describe('Step 3: Generate Recipe', () => {
    it('should generate recipe using projectName and flowId', async () => {
      const response = await apiRequest('POST', '/api/html-flow/generate-recipe', {
        projectName,
        flowId,
        globalPrompt: 'Test prompt',
      });

      expect(response.status).toBe(200);
      expect(response.data.ok).toBe(true);
      expect(response.data.recipe).toBeDefined();
      expect(response.data.recipe.length).toBeGreaterThan(0);
    });
  });

  describe('Step 4: Validate JSON', () => {
    it('should validate JSON response against zones', async () => {
      const response = await apiRequest('POST', '/api/html-flow/validate-json', {
        projectName,
        flowId,
        jsonString: JSON.stringify(JSON_RESPONSE),
      });

      expect(response.status).toBe(200);
      expect(response.data.ok).toBe(true);
      expect(response.data.valid).toBe(true);
    });
  });

  describe('Step 5: Apply Content', () => {
    it('should apply content and save output file to flow directory', async () => {
      const response = await apiRequest('POST', '/api/html-flow/apply-content', {
        projectName,
        flowId,
        jsonString: JSON.stringify(JSON_RESPONSE),
      });

      expect(response.status).toBe(200);
      expect(response.data.ok).toBe(true);
      expect(response.data.outputFile).toBeDefined();
      expect(response.data.roundId).toBeDefined();
      expect(response.data.slideCount).toBe(2);

      outputFile = response.data.outputFile;
      roundId = response.data.roundId;
    });

    it('should save output HTML file to flow directory', () => {
      const outputPath = path.join(
        PROJECT_ROOT,
        'server/projects',
        projectName,
        'flows',
        flowId,
        outputFile
      );

      expect(fs.existsSync(outputPath)).toBe(true);

      const content = fs.readFileSync(outputPath, 'utf8');
      expect(content).toContain('Test Title');
      expect(content).toContain('Test content body');
      expect(content).toContain('Second Slide');
      expect(content).toContain('Second slide content');
    });

    it('should update flow.json with generation record', () => {
      const flowJsonPath = path.join(
        PROJECT_ROOT,
        'server/projects',
        projectName,
        'flows',
        flowId,
        'flow.json'
      );

      const flowData = JSON.parse(fs.readFileSync(flowJsonPath, 'utf8'));
      expect(flowData.generations).toBeDefined();
      expect(flowData.generations.length).toBeGreaterThan(0);

      const latestGen = flowData.generations[flowData.generations.length - 1];
      expect(latestGen.id).toBe(roundId);
      expect(latestGen.outputFile).toBe(outputFile);
    });
  });

  describe('Step 6: Create Export', () => {
    it('should create export and save to projects/flows/exports directory', async () => {
      const response = await apiRequest(
        'POST',
        `/api/projects/${projectName}/flows/${flowId}/exports`,
        {
          roundId,
          outputFile,
          slideMetadata: [
            { slideId: 'slide-1', name: 'Slide 1', type: 'content' },
            { slideId: 'slide-2', name: 'Slide 2', type: 'content' },
          ],
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.ok).toBe(true);
      expect(response.data.exportId).toBeDefined();
      expect(response.data.exportNumber).toBe(1);

      exportId = response.data.exportId;
    });

    it('should create export directory with correct structure', () => {
      const exportDir = path.join(
        PROJECT_ROOT,
        'server/projects',
        projectName,
        'flows',
        flowId,
        'exports',
        exportId
      );

      expect(fs.existsSync(exportDir)).toBe(true);

      // Check for required files
      const exportJsonPath = path.join(exportDir, 'export.json');
      const projectJsonPath = path.join(exportDir, 'project.json');

      expect(fs.existsSync(exportJsonPath)).toBe(true);
      expect(fs.existsSync(projectJsonPath)).toBe(true);
    });

    it('should save individual slide HTMLs in export directory', () => {
      const exportDir = path.join(
        PROJECT_ROOT,
        'server/projects',
        projectName,
        'flows',
        flowId,
        'exports',
        exportId
      );

      const slide1Path = path.join(exportDir, 'slide-1.html');
      const slide2Path = path.join(exportDir, 'slide-2.html');

      expect(fs.existsSync(slide1Path)).toBe(true);
      expect(fs.existsSync(slide2Path)).toBe(true);

      const slide1Content = fs.readFileSync(slide1Path, 'utf8');
      const slide2Content = fs.readFileSync(slide2Path, 'utf8');

      expect(slide1Content).toContain('Test Title');
      expect(slide2Content).toContain('Second Slide');
    });

    it('should contain valid export.json metadata', () => {
      const exportJsonPath = path.join(
        PROJECT_ROOT,
        'server/projects',
        projectName,
        'flows',
        flowId,
        'exports',
        exportId,
        'export.json'
      );

      const exportData = JSON.parse(fs.readFileSync(exportJsonPath, 'utf8'));

      expect(exportData.exportId).toBe(exportId);
      expect(exportData.exportNumber).toBe(1);
      expect(exportData.createdAt).toBeDefined();
      expect(exportData.source.roundId).toBe(roundId);
      expect(exportData.source.outputFile).toBe(outputFile);
      expect(exportData.content.slideCount).toBe(2);
      expect(exportData.content.slides.length).toBe(2);
      expect(exportData.metadata.projectName).toBe(projectName);
      expect(exportData.metadata.flowId).toBe(flowId);
    });
  });

  describe('Step 7: Verify Directory Structure', () => {
    it('should have correct full directory structure', () => {
      const projectDir = path.join(PROJECT_ROOT, 'server/projects', projectName);
      const flowDir = path.join(projectDir, 'flows', flowId);
      const exportsDir = path.join(flowDir, 'exports');
      const exportDir = path.join(exportsDir, exportId);

      expect(fs.existsSync(projectDir)).toBe(true);
      expect(fs.existsSync(flowDir)).toBe(true);
      expect(fs.existsSync(exportsDir)).toBe(true);
      expect(fs.existsSync(exportDir)).toBe(true);
    });

    it('should NOT have exports in chains directory', () => {
      const chainsDir = path.join(PROJECT_ROOT, 'server/chains');
      if (fs.existsSync(chainsDir)) {
        const chainDirs = fs.readdirSync(chainsDir);
        for (const chainDir of chainDirs) {
          const exportsPath = path.join(chainsDir, chainDir, 'exports');
          if (fs.existsSync(exportsPath)) {
            const exports = fs.readdirSync(exportsPath);
            // Should not find our export in chains
            expect(exports).not.toContain(exportId);
          }
        }
      }
    });

    it('should update flow.json with export entry', () => {
      const flowJsonPath = path.join(
        PROJECT_ROOT,
        'server/projects',
        projectName,
        'flows',
        flowId,
        'flow.json'
      );

      const flowData = JSON.parse(fs.readFileSync(flowJsonPath, 'utf8'));
      expect(flowData.exports).toBeDefined();
      expect(flowData.exports.length).toBeGreaterThan(0);

      const exportEntry = flowData.exports.find((e) => e.exportId === exportId);
      expect(exportEntry).toBeDefined();
      expect(exportEntry.exportNumber).toBe(1);
      expect(exportEntry.roundId).toBe(roundId);
      expect(exportEntry.path).toBe('exports/' + exportId + '/');
    });
  });

  describe('Complete Flow Summary', () => {
    it('should complete entire flow without errors', () => {
      expect(templateId).toBeDefined();
      expect(projectName).toBe(PROJECT_NAME);
      expect(flowId).toBeDefined();
      expect(outputFile).toBeDefined();
      expect(roundId).toBeDefined();
      expect(exportId).toBeDefined();

      // Verify directory structure
      const exportDir = path.join(
        PROJECT_ROOT,
        'server/projects',
        projectName,
        'flows',
        flowId,
        'exports',
        exportId
      );

      expect(fs.existsSync(exportDir)).toBe(true);

      // Count files in export directory
      const files = fs.readdirSync(exportDir);
      expect(files.length).toBeGreaterThanOrEqual(4); // export.json, project.json, slide-1.html, slide-2.html
    });
  });
});
