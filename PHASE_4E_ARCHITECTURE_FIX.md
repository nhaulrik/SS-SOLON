# Phase 4E: Architecture Fix - Move Exports from Chains to Projects

**Status**: PLANNING  
**Priority**: HIGH - Architectural Correctness  
**Date**: 2026-04-16

---

## Problem Statement

Currently, exports are being saved to the **chains** directory:
```
server/chains/[chainId]/exports/export-1/
```

But according to the PROJECT_ARCHITECTURE.md, they should be saved to the **projects** directory:
```
server/projects/[projectName]/flows/[flowName]/exports/export-1/
```

### Why This Matters

1. **Architectural Consistency**: Projects should be self-contained with all their data
2. **User Experience**: Users expect exports to be with their project, not in a hidden chains folder
3. **Data Organization**: Chains are now only used for backend processing (generations, structures, packages)
4. **Future Phases**: Phase 4C (Packaging) and Phase 4D (Dashboard) expect exports to be in projects

---

## Current Architecture (WRONG)

```
server/
├── projects/
│   └── [projectName]/
│       ├── project.json
│       ├── templates/
│       └── flows/
│           └── [flowName]/
│               ├── flow.json
│               ├── zones.json
│               ├── generations/  ← generations stored here
│               └── exports/      ← EMPTY! (should have exports)
│
└── chains/
    └── [chainId]/
        ├── chain.json
        ├── exports/             ← WRONG! Exports are here
        │   └── export-1/
        │       ├── export.json
        │       ├── project.json
        │       ├── slide-1.html
        │       └── slide-2.html
        └── ...
```

---

## Target Architecture (CORRECT)

```
server/
├── projects/
│   └── [projectName]/
│       ├── project.json
│       ├── templates/
│       └── flows/
│           └── [flowName]/
│               ├── flow.json
│               ├── zones.json
│               ├── generations/
│               │   └── round-1/
│               └── exports/      ← CORRECT! Exports here
│                   └── export-1/
│                       ├── export.json
│                       ├── project.json
│                       ├── slide-1.html
│                       └── slide-2.html
│
└── chains/
    └── [chainId]/
        ├── chain.json
        ├── structures/          ← Phase 4B (Relationship Builder)
        └── packages/            ← Phase 4C (Packaging System)
```

---

## Implementation Plan

### Phase 1: Update export-manager.js

**File**: `server/lib/export-manager.js`

**Changes**:
1. Remove `resolveChainDir()` and `resolveExportDir()` functions
2. Add new functions:
   - `resolveProjectDir(projectName)` - Validate and resolve project directory
   - `resolveFlowDir(projectName, flowId)` - Validate and resolve flow directory
   - `resolveExportDir(projectName, flowId, exportId)` - New export path resolver
3. Update all export creation/retrieval functions to use project paths
4. Change all file I/O to write to `projects/[projectName]/flows/[flowName]/exports/`
5. Update `createExport()` to:
   - Accept `projectName` and `flowId` instead of `chainId`
   - Save slides to project exports directory
   - Update flow.json exports array

**Functions to Update**:
- `createExport()` - Change path logic
- `listExports()` - Change path logic
- `getExport()` - Change path logic
- `deleteExport()` - Change path logic
- `buildExportZip()` - Change path logic
- `getExportProjectIndex()` - Change path logic
- `resolveSlideFilePath()` - Change path logic
- `getExportCount()` - Change path logic

---

### Phase 2: Update html-flow.js Routes

**File**: `server/routes/html-flow.js`

**Changes**:
1. Update all export endpoints to accept `projectName` and `flowId` instead of `chainId`
2. Change endpoint paths from:
   ```
   POST /api/html-flow/:chainId/exports
   ```
   To:
   ```
   POST /api/projects/:projectName/flows/:flowId/exports
   ```

**Endpoints to Update**:
- `POST /api/projects/:projectName/flows/:flowId/exports` - Create export
- `GET /api/projects/:projectName/flows/:flowId/exports` - List exports
- `GET /api/projects/:projectName/flows/:flowId/exports/:exportId` - Get export
- `GET /api/projects/:projectName/flows/:flowId/exports/:exportId/project` - Get project index
- `GET /api/projects/:projectName/flows/:flowId/exports/:exportId/slide/:slideId` - Get slide
- `GET /api/projects/:projectName/flows/:flowId/exports/:exportId/zip` - Download ZIP
- `DELETE /api/projects/:projectName/flows/:flowId/exports/:exportId` - Delete export

---

### Phase 3: Update Frontend API Calls

**Files to Update**:
- `client/src/steps/HtmlPreviewStep.jsx` - Export button
- `client/src/components/ExportDialog.jsx` - Export dialog
- `client/src/components/ExportHistoryPanel.jsx` - Export history

