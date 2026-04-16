# E2E Integration Test for HTML Flow

## Overview

A comprehensive end-to-end integration test has been created to verify the complete HTML flow and confirm that exported HTMLs are correctly saved in the project directory structure.

**Test File**: `server/__tests__/html-flow-e2e.test.js`

## What the Test Does

The test performs the complete HTML flow workflow:

1. **Upload Template** - Uploads an HTML template and receives a templateId
2. **Create Project** - Creates a project with selections and receives projectName and flowId
3. **Generate Recipe** - Generates an AI recipe using projectName and flowId
4. **Validate JSON** - Validates JSON response against zones
5. **Apply Content** - Applies content to the template and generates output HTML
6. **Create Export** - Creates an export from the output
7. **Verify Directory Structure** - Confirms all files are in the correct locations

## Key Assertions

The test verifies:

✅ **Directory Structure**:
```
server/projects/[projectName]/
└── flows/
    └── [flowId]/
        ├── flow.json
        ├── template.html
        ├── output-[roundId].html
        └── exports/
            └── [exportId]/
                ├── export.json
                ├── project.json
                ├── slide-1.html
                └── slide-2.html
```

✅ **flow.json Updates**:
- Contains `generations` array with applied content records
- Contains `exports` array with export metadata
- Contains `_metadata` with zones, selections, and repeatableSlides

✅ **Export Files**:
- `export.json` contains proper metadata (exportId, roundId, createdAt, slides)
- Individual slide HTMLs (slide-1.html, slide-2.html) are created
- `project.json` contains project index

✅ **No Exports in Chains**:
- Verifies that exports are NOT saved to the old chains directory

## Running the Test

### Prerequisites
1. Start the development server:
   ```bash
   npm start
   ```
   This will start both the backend (port 3001) and frontend (port 5173)

2. Wait for the server to fully initialize

### Execute the Test
```bash
npm test -- html-flow-e2e.test.js
```

### Expected Output
When the server is running, the test should produce:
```
Test Files  1 passed (1)
    Tests  17 passed (17)
```

## Test Structure

The test is organized into 7 describe blocks:

1. **Step 1: Upload Template** (1 test)
   - Verifies templateId is returned
   - Checks slideCount is correct

2. **Step 2: Create Project** (3 tests)
   - Verifies projectName and flowId are returned
   - Confirms flow.json is created with correct structure
   - Confirms template.html is saved to flow directory

3. **Step 3: Generate Recipe** (1 test)
   - Verifies recipe is generated using projectName/flowId

4. **Step 4: Validate JSON** (1 test)
   - Verifies JSON validation works with projectName/flowId

5. **Step 5: Apply Content** (3 tests)
   - Verifies output file is created
   - Confirms output file contains applied content
   - Verifies flow.json is updated with generation record

6. **Step 6: Create Export** (4 tests)
   - Verifies export is created
   - Confirms export directory structure
   - Verifies individual slide HTMLs exist
   - Validates export.json metadata

7. **Step 7: Verify Directory Structure** (3 tests)
   - Confirms full directory structure is correct
   - Verifies exports are NOT in chains directory
   - Confirms flow.json exports array is updated

8. **Complete Flow Summary** (1 test)
   - Final sanity check that all variables are defined

## Technical Details

### Test Data
- **HTML Template**: 2-section template with data-zone attributes
- **JSON Response**: Contains title, content, slide2_title, slide2_content
- **Project Name**: "E2ETestProject"

### API Endpoints Tested
- `POST /api/html-flow/upload-template`
- `POST /api/html-flow/create-project`
- `POST /api/html-flow/generate-recipe`
- `POST /api/html-flow/validate-json`
- `POST /api/html-flow/apply-content`
- `POST /api/projects/:projectName/flows/:flowId/exports`

### File System Verification
The test directly verifies file system operations:
- Checks that directories are created
- Reads and validates JSON files
- Confirms HTML content is correctly applied
- Verifies no exports exist in chains directory

## Continuous Integration

This test can be integrated into CI/CD pipelines:

```bash
# Start server in background
npm start &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Run the test
npm test -- html-flow-e2e.test.js
TEST_RESULT=$?

# Kill the server
kill $SERVER_PID

# Exit with test result
exit $TEST_RESULT
```

## Debugging

If the test fails:

1. **Check server is running**: `curl http://localhost:3001/api/projects`
2. **Check file permissions**: Ensure `server/projects` directory is writable
3. **Check logs**: Look for errors in the server console
4. **Verify test data**: The test creates files in `server/projects/E2ETestProject/`

## Future Enhancements

Potential improvements:
- Add cleanup to remove test project after test completes
- Add performance benchmarks
- Add stress tests with multiple concurrent exports
- Add tests for error conditions (invalid JSON, missing zones, etc.)
- Add tests for backward compatibility with chainId parameter
