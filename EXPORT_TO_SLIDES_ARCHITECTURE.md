# Export to Slides Feature - Architecture & Implementation

## Overview

The "export to slides" feature converts a generation round's patched HTML output into a versioned export containing individual slide files. This document details where the feature is implemented, how output projects are determined, and where files are written.

---

## 1. Feature Implementation Files

### Core Implementation

**File: `server/lib/export-manager.js` (641 lines)**
- **Purpose**: Manages versioned exports for HTML flows
- **Key Function**: `createExport(projectName, flowId, roundId, outputFile, slideMetadata = [])`
- **Lines**: 179-333

**File: `server/routes/html-flow.js` (1853 lines)**
- **Purpose**: Express router handling all HTML flow API endpoints
- **Export Endpoint**: `POST /api/projects/:projectName/flows/:flowId/exports` (lines 1283-1313)
- **Apply Content Endpoint**: `POST /api/html-flow/apply-content` (lines 765-888)

**File: `client/src/components/ExportDialog.jsx` (179 lines)**
- **Purpose**: React modal dialog for exporting slides with metadata editing
- **Main Handler**: `handleExport()` (lines 45-77)

---

## 2. How Output Project/Directory is Determined

### Flow: Apply Content → Determine Output Location

**Endpoint: `POST /api/html-flow/apply-content` (lines 765-888 in html-flow.js)**

The output location is determined by request parameters:

```javascript
// Lines 767-814: Parameter validation
const { chainId, projectName, flowId, jsonString } = req.body;

if (projectName && flowId) {
  // NEW PATH: Project/Flow structure
  flowDir = path.join(PROJECTS_DIR, projectName, 'flows', flowId);
  // Validates projectName and flowId with regex: /^[\w-]{1,100}$/
  // Reads flow.json from: projects/<projectName>/flows/<flowId>/flow.json
} else if (chainId) {
  // OLD PATH: Chain structure (backward compatibility)
  chainDir = resolveChainDir(chainId);
  // Reads chain.json from: chains/<chainId>/chain.json
}
```

### Output File Naming

```javascript
// Lines 825-826
const roundId    = randomUUID();
const outputFile = `output-${roundId}.html`;
```

Output file is named `output-<UUID>.html` where UUID is the roundId.

### File Writing Location

**For Project/Flow (NEW PATH):**
```javascript
// Lines 830-846
if (projectName && flowId) {
  outputPath = path.join(flowDir, outputFile);
  fs.writeFileSync(outputPath, patchedHtml, 'utf8');
  
  // Update flow.json with generation record
  const flowPath = path.join(flowDir, 'flow.json');
  const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
  const generation = {
    id: roundId,
    appliedAt: new Date().toISOString(),
    outputFile,
    jsonInput: jsonString.slice(0, 2000),
  };
  flow.generations = [...(flow.generations || []), generation];
  flow.updatedAt = new Date().toISOString();
  fs.writeFileSync(flowPath, JSON.stringify(flow, null, 2), 'utf8');
}
```

**For Chain (OLD PATH - backward compatibility):**
```javascript
// Lines 847-873
else if (chainId) {
  outputPath = path.join(chainDir, outputFile);
  fs.writeFileSync(outputPath, patchedHtml, 'utf8');
  
  // Update chain.json with round record
  const chainPath = path.join(chainDir, 'chain.json');
  const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
  const round = {
    id: roundId,
    appliedAt: new Date().toISOString(),
    outputFile,
    jsonInput: jsonString.slice(0, 2000),
  };
  chain.rounds = [...(chain.rounds || []), round];
  chain.updatedAt = new Date().toISOString();
  fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2), 'utf8');
  
  recordRound(chainId, roundId, jsonString, outputFile, validationResult);
}
```

---

## 3. Export Creation Flow

### Step 1: Client Initiates Export

**File: `client/src/components/ExportDialog.jsx` (lines 45-77)**

