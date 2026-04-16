# Phase 5 Playwright E2E Test Guide

## Overview

This guide walks you through running the Playwright E2E test for Phase 5: Load Existing Flows from Dashboard.

**Test File**: `e2e/phase-5-load-existing-flow.spec.js`

---

## Prerequisites

### 1. Install Playwright (if not already installed)
```bash
npm install -D @playwright/test
```

### 2. Start the Development Server

In **Terminal 1**, start the backend and frontend:
```bash
npm run dev
```

This will start:
- Backend: http://localhost:3001
- Frontend: http://localhost:5173

Wait for both to be ready (you should see "ready in X ms").

---

## Running the Test

### Option 1: Run All Phase 5 Tests
```bash
npx playwright test e2e/phase-5-load-existing-flow.spec.js
```

### Option 2: Run a Specific Test
```bash
# Run only the complete workflow test
npx playwright test e2e/phase-5-load-existing-flow.spec.js -g "Complete workflow"

# Run only the load flow test
npx playwright test e2e/phase-5-load-existing-flow.spec.js -g "Load existing flow"
```

### Option 3: Run with UI (Visual Mode)
```bash
npx playwright test e2e/phase-5-load-existing-flow.spec.js --ui
```

This opens an interactive test runner where you can:
- Watch tests run in real-time
- Step through each test
- See what the browser is doing
- Debug failures

### Option 4: Run with Headed Browser (See the Browser)
```bash
npx playwright test e2e/phase-5-load-existing-flow.spec.js --headed
```

This runs the tests but keeps the browser window visible so you can see what's happening.

---

## What Each Test Does

### Test 1: Upload Template
- Opens the app
- Selects "HTML Visual Flow"
- Uploads initiative_template_v4.html
- Verifies upload was successful

### Test 2: Assign Zones
- Continues from upload
- Looks for zone assignment UI
- Assigns a zone with key "initiative_title"
- Verifies zone is assigned

### Test 3: Create Project
- Uploads template via file input
- Fills in project name
- Clicks "Create Project"
- Verifies project was created

### Test 4: Load Existing Flow (Dashboard Simulation)
- Creates a project via API
- Calls the load-flow endpoint
- Verifies:
  - `isExistingFlow = true`
  - Template HTML is returned
  - Zones are restored
  - Slide count is correct

### Test 5: Generate Recipe
- Creates a project
- Calls generate-recipe endpoint
- Verifies recipe is generated correctly
- Checks that recipe contains "BLOCK ZONES"

### Test 6: Validate JSON
- Creates a project
- Generates a test JSON with zone values
- Calls validate-json endpoint
- Verifies validation passes

### Test 7: Complete Workflow (Most Important)
- Runs the entire workflow end-to-end:
  1. Upload template
  2. Create project with 2 zones
  3. Load existing flow
  4. Generate recipe
  5. Validate JSON
- Verifies each step succeeds
- Shows detailed console output

---

## Expected Output

When you run the complete workflow test, you should see:

```
1️⃣  Uploading template...
   ✅ Template uploaded: 27734060...

2️⃣  Creating project with zones...
   ✅ Project created: PlaywrightE2E_1776373142675
   ✅ Flow created: flow-playwrighte2e-1776373142675-0f26d1a7

3️⃣  Loading existing flow from dashboard...
   ✅ Flow loaded successfully
   ✅ Template restored: 47992 bytes

4️⃣  Generating recipe...
   ✅ Recipe generated: 1346 bytes

5️⃣  Validating JSON...
   ✅ JSON validation passed

✅ COMPLETE WORKFLOW PASSED

🎉 Phase 5 is working correctly!
```

---

## Troubleshooting

### Issue: "Cannot connect to server"
**Solution**: Make sure `npm run dev` is running in Terminal 1

### Issue: "Template file not found"
**Solution**: Verify the template exists at `templates/initiative_template_v4.html`

### Issue: "Timeout waiting for element"
**Solution**: The app might be slow. Increase timeout:
```bash
npx playwright test e2e/phase-5-load-existing-flow.spec.js --timeout=30000
```

### Issue: "API request failed"
**Solution**: Check that the backend is running on port 3001

### Issue: "Test fails at step 4"
**Solution**: This might mean the load-flow endpoint has an issue. Check:
- Is the project directory created?
- Is the flow.json file present?
- Are the zones saved in flow._metadata?

---

## Debugging a Failing Test

### 1. Run with --debug flag
```bash
npx playwright test e2e/phase-5-load-existing-flow.spec.js --debug
```

This opens the Playwright Inspector where you can:
- Step through the test line by line
- Inspect elements
- See network requests
- Check console logs

### 2. Run with --headed flag
```bash
npx playwright test e2e/phase-5-load-existing-flow.spec.js --headed
```

Watch the browser window to see exactly what's happening.

### 3. Check the Test Report
After a test fails, Playwright generates a report:
```bash
npx playwright show-report
```

This shows:
- Which step failed
- Screenshots at failure point
- Video of the test run
- Network requests

---

## Understanding the Test Structure

The test uses **API calls** for most operations because:

1. **Faster**: API calls are faster than UI interactions
2. **Reliable**: Less dependent on UI element selectors
3. **Realistic**: Simulates what the dashboard would do
4. **Debuggable**: Easy to see what data is being sent/received

The workflow is:

```
Test Setup
  ↓
Upload Template (API)
  ↓
Create Project (API)
  ↓
Load Existing Flow (API) ← Key test
  ↓
Generate Recipe (API)
  ↓
Validate JSON (API)
  ↓
Assert Results
```

---

## Key Assertions

Each test verifies:

1. **Response Status**: HTTP 200 OK
2. **Response Data**: `ok: true`
3. **Data Integrity**: Required fields present
4. **Functionality**: Features work as expected

For example, the load-flow test checks:
```javascript
expect(loadData.ok).toBeTruthy();           // API succeeded
expect(loadData.isExistingFlow).toBeTruthy(); // Flow is marked as existing
expect(loadData.previewHtml).toBeTruthy();    // Template HTML returned
expect(loadData.previewHtml.length).toBeGreaterThan(0); // HTML has content
```

---

## Next Steps

If the test passes:
- ✅ Phase 5 is working correctly
- ✅ Users can open existing flows
- ✅ Templates load without errors
- ✅ Recipes generate successfully

If the test fails:
1. Check the error message
2. Run with `--headed` to see what's happening
3. Check the browser console for errors
4. Verify the backend is running correctly

---

## Running All E2E Tests

To run all E2E tests (including Phase 5):
```bash
npm run test:e2e
```

---

## Tips for Success

1. **Make sure the dev server is running**
   - Terminal 1: `npm run dev`
   - Wait for "ready in X ms" message

2. **Use --headed mode while debugging**
   ```bash
   npx playwright test e2e/phase-5-load-existing-flow.spec.js --headed
   ```

3. **Check console output**
   - Look for ✅ or ❌ indicators
   - Read error messages carefully

4. **Use --ui mode for interactive debugging**
   ```bash
   npx playwright test e2e/phase-5-load-existing-flow.spec.js --ui
   ```

---

## Questions?

If you encounter issues, check:
1. Is the dev server running? (`npm run dev`)
2. Is the template file present? (`templates/initiative_template_v4.html`)
3. Are there any backend errors? (Check Terminal 1)
4. Is port 3001 available? (Check `lsof -i :3001`)
5. Is port 5173 available? (Check `lsof -i :5173`)

---

**Document Version**: 1.0  
**Created**: 2026-04-16  
**Test File**: e2e/phase-5-load-existing-flow.spec.js
