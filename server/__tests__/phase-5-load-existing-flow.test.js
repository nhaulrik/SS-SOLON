/**
 * server/__tests__/phase-5-load-existing-flow.test.js
 *
 * Integration test for Phase 5: Load Existing Flows from Dashboard
 *
 * Tests the complete workflow:
 * 1. Upload initiative_template_v4.html
 * 2. Create a new project with zone assignments
 * 3. Load the existing flow via the load-flow endpoint
 * 4. Verify template and zones are correctly restored
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');
const BASE_URL = 'http://localhost:3001';

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

describe('Phase 5: Load Existing Flow from Dashboard', () => {
  let templateId;
  let projectName;
  let flowId;
  let templateHtml;

  // Read the initiative template
  beforeAll(() => {
    const templatePath = path.join(PROJECT_ROOT, 'templates', 'initiative_template_v4.html');
    expect(fs.existsSync(templatePath)).toBe(true);
    templateHtml = fs.readFileSync(templatePath, 'utf8');
    expect(templateHtml.length).toBeGreaterThan(0);
  });

  describe('Step 1: Upload Initiative Template', () => {
    it('should upload initiative_template_v4.html and return templateId', async () => {
      const response = await apiRequest('POST', '/api/html-flow/upload-template', {
        html: templateHtml,
      });

      console.log('Upload response status:', response.status);
      console.log('Upload response data:', JSON.stringify(response.data, null, 2));

      expect(response.status).toBe(200);
      expect(response.data.ok).toBe(true);
      expect(response.data.templateId).toBeDefined();
      expect(response.data.slideCount).toBeGreaterThan(0);
      expect(response.data.tree).toBeDefined();

      templateId = response.data.templateId;
    });

    it('should have extracted DOM tree from template', () => {
      expect(templateId).toBeDefined();
      expect(templateId.length).toBeGreaterThan(0);
    });
  });

  describe('Step 2: Create Project with Zone Assignments', () => {
    it('should create project and return projectName and flowId', async () => {
      const response = await apiRequest('POST', '/api/html-flow/create-project', {
        templateId,
        projectName: `Phase5Test_${Date.now()}`,
        selections: [
          {
            nodeId: 'div.header-title',
            key: 'slide_title',
            slideIndex: 0,
            type: 'block',
            autoGenerate: true,
          },
          {
            nodeId: 'div.header-group-tag',
            key: 'group_tag',
            slideIndex: 0,
            type: 'block',
            autoGenerate: true,
          },
        ],
        repeatableSlides: [],
        fullSlideGeneration: [],
      });

      console.log('Create project response status:', response.status);
      console.log('Create project response:', JSON.stringify(response.data, null, 2));

      expect(response.status).toBe(200);
      expect(response.data.ok).toBe(true);
      expect(response.data.projectName).toBeDefined();
      expect(response.data.flowId).toBeDefined();
      expect(response.data.zones).toBeDefined();
      expect(response.data.zones.length).toBeGreaterThan(0);

      projectName = response.data.projectName;
      flowId = response.data.flowId;
    });

    it('should create flow.json in correct directory', () => {
      const flowJsonPath = path.join(
        PROJECT_ROOT,
        'server/projects',
        projectName,
        'flows',
        flowId,
        'flow.json'
      );

      expect(fs.existsSync(flowJsonPath)).toBe(true);

      const flow = JSON.parse(fs.readFileSync(flowJsonPath, 'utf8'));
      expect(flow._metadata).toBeDefined();
      expect(flow._metadata.zones).toBeDefined();
      expect(flow._metadata.zones.length).toBeGreaterThan(0);
    });

    it('should create template.html in flow directory', () => {
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
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('<!DOCTYPE html>');
    });
  });

  describe('Step 3: Load Existing Flow via Dashboard', () => {
    it('should load flow via GET /api/html-flow/load-flow', async () => {
      const response = await apiRequest('GET', `/api/html-flow/load-flow?projectName=${projectName}&flowId=${flowId}`);

      console.log('Load flow response status:', response.status);
      console.log('Load flow response keys:', Object.keys(response.data));

      expect(response.status).toBe(200);
      expect(response.data.ok).toBe(true);
      expect(response.data.projectName).toBe(projectName);
      expect(response.data.flowId).toBe(flowId);
      expect(response.data.isExistingFlow).toBe(true);
    });

    it('should return previewHtml', async () => {
      const response = await apiRequest('GET', `/api/html-flow/load-flow?projectName=${projectName}&flowId=${flowId}`);

      expect(response.data.previewHtml).toBeDefined();
      expect(response.data.previewHtml.length).toBeGreaterThan(0);
      expect(response.data.previewHtml).toContain('<!DOCTYPE html>');
    });

    it('should return DOM trees', async () => {
      const response = await apiRequest('GET', `/api/html-flow/load-flow?projectName=${projectName}&flowId=${flowId}`);

      expect(response.data.trees).toBeDefined();
      expect(Array.isArray(response.data.trees)).toBe(true);
      expect(response.data.trees.length).toBeGreaterThan(0);
    });

    it('should return selections from existing zones', async () => {
      const response = await apiRequest('GET', `/api/html-flow/load-flow?projectName=${projectName}&flowId=${flowId}`);

      expect(response.data.selections).toBeDefined();
      expect(Array.isArray(response.data.selections)).toBe(true);
      // Should have at least the zones we created
      expect(response.data.selections.length).toBeGreaterThanOrEqual(2);
    });

    it('should return violations without NO_ZONES errors', async () => {
      const response = await apiRequest('GET', `/api/html-flow/load-flow?projectName=${projectName}&flowId=${flowId}`);

      // violations might be undefined if there are none, or an array
      if (response.data.violations) {
        console.log('Violations found:', response.data.violations);
        
        // Should NOT have NO_ZONES violations for existing flows
        const noZonesViolations = response.data.violations.filter(
          v => v.type === 'NO_ZONES'
        );
        expect(noZonesViolations.length).toBe(0);
      }
    });

    it('should return slideCount', async () => {
      const response = await apiRequest('GET', `/api/html-flow/load-flow?projectName=${projectName}&flowId=${flowId}`);

      expect(response.data.slideCount).toBeDefined();
      expect(response.data.slideCount).toBeGreaterThan(0);
    });
  });

  describe('Step 4: Validate Zone Assignment Steps', () => {
    it('should have selections with correct properties', async () => {
      const response = await apiRequest('GET', `/api/html-flow/load-flow?projectName=${projectName}&flowId=${flowId}`);

      const selections = response.data.selections;
      expect(selections.length).toBeGreaterThan(0);

      selections.forEach(selection => {
        expect(selection.key).toBeDefined();
        expect(selection.nodeId).toBeDefined();
        expect(selection.slideIndex).toBeDefined();
        expect(selection.type).toBeDefined();
      });
    });

    it('should be able to enter recipe generation without errors', async () => {
      // Load the flow first
      const loadResponse = await apiRequest('GET', `/api/html-flow/load-flow?projectName=${projectName}&flowId=${flowId}`);
      expect(loadResponse.status).toBe(200);
      expect(loadResponse.data.ok).toBe(true);

      // Now try to generate recipe
      const recipeResponse = await apiRequest('POST', '/api/html-flow/generate-recipe', {
        projectName,
        flowId,
        globalPrompt: 'Test prompt',
      });

      console.log('Recipe generation response status:', recipeResponse.status);
      if (recipeResponse.status !== 200) {
        console.log('Recipe generation error:', JSON.stringify(recipeResponse.data, null, 2));
      }

      expect(recipeResponse.status).toBe(200);
      expect(recipeResponse.data.ok).toBe(true);
      expect(recipeResponse.data.recipe).toBeDefined();
      expect(recipeResponse.data.recipe.length).toBeGreaterThan(0);
    });

    it('should be able to validate JSON against zones', async () => {
      // First generate recipe to understand the expected format
      const recipeResponse = await apiRequest('POST', '/api/html-flow/generate-recipe', {
        projectName,
        flowId,
        globalPrompt: '',
      });

      expect(recipeResponse.status).toBe(200);
      expect(recipeResponse.data.recipe).toBeDefined();

      // Create test JSON matching the expected structure (blocks format)
      const testJson = {
        blocks: {
          slide_title: { value: 'Test Title' },
          group_tag: { value: 'TEST TAG' },
        },
      };

      const validateResponse = await apiRequest('POST', '/api/html-flow/validate-json', {
        projectName,
        flowId,
        jsonString: JSON.stringify(testJson),
      });

      console.log('Validate JSON response status:', validateResponse.status);
      if (validateResponse.status !== 200) {
        console.log('Validate JSON error:', JSON.stringify(validateResponse.data, null, 2));
      }

      expect(validateResponse.status).toBe(200);
      expect(validateResponse.data.ok).toBe(true);
      expect(validateResponse.data.valid).toBe(true);
    });
  });

  describe('Step 5: Verify Complete Workflow', () => {
    it('should complete entire flow without errors', async () => {
      // 1. Load flow
      const loadResponse = await apiRequest('GET', `/api/html-flow/load-flow?projectName=${projectName}&flowId=${flowId}`);
      expect(loadResponse.status).toBe(200);
      expect(loadResponse.data.ok).toBe(true);
      expect(loadResponse.data.isExistingFlow).toBe(true);

      // 2. Generate recipe
      const recipeResponse = await apiRequest('POST', '/api/html-flow/generate-recipe', {
        projectName,
        flowId,
      });
      expect(recipeResponse.status).toBe(200);
      expect(recipeResponse.data.ok).toBe(true);
      expect(recipeResponse.data.recipe).toBeDefined();

      // 3. Validate JSON
      const testJson = {
        blocks: {
          slide_title: { value: 'Initiative Title' },
          group_tag: { value: 'STRATEGIC' },
        },
      };

      const validateResponse = await apiRequest('POST', '/api/html-flow/validate-json', {
        projectName,
        flowId,
        jsonString: JSON.stringify(testJson),
      });
      expect(validateResponse.status).toBe(200);
      expect(validateResponse.data.ok).toBe(true);
      expect(validateResponse.data.valid).toBe(true);

      console.log('✅ Complete workflow successful');
      console.log(`   Project: ${projectName}`);
      console.log(`   Flow: ${flowId}`);
      console.log(`   Selections: ${loadResponse.data.selections.length}`);
      console.log(`   Slides: ${loadResponse.data.slideCount}`);
      console.log(`   Recipe generated: ${recipeResponse.data.recipe.length} chars`);
      console.log(`   JSON validation: PASSED`);
    });
  });
});