```javascript
const handleExport = useCallback(async () => {
  setIsExporting(true);
  try {
    const response = await fetch(`/api/projects/${projectName}/flows/${flowId}/exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roundId,          // From apply-content response
        outputFile,       // From apply-content response
        slideMetadata: metadata,  // User-edited slide metadata
      }),
    });
    
    const result = await response.json();
    // result contains: { ok, exportId, exportNumber, slideCount, createdAt }
  }
}, [projectName, flowId, roundId, outputFile, metadata, onExported, onClose, setToast]);
```

### Step 2: Server Creates Export

**File: `server/routes/html-flow.js` (lines 1283-1313)**

```javascript
router.post('/projects/:projectName/flows/:flowId/exports', (req, res) => {
  const { projectName, flowId } = req.params;
  const { roundId, outputFile, slideMetadata } = req.body;
  
  // Validate inputs
  if (!roundId || !outputFile) {
    return res.status(400).json({ ok: false, error: 'roundId and outputFile are required.' });
  }
  
  // Call core export function
  const result = createExport(projectName, flowId, roundId, outputFile, slideMetadata || []);
  
  // Return export metadata
  return res.status(201).json({
    ok: true,
    exportId: result.exportId,
    exportNumber: result.exportNumber,
    slideCount: result.slideCount,
    createdAt: result.createdAt,
  });
});
```

### Step 3: Export Manager Processes Files

**File: `server/lib/export-manager.js` (lines 179-333)**

The `createExport()` function:

1. Validates all required parameters
2. Loads and verifies flow.json exists
3. Validates output file exists at expected path
4. Reads patched HTML and extracts sections
5. Determines export number (sequential per flow)
6. **Creates export directory**: `projects/<projectName>/flows/<flowId>/exports/export-<N>/`
7. **Writes individual slide files**: `slide-1.html`, `slide-2.html`, etc.
8. **Writes export.json**: Complete export metadata
9. **Writes project.json**: Slide index
10. **Updates flow.json**: Adds export entry to exports array

---

## 4. Directory Structure Created

### Output Location

```
server/projects/<projectName>/flows/<flowId>/
├── flow.json                    (updated with export entry)
├── template.html
├── output-<roundId>.html        (created by apply-content)
└── exports/
    └── export-<N>/
        ├── export.json          (export metadata)
        ├── project.json         (slide index)
        ├── slide-1.html         (self-contained slide)
        ├── slide-2.html
        ├── slide-3.html
        └── ...
```

### File Descriptions

| File | Purpose |
|------|---------|
| `export.json` | Complete export metadata with all slide info |
| `project.json` | Slide index for presentation/project views |
| `slide-N.html` | Self-contained HTML file for each slide (includes head/styles) |

---

## 5. Configuration & Control Logic

### Security Validation

**File: `server/lib/export-manager.js` (lines 37-73)**

Three validation functions ensure safe path construction:

```javascript
// Validate projectName
function resolveProjectDir(projectName) {
  if (!projectName || typeof projectName !== 'string') return null;
  if (!/^[\w-]{1,100}$/.test(projectName)) return null;  // Safe chars only
  const projectDir = path.join(PROJECTS_DIR, projectName);
  // Path traversal check
  const resolved = path.resolve(PROJECTS_DIR);
  const resolvedProjectDir = path.resolve(projectDir);
  if (!resolvedProjectDir.startsWith(resolved + path.sep) && resolvedProjectDir !== resolved) return null;
  return projectDir;
}

// Validate flowId
function resolveFlowDir(projectName, flowId) {
  const projectDir = resolveProjectDir(projectName);
  if (!projectDir) return null;
  if (!flowId || typeof flowId !== 'string') return null;
  if (!/^[\w-]{1,100}$/.test(flowId)) return null;  // Safe chars only
  const flowDir = path.join(projectDir, 'flows', flowId);
  // Path traversal check
  const resolvedProject = path.resolve(projectDir);
  if (!path.resolve(flowDir).startsWith(resolvedProject + path.sep)) return null;
  return flowDir;
}

