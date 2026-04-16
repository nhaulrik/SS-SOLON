# SOLON Project Architecture

## Overview

SOLON is a slide content generation tool. Users upload HTML templates, assign content zones via a DOM tree UI, generate AI recipes, paste AI JSON responses, preview the output, assign per-slide metadata, and export individual slide HTML files.

Projects and flows are persisted to the filesystem. No database required.

---

## Data Model

### Directory Layout

```
server/projects/
└── <projectName>/
    └── flows/
        └── <flowId>/
            ├── flow.json        # Flow state + all metadata
            ├── template.html    # The uploaded HTML template
            ├── output-<id>.html # Generated output files
            └── exports/         # Versioned slide exports
                └── <exportId>/
                    ├── export.json
                    └── slide-*.html
```

A **project** is any directory under `server/projects/` that contains a `flows/` subdirectory. There is no `project.json` manifest — project discovery is purely filesystem-based.

A **flow** is a directory under `<project>/flows/` containing a `flow.json`.

### flow.json Schema

```json
{
  "flowId": "flow-my-project-1",
  "status": "active",
  "templateFilename": "initiative_template_v4.html",
  "createdAt": "2026-04-15T12:00:00Z",
  "updatedAt": "2026-04-15T12:30:00Z",
  "_metadata": {
    "selections": [...],       // Zone assignments from DOM tree
    "zones": [...],            // Resolved zone list
    "trees": [...],            // Parsed DOM tree structure
    "repeatableSlides": [...], // Repeatable slide config
    "fullSlideGeneration": false,
    "slideCount": 1
  },
  "generations": [...]         // History of apply-content runs
}
```

All zone, selection, and template metadata lives inside `flow.json._metadata`. There are no separate `zones.json` files.

---

## Backend

### Entry Point

`server/index.js` — Express server. Creates `server/projects/` directory on startup. Mounts route modules.

### Config

`server/config.js` — exports `PROJECTS_DIR`, `RESOLVED_PROJECTS_DIR`, `isInsideDir`.

### Route Modules

#### `server/routes/html-flow.js`

Core workflow endpoints:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/html-flow/upload-template` | Parse HTML, extract DOM tree and zone candidates. Creates flow dir inside existing project, saves `template.html`, initializes `flow.json`. |
| GET | `/api/html-flow/load-flow` | Load an existing flow from disk. Returns template HTML, parsed DOM tree, and saved selections (from `_metadata`). Suppresses NO_ZONES violation if flow already has selections. |
| PATCH | `/api/html-flow/update-selections` | Persist zone selections to `flow.json._metadata`. |
| POST | `/api/html-flow/generate-recipe` | Build AI prompt from flow zones. |
| POST | `/api/html-flow/validate-json` | Validate user's pasted AI JSON response against flow zones. |
| POST | `/api/html-flow/apply-content` | Patch `template.html` with AI JSON content, save `output-<id>.html`, update `flow.json` generations. |

#### `server/routes/projects.js`

Project/flow management:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all projects (filesystem scan). |
| POST | `/api/projects` | Create a new project directory (`<name>/flows/`). |
| GET | `/api/projects/:name` | Load project with all flows. |
| DELETE | `/api/projects/:name` | Delete project directory. |
| GET | `/api/projects/:name/flows/:flowId` | Load a single flow. |
| PATCH | `/api/projects/:name/flows/:flowId` | Update flow metadata. |
| DELETE | `/api/projects/:name/flows/:flowId` | Delete a flow. |
| POST | `/api/projects/:name/flows/:flowId/exports` | Create a versioned export from a generation. |
| GET | `/api/projects/:name/flows/:flowId/exports` | List exports for a flow. |
| GET | `/api/projects/:name/flows/:flowId/exports/:exportId/...` | Download individual slides or ZIP. |
| DELETE | `/api/projects/:name/flows/:flowId/exports/:exportId` | Delete an export. |

### Library Modules

- **`server/lib/project-manager.js`** — filesystem helpers: `resolveProjectDir`, `resolveFlowDir`, `listProjects`, `loadProject`, `loadFlow`, `deleteProject`, `deleteFlow`
- **`server/lib/export-manager.js`** — export creation and listing

---

## Frontend

### App Shell (`client/src/App.jsx`)

Controls navigation between screens. Top-level state:

```js
// Current project + flow context (in-memory session)
htmlProject: {
  projectName,
  flowId,
  zones,
  selections,
  repeatableSlides,
  fullSlideGeneration,
}