**Changes**:
1. Update API endpoints to use new project-based paths
2. Extract `projectName` and `flowId` from App state
3. Pass these to export API calls
4. Update response handling for new paths

---

### Phase 4: Update flow.json Structure

**Changes**:
1. The `exports` array in flow.json should track export IDs
2. When an export is created, add it to the flow.json exports array
3. Example:
   ```json
   {
     "flowId": "flow-1",
     "projectId": "proj-123",
     "status": "active",
     "exports": ["export-1", "export-2"]
   }
   ```

---

### Phase 5: Data Migration (Optional but Recommended)

**Create Migration Script**: `server/scripts/migrate-exports.js`

**Purpose**: Move existing exports from chains to projects

**Steps**:
1. Read all projects from `server/projects/`
2. For each project, read project.json
3. For each flow in the project, check flow.json for exports array
4. For each export ID in the exports array:
   - Find the export in `server/chains/[chainId]/exports/`
   - Copy it to `server/projects/[projectName]/flows/[flowName]/exports/`
   - Update flow.json to reference the new location
5. Verify all exports were copied
6. (Optional) Delete old exports from chains directory

---

## Testing Strategy

### Unit Tests
1. Test `resolveProjectDir()` with valid/invalid project names
2. Test `resolveFlowDir()` with valid/invalid flow IDs
3. Test `createExport()` saves to correct project path
4. Test `listExports()` finds exports in project directory
5. Test `deleteExport()` removes from project directory

### Integration Tests
1. Create a project → Create flow → Generate export → Verify file location
2. List exports and verify they're found in project directory
3. Download export and verify ZIP contains correct files
4. Delete export and verify removal from project directory

### Manual Testing
1. Create a new export and verify it appears in:
   - `server/projects/[projectName]/flows/[flowName]/exports/`
   - Not in `server/chains/`
2. Verify flow.json exports array is updated
3. Verify export history panel shows the export
4. Verify download still works
5. Verify delete still works

---

## API Changes Summary

### Before
```
POST   /api/html-flow/:chainId/exports
GET    /api/html-flow/:chainId/exports
GET    /api/html-flow/:chainId/exports/:exportId
DELETE /api/html-flow/:chainId/exports/:exportId
```

### After
```
POST   /api/projects/:projectName/flows/:flowId/exports
GET    /api/projects/:projectName/flows/:flowId/exports
GET    /api/projects/:projectName/flows/:flowId/exports/:exportId
DELETE /api/projects/:projectName/flows/:flowId/exports/:exportId
```

---

## Files to Modify

| File | Changes | Impact |
|------|---------|--------|
| `server/lib/export-manager.js` | Path logic rewrite | HIGH |
| `server/routes/html-flow.js` | Endpoint updates | HIGH |
| `client/src/steps/HtmlPreviewStep.jsx` | API calls | MEDIUM |
| `client/src/components/ExportDialog.jsx` | API calls | MEDIUM |
| `client/src/components/ExportHistoryPanel.jsx` | API calls | MEDIUM |
| `server/projects/*/flows/*/flow.json` | Export tracking | AUTO |
| `server/scripts/migrate-exports.js` | Migration script | OPTIONAL |

---

## Estimated Effort

- **Backend Changes**: 2-3 hours
- **Frontend Changes**: 1-2 hours
- **Testing**: 1-2 hours
- **Migration**: 30 minutes
- **Total**: 4-8 hours

---

## Implementation Order

1. ✅ Create this plan
2. Update export-manager.js (path logic)
3. Update html-flow.js (endpoint paths)
4. Update frontend components (API calls)
5. Update flow.json handling
6. Write unit tests
7. Write integration tests
8. Create migration script
9. Run migration on existing data
10. Manual testing
11. Verify no regressions
12. Git commit
13. Update documentation

---

## Success Criteria

- ✅ All exports saved to `projects/[projectName]/flows/[flowName]/exports/`
- ✅ No exports in `chains/[chainId]/exports/`
- ✅ All API endpoints working with new paths
- ✅ flow.json exports array properly tracked
- ✅ All tests passing
- ✅ No regressions in existing functionality
- ✅ Migration script successfully moved existing exports
- ✅ Documentation updated

---

## Rollback Plan

If issues occur:
1. Revert changes to export-manager.js
2. Revert changes to html-flow.js
3. Revert changes to frontend components
4. Restore exports from chains directory (if migration was run)
5. Restore flow.json from backup

---

## Notes

- This fix is **non-breaking** if done correctly - users won't notice any change
- The chains directory will still exist for structures and packages (Phase 4B/4C)
- This aligns with the PROJECT_ARCHITECTURE.md specification
- This is a prerequisite for proper Phase 4 functionality

---

**Document Version**: 1.0  
**Created**: 2026-04-16  
**Status**: READY FOR IMPLEMENTATION