// Validate exportId
function resolveExportDir(projectName, flowId, exportId) {
  const flowDir = resolveFlowDir(projectName, flowId);
  if (!flowDir) return null;
  if (!exportId || typeof exportId !== 'string') return null;
  if (!/^export-\d+$/.test(exportId)) return null;  // Format: export-N
  const exportDir = path.join(flowDir, 'exports', exportId);
  // Path traversal check
  const resolvedFlow = path.resolve(flowDir);
  if (!path.resolve(exportDir).startsWith(resolvedFlow + path.sep)) return null;
  return exportDir;
}
```

### Export Numbering

Exports are numbered sequentially per flow:

```javascript
// Lines 210-213 in export-manager.js
const existingExports = flow.exports || [];
const exportNumber = existingExports.length + 1;
const exportId = `export-${exportNumber}`;
```

**Example sequence:**
- First export: `export-1`
- Second export: `export-2`
- Third export: `export-3`

---

## 6. API Endpoints

### Create Export
```
POST /api/projects/:projectName/flows/:flowId/exports
Body: { roundId, outputFile, slideMetadata? }
Response: { ok, exportId, exportNumber, slideCount, createdAt }
```

### List Exports
```
GET /api/projects/:projectName/flows/:flowId/exports
Response: { ok, exports: [...], total }
```

### Get Export Details
```
GET /api/projects/:projectName/flows/:flowId/exports/:exportId
Response: { ok, export: {...} }
```

### Get Slide Index
```
GET /api/projects/:projectName/flows/:flowId/exports/:exportId/project
Response: { ok, project: {...} }
```

### Download Single Slide
```
GET /api/projects/:projectName/flows/:flowId/exports/:exportId/slides/:slideFile
Response: HTML file (attachment)
```

### Download Export as ZIP
```
GET /api/projects/:projectName/flows/:flowId/exports/:exportId/download
Response: ZIP archive (attachment)
```

---

## 7. Client State Management

**File: `client/src/App.jsx` (lines 85-249)**

```javascript
// Applied generation state
const [htmlApplied, setHtmlApplied] = useState(null)
// { outputFile, previewHtml, roundId, generationId }

// Export dialog receives these props
<ExportDialog
  projectName={htmlProject.projectName}
  flowId={htmlProject.flowId}
  roundId={htmlApplied.roundId}
  outputFile={htmlApplied.outputFile}
  slideCount={htmlApplied.slideCount}
  onClose={() => ...}
  onExported={(result) => ...}
  setToast={setToast}
/>
```

---

## 8. Summary: Data Flow

```
User Uploads HTML
    ↓
[HtmlUploadStep] → Creates project/flow
    ↓
[HtmlRecipeStep] → Generates recipe & JSON
    ↓
[HtmlPreviewStep] → Shows preview with "Export to Slides" button
    ↓
POST /api/html-flow/apply-content
  └─ roundId, outputFile generated
  └─ Patched HTML written to: projects/<projectName>/flows/<flowId>/output-<roundId>.html
  └─ flow.json updated with generation record
    ↓
[ExportDialog] → User edits slide metadata
    ↓
POST /api/projects/<projectName>/flows/<flowId>/exports
  └─ roundId, outputFile, slideMetadata sent
    ↓
createExport() in export-manager.js
  ├─ Extracts <section> elements from output-<roundId>.html
  ├─ Creates: projects/<projectName>/flows/<flowId>/exports/export-<N>/
  ├─ Writes individual slide files: slide-1.html, slide-2.html, ...
  ├─ Writes export.json (metadata)
  ├─ Writes project.json (index)
  └─ Updates flow.json with export entry
    ↓
Export Complete
```

---

## 9. Key Constants & Configuration

**File: `server/config.js`**
```javascript
export const PROJECTS_DIR = path.join(process.cwd(), 'server', 'projects');
```

**File: `server/lib/export-manager.js` (lines 30)**
```javascript
import { PROJECTS_DIR, isInsideDir } from '../config.js';
```

---

## 10. Related Files (Reference)

| File | Purpose |
|------|---------|
| `server/__tests__/export-manager.test.js` | Unit tests for export functions |
| `server/__tests__/export-routes.test.js` | API endpoint tests |
| `server/__tests__/html-flow-e2e.test.js` | End-to-end export tests |
| `client/src/steps/HtmlPreviewStep.jsx` | UI that triggers export dialog |
| `client/src/components/ExportHistoryPanel.jsx` | View/manage exports |

---

## Notes

- **Phase 4E Architecture**: Exports moved from chains to projects (lines 11-14 in export-manager.js)
- **Backward Compatibility**: Old chain-based path still supported via `chainId` parameter
- **Security**: All paths validated with regex and traversal checks
- **Metadata**: User can customize slideId, name, and type for each slide
- **Versioning**: Each export is immutable and numbered sequentially
- **Storage**: Exports are self-contained (each slide has full HTML with styles)