htmlApplied: {
  outputFile,
  previewHtml,
  roundId,
  slideCount,
}
```

Step order (`ALL_STEPS`):
1. `project-landing` — list/create projects
2. `project-dashboard` — list flows for a project
3. `flow-select` — (legacy, not used in primary path)
4. `html-upload` — upload template + assign zones
5. `html-recipe` — generate recipe, paste AI JSON
6. `html-preview` — preview output
7. `html-metadata` — assign per-slide metadata, export, finish

### Step Components

| Component | File | Role |
|-----------|------|------|
| `ProjectLandingStep` | [steps/ProjectLandingStep.jsx](client/src/steps/ProjectLandingStep.jsx) | Lists all projects. Inline "New Project" form creates a project by name. Click to open. Delete button per project. |
| `ProjectDashboardStep` | [steps/ProjectDashboardStep.jsx](client/src/steps/ProjectDashboardStep.jsx) | Lists all flows for a project. "New Flow" button starts a new flow. Open / Delete per flow. |
| `HtmlUploadStep` | [steps/HtmlUploadStep.jsx](client/src/steps/HtmlUploadStep.jsx) | Drop HTML file to upload, or load existing flow. DOM tree with zone assignment. "Next →" proceeds to recipe. Project context always provided by `currentProjectName`. |
| `HtmlRecipeStep` | [steps/HtmlRecipeStep.jsx](client/src/steps/HtmlRecipeStep.jsx) | Global prompt, generate recipe, paste + validate AI JSON, apply content. |
| `HtmlPreviewStep` | [steps/HtmlPreviewStep.jsx](client/src/steps/HtmlPreviewStep.jsx) | Multi-slide iframe preview with slide navigation. "Next →" proceeds to metadata. |
| `HtmlMetadataStep` | [steps/HtmlMetadataStep.jsx](client/src/steps/HtmlMetadataStep.jsx) | Assign per-slide metadata (slideId, name, type). Export to individual HTML files. Export history. "Finish" returns to dashboard. |

### Key Sub-Components

| Component | Role |
|-----------|------|
| `AppHeader` | Page title + debug modal trigger |
| `Breadcrumbs` | Step navigation (upload → recipe → preview → metadata) |
| `HtmlTreePanel` | DOM tree with zone assignment, ignore toggle, repeatable config |
| `HtmlEditorPanel` | CodeMirror HTML editor with live preview |
| `ExportHistoryPanel` | List of previous exports for a flow with download/delete |
| `DebugContextModal` | Full state snapshot for debugging |

---

## User Workflow

### Creating a new project and flow

```
Project Landing
  ↓ type project name → "New Project"
  POST /api/projects  (creates <name>/flows/ on disk)
  ↓
Project Dashboard  (empty flows list)
  ↓ "New Flow"
HtmlUploadStep
  ↓ drop HTML file → POST /upload-template (creates flow in project)
  DOM tree, assign zones → "Next →"
  ↓
HtmlRecipeStep
  Generate recipe → copy to AI
  Paste AI JSON → validate → "Apply content"
  ↓
HtmlPreviewStep
  Multi-slide iframe preview → "Next →"
  ↓
HtmlMetadataStep
  Edit slideId / name / type per slide
  "Export N Slides"  → saves to exports/
  "Finish" → Project Dashboard
```

### Opening an existing flow

```
Project Landing
  ↓ click project
Project Dashboard
  ↓ "Open Flow"
HtmlUploadStep  (load-flow path)
  GET /api/html-flow/load-flow
  → template.html + saved zones restored from flow.json._metadata
  → NO_ZONES suppressed if selections already exist
  DOM tree with zones pre-assigned → "Next →"
  ↓
HtmlRecipeStep → HtmlPreviewStep → HtmlMetadataStep
  (same as above)
```

---

## Zone Model

Zones are assigned in `HtmlUploadStep` via `HtmlTreePanel`. All zones use the block model:

```js
{
  key: "headline",
  element: "h1",
  selector: "section.slide > h1",
  type: "block",       // always "block"
  ignored: false,
  repeatable: false,
}
```

Repeatable slides configure which zones are unique per instance vs shared.

Zone changes are persisted immediately to `flow.json._metadata` via `PATCH /api/html-flow/update-selections`.

---

## Export Model

Exports are stored under `<flowDir>/exports/<exportId>/`:

```
exports/
└── export-1744800000000/
    ├── export.json       # { exportId, roundId, slideCount, createdAt, files[], slideMetadata[] }
    ├── slide-1.html
    ├── slide-2.html
    └── slide-N.html
```

Each slide carries metadata assigned in `HtmlMetadataStep` (slideId, name, type). `ExportHistoryPanel` lists all past exports per flow with per-slide download and ZIP download.

---

## Removed Features

The following were built and subsequently removed to simplify the codebase:

- **Chain-based sessions** (`chainId`) — replaced by persistent project/flow filesystem storage
- **`project.json` manifests** — project discovery is now filesystem-only
- **`templates/` directory** — templates now live inside the flow directory as `template.html`
- **`zones.json` files** — zone data now lives in `flow.json._metadata`
- **`generation-manager.js`** — generation history manager (removed; generations stored directly in flow.json)
- **`structure-manager.js`** — hierarchical structure builder (removed)
- **`package-manager.js`** — slide packaging system (removed)
- **`relationship-manager.js`** — parent-child slide relationships (removed)
- **`CreateProjectDialog`** — replaced by inline name form on the landing page
- **`CreateFlowDialog`** — replaced by "New Flow" button on the dashboard
- **`TemplateUploadDialog`** — replaced by direct file drop in `HtmlUploadStep`
- **Packaging UI components** — `PackageList`, `CreatePackageDialog`, `StructureEditor`, `StructureList`, `RelationshipBuilder`, `RelationshipViewer`
- **Project/flow selector in `HtmlUploadStep`** — project context is now always provided by `currentProjectName` from the dashboard
