#!/usr/bin/env node
/**
 * Test the complete HTML flow: upload -> create project -> generate recipe -> apply content -> export
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'http://localhost:3001';

// Helper function to make HTTP requests
function makeRequest(method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err.message);
      reject(err);
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('🧪 Testing HTML Flow\n');

  try {
    // Step 1: Create a simple HTML template
    console.log('Step 1: Creating HTML template...');
    const htmlTemplate = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <section>
    <h1 data-zone="title">Title</h1>
    <p data-zone="content">Content</p>
  </section>
</body>
</html>`;

    // Step 2: Upload template
    console.log('Step 2: Uploading template...');
    const uploadRes = await makeRequest('POST', '/api/html-flow/upload-template', { html: htmlTemplate });
    if (uploadRes.status !== 200) {
      console.error('❌ Upload failed:', uploadRes.data);
      return;
    }
    const { templateId, slideCount } = uploadRes.data;
    console.log(`✅ Template uploaded: templateId=${templateId}, slideCount=${slideCount}\n`);

    // Step 3: Create project
    console.log('Step 3: Creating project...');
    const projectRes = await makeRequest('POST', '/api/html-flow/create-project', {
      templateId,
      selections: [
        { nodeId: 'h1', key: 'title', slideIndex: 0, type: 'leaf', autoGenerate: true },
        { nodeId: 'p', key: 'content', slideIndex: 0, type: 'leaf', autoGenerate: true },
      ],
      projectName: 'TestProject',
      repeatableSlides: [],
      fullSlideGeneration: [],
    });
    if (projectRes.status !== 200) {
      console.error('❌ Project creation failed:', projectRes.data);
      return;
    }
    const { projectName, flowId, zones } = projectRes.data;
    console.log(`✅ Project created: projectName=${projectName}, flowId=${flowId}`);
    console.log(`   Zones: ${zones.length}\n`);

    // Step 4: Generate recipe
    console.log('Step 4: Generating recipe...');
    const recipeRes = await makeRequest('POST', '/api/html-flow/generate-recipe', {
      projectName,
      flowId,
      globalPrompt: 'Test prompt',
    });
    if (recipeRes.status !== 200) {
      console.error('❌ Recipe generation failed:', recipeRes.data);
      return;
    }
    console.log(`✅ Recipe generated\n`);

    // Step 5: Validate JSON
    console.log('Step 5: Validating JSON response...');
    const jsonResponse = JSON.stringify({
      title: 'My Title',
      content: 'My Content',
    });
    const validateRes = await makeRequest('POST', '/api/html-flow/validate-json', {
      projectName,
      flowId,
      jsonString: jsonResponse,
    });
    if (validateRes.status !== 200) {
      console.error('❌ Validation failed:', validateRes.data);
      return;
    }
    console.log(`✅ JSON validated: valid=${validateRes.data.valid}\n`);

    // Step 6: Apply content
    console.log('Step 6: Applying content...');
    const applyRes = await makeRequest('POST', '/api/html-flow/apply-content', {
      projectName,
      flowId,
      jsonString: jsonResponse,
    });
    if (applyRes.status !== 200) {
      console.error('❌ Apply content failed:', applyRes.data);
      return;
    }
    const { outputFile, roundId } = applyRes.data;
    console.log(`✅ Content applied: outputFile=${outputFile}, roundId=${roundId}\n`);

    // Step 7: Verify output file exists
    console.log('Step 7: Verifying output file...');
    const flowDir = path.join(__dirname, 'server/projects', projectName, 'flows', flowId);
    const outputPath = path.join(flowDir, outputFile);
    if (fs.existsSync(outputPath)) {
      console.log(`✅ Output file exists at: ${outputPath}`);
      const stats = fs.statSync(outputPath);
      console.log(`   File size: ${stats.size} bytes\n`);
    } else {
      console.error(`❌ Output file not found at: ${outputPath}\n`);
      return;
    }

    // Step 8: Verify flow.json was updated
    console.log('Step 8: Verifying flow.json...');
    const flowPath = path.join(flowDir, 'flow.json');
    if (fs.existsSync(flowPath)) {
      const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
      console.log(`✅ flow.json exists`);
      console.log(`   Generations: ${flow.generations?.length || 0}`);
      if (flow.generations?.length > 0) {
        console.log(`   Latest generation: ${flow.generations[0].id}\n`);
      }
    } else {
      console.error(`❌ flow.json not found at: ${flowPath}\n`);
      return;
    }

    console.log('✅ All tests passed! Flow is working correctly.\n');

  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

test();
