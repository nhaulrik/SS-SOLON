/**
 * manual-test-phase5.js
 * 
 * Manual test that simulates the real user workflow:
 * 1. Read initiative_template_v4.html from disk
 * 2. Upload it to create a project
 * 3. Assign zones to elements
 * 4. Create the project
 * 5. Open the flow from dashboard (load-flow)
 * 6. Verify template loads
 * 7. Generate recipe
 * 8. Validate JSON
 * 
 * Run with: node manual-test-phase5.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'http://localhost:3001';
const TEMPLATE_PATH = path.join(__dirname, 'templates', 'initiative_template_v4.html');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'cyan');
  console.log('='.repeat(80));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

async function apiRequest(method, endpoint, body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    return {
      status: response.status,
      data,
      ok: response.ok,
    };
  } catch (err) {
    logError(`API request failed: ${err.message}`);
    throw err;
  }
}

async function main() {
  let templateId, projectName, flowId;

  try {
    logSection('PHASE 5 MANUAL TEST: Load Existing Flow from Dashboard');

    // ========================================
    // STEP 1: Read Template from Disk
    // ========================================
    logSection('STEP 1: Read Template from Disk');

    if (!fs.existsSync(TEMPLATE_PATH)) {
      logError(`Template not found at ${TEMPLATE_PATH}`);
      process.exit(1);
    }

    const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    logSuccess(`Template loaded: ${templateHtml.length} bytes`);
    log(`First 100 chars: ${templateHtml.substring(0, 100)}...`);

    // ========================================
    // STEP 2: Upload Template
    // ========================================
    logSection('STEP 2: Upload Template');

    log('Uploading template...');
    const uploadResponse = await apiRequest('POST', '/api/html-flow/upload-template', {
      html: templateHtml,
    });

    if (uploadResponse.status !== 200) {
      logError(`Upload failed with status ${uploadResponse.status}`);
      console.log(uploadResponse.data);
      process.exit(1);
    }

    templateId = uploadResponse.data.templateId;
    const slideCount = uploadResponse.data.slideCount;
    const trees = uploadResponse.data.trees;

    logSuccess(`Template uploaded successfully`);
    log(`  Template ID: ${templateId}`);
    log(`  Slide count: ${slideCount}`);
    log(`  Tree nodes: ${trees ? trees[0]?.length || 0 : 0}`);

    if (!templateId) {
      logError('No templateId in response');
      process.exit(1);
    }

    // ========================================
    // STEP 3: Assign Zones and Create Project
    // ========================================
    logSection('STEP 3: Assign Zones and Create Project');

    projectName = `ManualTest_${Date.now()}`;

    // Find some elements to assign zones to
    const selections = [
      {
        nodeId: 'div.slide-header>div.header-main>div.header-title-block>div.header-title',
        key: 'initiative_title',
        slideIndex: 0,
        type: 'block',
        autoGenerate: true,
      },
      {
        nodeId: 'div.slide-header>div.header-main>div.header-title-block>div.header-group-tag',
        key: 'initiative_group',
        slideIndex: 0,
        type: 'block',
        autoGenerate: true,
      },
      {
        nodeId: 'div.slide-body>div.panel-main>div>div.section-label',
        key: 'benefits_title',
        slideIndex: 0,
        type: 'block',
        autoGenerate: true,
      },
    ];

    log(`Creating project with ${selections.length} zone assignments...`);
    const createResponse = await apiRequest('POST', '/api/html-flow/create-project', {
      templateId,
      projectName,
      selections,
      repeatableSlides: [],
      fullSlideGeneration: [],
    });

    if (createResponse.status !== 200) {
      logError(`Create project failed with status ${createResponse.status}`);
      console.log(createResponse.data);
      process.exit(1);
    }

    projectName = createResponse.data.projectName;
    flowId = createResponse.data.flowId;
    const zones = createResponse.data.zones;

    logSuccess(`Project created successfully`);
    log(`  Project name: ${projectName}`);
    log(`  Flow ID: ${flowId}`);
    log(`  Zones created: ${zones.length}`);

    // ========================================
    // STEP 4: Load Existing Flow (Dashboard Open)
    // ========================================
    logSection('STEP 4: Load Existing Flow from Dashboard');

    log(`Loading flow: ${projectName} / ${flowId}...`);
    const loadResponse = await apiRequest(
      'GET',
      `/api/html-flow/load-flow?projectName=${projectName}&flowId=${flowId}`
    );

    if (loadResponse.status !== 200) {
      logError(`Load flow failed with status ${loadResponse.status}`);
      console.log(loadResponse.data);
      process.exit(1);
    }

    logSuccess(`Flow loaded successfully`);
    log(`  Is existing flow: ${loadResponse.data.isExistingFlow}`);
    log(`  Slide count: ${loadResponse.data.slideCount}`);
    log(`  Selections restored: ${loadResponse.data.selections.length}`);
    log(`  Trees restored: ${loadResponse.data.trees.length}`);

    if (!loadResponse.data.previewHtml) {
      logError('No previewHtml in load response');
      process.exit(1);
    }

    logSuccess(`Template HTML loaded: ${loadResponse.data.previewHtml.length} bytes`);

    // ========================================
    // STEP 5: Generate Recipe
    // ========================================
    logSection('STEP 5: Generate Recipe');

    log('Generating recipe from zones...');
    const recipeResponse = await apiRequest('POST', '/api/html-flow/generate-recipe', {
      projectName,
      flowId,
      globalPrompt: 'Create content for a software initiative roadmap slide',
    });

    if (recipeResponse.status !== 200) {
      logError(`Generate recipe failed with status ${recipeResponse.status}`);
      console.log(recipeResponse.data);
      process.exit(1);
    }

    const recipe = recipeResponse.data.recipe;

    logSuccess(`Recipe generated successfully`);
    log(`  Recipe length: ${recipe.length} bytes`);
    log(`  Recipe preview (first 500 chars):`);
    log(`  ---`);
    log(recipe.substring(0, 500));
    log(`  ---`);

    // ========================================
    // STEP 6: Validate JSON
    // ========================================
    logSection('STEP 6: Validate JSON Response');

    const testJson = {
      blocks: {
        initiative_title: { value: 'Registration Initiative' },
        initiative_group: { value: 'Core Revenue Management Capabilities' },
        benefits_title: { value: 'Key Investment Benefits' },
      },
    };

    log('Validating test JSON...');
    const validateResponse = await apiRequest('POST', '/api/html-flow/validate-json', {
      projectName,
      flowId,
      jsonString: JSON.stringify(testJson),
    });

    if (validateResponse.status !== 200) {
      logError(`Validate JSON failed with status ${validateResponse.status}`);
      console.log(validateResponse.data);
      process.exit(1);
    }

    logSuccess(`JSON validation completed`);
    log(`  Valid: ${validateResponse.data.valid}`);
    log(`  Found fields: ${validateResponse.data.foundFields?.length || 0}`);
    log(`  Missing fields: ${validateResponse.data.missingFields?.length || 0}`);

    if (validateResponse.data.missingFields?.length > 0) {
      logWarning(`Missing fields: ${validateResponse.data.missingFields.join(', ')}`);
    }

    if (!validateResponse.data.valid) {
      logError('JSON validation failed');
      console.log(validateResponse.data);
      process.exit(1);
    }

    // ========================================
    // SUCCESS SUMMARY
    // ========================================
    logSection('✅ ALL TESTS PASSED');

    log('\nWorkflow Summary:', 'green');
    log(`  1. ✅ Template uploaded: ${templateId.substring(0, 8)}...`);
    log(`  2. ✅ Project created: ${projectName}`);
    log(`  3. ✅ Flow created: ${flowId}`);
    log(`  4. ✅ Flow loaded from dashboard`);
    log(`  5. ✅ Template HTML restored (${loadResponse.data.previewHtml.length} bytes)`);
    log(`  6. ✅ Zones restored (${loadResponse.data.selections.length} zones)`);
    log(`  7. ✅ Recipe generated (${recipe.length} bytes)`);
    log(`  8. ✅ JSON validated successfully`);

    log('\n🎉 Phase 5 workflow is working correctly!', 'green');
    log('Users can now open existing flows from the dashboard without errors.', 'green');

  } catch (err) {
    logError(`Test failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

main();
