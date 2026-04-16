# Phase 4B Implementation Plan: Relationship Builder

**Status**: 📋 PLANNING  
**Phase**: 4B of 5 (Relationship Builder)  
**Objective**: Create independent relationship builder with drag-drop UI for organizing slides hierarchically  
**Estimated Effort**: 2-3 weeks  
**Dependencies**: Phase 4A (COMPLETE)

---

## Overview

Phase 4B adds the ability to organize exported slides into hierarchical structures using a drag-and-drop interface. Users can:

1. Create new structures from available exports
2. Drag and drop slides to build parent-child hierarchies
3. Save multiple organizational structures (different hierarchies from same exports)
4. Edit, view, and delete structures
5. Use structures as input for Phase 4C packaging

---

## Architecture

### Backend: structure-manager.js

**Location**: `server/lib/structure-manager.js` (new file, ~400-500 lines)

**Core Functions**:

```javascript
// CRUD Operations
export function createStructure(chainId, name, description, exportRefs)
export function loadStructure(chainId, structureId)
export function listStructures(chainId)
export function updateStructure(chainId, structureId, updates)
export function deleteStructure(chainId, structureId)

// Tree Operations
export function addNodeToStructure(chainId, structureId, parentId, slideRef, title)
export function moveNode(chainId, structureId, nodeId, newParentId)
export function removeNodeFromStructure(chainId, structureId, nodeId)
export function getStructureTree(chainId, structureId)

// Validation
export function validateStructure(chainId, structureId)
export function getOrphanedSlides(chainId, structureId)

// Utilities
export function generateTreeVisualization(chainId, structureId)
export function getStructureStats(chainId, structureId)
```

**Data Storage**:

```
chains/<chainId>/structures/
├── structure-1/
│   ├── structure.json        # Metadata and tree data
│   ├── tree.json             # Visualization data (optional)
│   └── metadata.json         # Statistics and summary
├── structure-2/
│   └── ...
```

**structure.json Schema**:

```json
{
  "structureId": "structure-1",
  "chainId": "chain-uuid",
  "name": "Automotive Catalog",
  "description": "Organizes car manufacturers and models",
  "createdAt": "2026-04-16T15:00:00Z",
  "updatedAt": "2026-04-16T15:30:00Z",
  
  "sources": {
    "exports": [
      {
        "exportId": "export-1",
        "slideCount": 3,
        "path": "exports/export-1"
      },
      {
        "exportId": "export-2",
        "slideCount": 15,
        "path": "exports/export-2"
      }
    ]
  },
  
  "tree": {
    "rootId": "root",
    "nodes": [
      {
        "nodeId": "node-1",
        "type": "parent",
        "slideRef": "export-1/slide-1",
        "title": "Toyota",
        "children": ["node-2", "node-3"],
        "parentId": null,
        "createdAt": "2026-04-16T15:05:00Z"
      },
      {
        "nodeId": "node-2",
        "type": "child",
        "slideRef": "export-2/slide-1",
        "title": "Toyota Camry",
        "children": [],
        "parentId": "node-1",
        "createdAt": "2026-04-16T15:10:00Z"
      }
    ]
  },
  
  "metadata": {
    "totalSlides": 18,
    "depth": 2,
    "nodeCount": 8,
    "orphanSlides": 0,
    "usedSlides": 18
  }
}
```

### API Endpoints

**Location**: `server/routes/html-flow.js` (add new routes)

```
POST /api/html-flow/:chainId/structures
  Create new structure from exports
  Body: {
    name: "...",
    description: "...",
    exportRefs: [
      { exportId: "export-1" },
      { exportId: "export-2" }
    ]
  }
  Returns: { structureId, createdAt, path }

GET /api/html-flow/:chainId/structures
  List all structures for a chain
  Returns: [{ structureId, name, createdAt, slideCount, depth }, ...]

GET /api/html-flow/:chainId/structures/:structureId
  Get structure details with full tree
  Returns: { structure.json content + tree visualization }

PUT /api/html-flow/:chainId/structures/:structureId
  Update structure (tree operations)
  Body: {
    operation: "add_node|move_node|remove_node|rename_node",
    nodeId?: "...",
    parentId?: "...",
    slideRef?: "export-id/slide-index",
    title?: "...",
    newParentId?: "..."
  }
  Returns: { success: true, updatedTree: {...} }

DELETE /api/html-flow/:chainId/structures/:structureId
  Delete structure
  Returns: { success: true }

GET /api/html-flow/:chainId/structures/:structureId/validate
  Validate structure integrity
  Returns: { valid: true, errors: [], orphans: [...] }

GET /api/html-flow/:chainId/structures/:structureId/tree
  Get tree visualization data (for frontend rendering)
  Returns: { tree: { label, children, ... } }
```

### Frontend: RelationshipBuilder Component

**Location**: `client/src/components/RelationshipBuilder.jsx` (new file, ~400-500 lines)

**Component Structure**:

```jsx
<RelationshipBuilder>
  ├─ StructureList
  │  └─ StructureCard (per structure)
  │     ├─ [View] [Edit] [Delete] [Package]
  │     └─ Shows: name, slides, depth
  │
  ├─ StructureEditor (modal/panel)
  │  ├─ Step 1: Select Exports
  │  │  └─ Checkbox list of available exports
  │  │
  │  ├─ Step 2: Build Tree (drag-drop)
  │  │  ├─ Tree Canvas (left)
  │  │  │  ├─ Drag-drop zone
  │  │  │  ├─ TreeNode (recursive)
  │  │  │  │  ├─ Slide title
  │  │  │  │  ├─ Children list
  │  │  │  │  ├─ Delete button (on hover)
  │  │  │  │  └─ Expand/collapse toggle
  │  │  │  └─ Orphaned slides section
  │  │  │
  │  │  └─ Right Panel (right)
  │  │     ├─ Available Slides Section
  │  │     │  └─ Draggable slide items (drag to left tree)
  │  │     │
  │  │     └─ Slide Preview Section
  │  │        ├─ Preview pane (shows slide when selected)
  │  │        ├─ Slide title
  │  │        ├─ Slide HTML preview
  │  │        └─ Slide metadata
  │  │
  │  └─ Step 3: Review & Save
  │     ├─ Structure name field
  │     ├─ Description field
  │     ├─ Statistics (slides, depth, orphans)
  │     └─ [Save] [Cancel]
```

**Layout**: Tree (left) | Available Slides + Preview (right)

**Slide Preview Feature** (NEW):
- Right panel has two sections:
  1. Available Slides (draggable items)
  2. Slide Preview (shows selected slide)
- Click on any slide (left tree or right panel) to preview
- Preview shows:
  - Slide title
  - HTML content rendered
  - Slide metadata (size, source export)
- Helps users understand structure while building

**Key Features**:

1. **Drag-and-Drop** (APPROVED):
   - Drag slides from right panel to tree nodes (left)
   - Drag nodes within tree to reorder/move to different parents
   - Drop on parent node to nest as child
   - Visual feedback (hover states, drop zones)

2. **Node Deletion** (APPROVED):
   - Hover over node to show delete button
   - Click delete button to remove node from tree
   - Deleted node remains in right panel (available slides)
   - Option to re-add later

3. **Tree Visualization**:
   - Hierarchical display (left panel)
   - Expand/collapse nodes
   - Show/hide orphaned slides
   - Node count and depth indicator

4. **Tree Operations**:
   - Add node (drag from right panel)
   - Move node (drag within left tree)
   - Remove node (delete button on hover)
   - Rename node (inline edit)

5. **Validation**:
   - Check for circular dependencies
   - Track orphaned slides
   - Show validation errors
   - Prevent invalid operations

6. **Multiple Structures** (APPROVED):
   - Create multiple structures from same exports
   - Each structure has independent tree
   - Different organization approaches
   - Later use in packaging

7. **Slide Previews** (APPROVED):
   - Right panel shows available slides + preview pane
   - Click any slide to preview in right panel
   - Preview shows HTML content, title, metadata
   - Helps users understand structure while building
   - Preview updates when clicking tree nodes or available slides

### Frontend: TreeNode Component

**Location**: `client/src/components/TreeNode.jsx` (new file, ~150-200 lines)

**Props**:

```javascript
{
  node: {
    nodeId: "node-1",
    title: "Toyota",
    slideRef: "export-1/slide-1",
    children: ["node-2", "node-3"],
    parentId: null
  },
  onMove: (nodeId, newParentId) => {},
  onRemove: (nodeId) => {},
  onRename: (nodeId, newTitle) => {},
  allNodes: [...],
  depth: 0,
  isEditable: true
}
```

**Features**:

- Recursive rendering of children
- Drag-drop handle
- Expand/collapse toggle
- Delete button
- Inline edit for title
- Visual depth indicators

### Frontend: DragDropZone Component

**Location**: `client/src/components/DragDropZone.jsx` (new file, ~200-250 lines)

**Features**:

- Accept drag-drop of slides
- Visual feedback (drop zones, highlights)
- Prevent invalid drops (circular dependencies)
- Handle drop events
- Create new nodes from dropped slides

---

## Implementation Steps

### Step 1: Backend Setup (Days 1-2)

1. **Create structure-manager.js**
   - Implement core CRUD functions
   - Implement tree operations (add, move, remove)
   - Implement validation functions
   - Add security checks (path traversal, etc.)

2. **Add API routes in html-flow.js**
   - POST /structures (create)
   - GET /structures (list)
   - GET /structures/:id (get)
   - PUT /structures/:id (update)
   - DELETE /structures/:id (delete)
   - GET /structures/:id/validate (validate)
   - GET /structures/:id/tree (visualization)

3. **Create tests**
   - Unit tests for structure-manager.js
   - Integration tests for API routes
   - Test tree operations
   - Test validation

**Verification**:
```bash
npm test -- --grep "structure-manager"
npm test -- --grep "structure.*routes"
npm run build
```

### Step 2: Frontend Components (Days 2-3)

1. **Create TreeNode.jsx**
   - Recursive rendering
   - Drag-drop handles
   - Expand/collapse
   - Edit/delete actions

2. **Create DragDropZone.jsx**
   - Drag-drop target
   - Drop validation
   - Visual feedback
   - Event handling

3. **Create RelationshipBuilder.jsx**
   - Component composition
   - State management
   - Step navigation
   - API calls

4. **Add CSS modules**
   - RelationshipBuilder.module.css
   - TreeNode.module.css
   - DragDropZone.module.css

**Verification**:
```bash
npm run build
# Manual testing in browser
```

### Step 3: Integration & Testing (Days 3-4)

1. **Integration testing**
   - Create structure workflow
   - Edit structure workflow
   - Delete structure workflow
   - Full drag-drop interaction

2. **E2E testing**
   - Create structure from exports
   - Build tree via drag-drop
   - Save and reload structure
   - Edit existing structure

3. **Edge cases**
   - Empty structures
   - Large structures (50+ nodes)
   - Orphaned slides
   - Circular dependency prevention

**Verification**:
```bash
npm test
npm run build
# Manual E2E testing
```

### Step 4: Polish & Documentation (Days 4-5)

1. **UI Polish**
   - Smooth animations
   - Better visual feedback
   - Responsive design
   - Accessibility (keyboard nav, ARIA)

2. **Error Handling**
   - User-friendly error messages
   - Toast notifications
   - Validation feedback
   - Loading states

3. **Documentation**
   - Update PROJECT_ARCHITECTURE.md
   - Add code comments
   - Document API endpoints
   - Update user guide

---

## Detailed Code Examples

### structure-manager.js: Core Functions

```javascript
/**
 * Create a new structure from selected exports.
 * Returns structureId on success, null on failure.
 */
export function createStructure(chainId, name, description, exportRefs) {
  try {
    const chain = loadChain(chainId);
    if (!chain) throw new Error(`Chain ${chainId} not found`);

    // Validate exportRefs
    for (const ref of exportRefs) {
      const exportDir = resolveExportDir(chainId, ref.exportId);
      if (!exportDir || !fs.existsSync(exportDir)) {
        throw new Error(`Export ${ref.exportId} not found`);
      }
    }

    // Create structure directory
    const structureId = `structure-${Date.now()}`;
    const structureDir = path.join(chainDir, 'structures', structureId);
    
    if (!fs.existsSync(structureDir)) {
      fs.mkdirSync(structureDir, { recursive: true });
    }

    // Create structure.json
    const structure = {
      structureId,
      chainId,
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sources: {
        exports: exportRefs.map(ref => ({
          exportId: ref.exportId,
          slideCount: getSlideCount(chainId, ref.exportId),
          path: `exports/${ref.exportId}`
        }))
      },
      tree: {
        rootId: 'root',
        nodes: []
      },
      metadata: {
        totalSlides: 0,
        depth: 0,
        nodeCount: 0,
        orphanSlides: 0,
        usedSlides: 0
      }
    };

    fs.writeFileSync(
      path.join(structureDir, 'structure.json'),
      JSON.stringify(structure, null, 2),
      'utf8'
    );

    // Update chain.json
    if (!chain.structures) chain.structures = [];
    chain.structures.push({
      structureId,
      name,
      createdAt: structure.createdAt,
      path: `structures/${structureId}`
    });
    saveChain(chainId, chain);

    return structureId;
  } catch (err) {
    console.error('[structure-manager] createStructure error:', err.message);
    return null;
  }
}

/**
 * Add a node to the structure tree.
 * Returns the new node on success, null on failure.
 */
export function addNodeToStructure(chainId, structureId, parentId, slideRef, title) {
  try {
    const structure = loadStructure(chainId, structureId);
    if (!structure) throw new Error('Structure not found');

    // Validate slideRef
    const [exportId, slideIndex] = slideRef.split('/');
    if (!exportId || !slideIndex) {
      throw new Error('Invalid slideRef format');
    }

    // Create new node
    const nodeId = `node-${Date.now()}`;
    const newNode = {
      nodeId,
      type: parentId ? 'child' : 'parent',
      slideRef,
      title,
      children: [],
      parentId: parentId || null,
      createdAt: new Date().toISOString()
    };

    structure.tree.nodes.push(newNode);

    // Update parent's children list
    if (parentId) {
      const parent = structure.tree.nodes.find(n => n.nodeId === parentId);
      if (parent) {
        parent.children.push(nodeId);
      }
    }

    // Update metadata
    structure.metadata.nodeCount = structure.tree.nodes.length;
    structure.metadata.usedSlides = structure.tree.nodes.length;
    structure.metadata.depth = calculateDepth(structure.tree.nodes);
    structure.updatedAt = new Date().toISOString();

    saveStructure(chainId, structureId, structure);
    return newNode;
  } catch (err) {
    console.error('[structure-manager] addNodeToStructure error:', err.message);
    return null;
  }
}

/**
 * Move a node to a new parent.
 * Returns true on success, false on failure.
 */
export function moveNode(chainId, structureId, nodeId, newParentId) {
  try {
    const structure = loadStructure(chainId, structureId);
    if (!structure) throw new Error('Structure not found');

    const node = structure.tree.nodes.find(n => n.nodeId === nodeId);
    if (!node) throw new Error('Node not found');

    // Check for circular dependency
    if (isCircularDependency(structure.tree.nodes, nodeId, newParentId)) {
      throw new Error('Moving this node would create a circular dependency');
    }

    // Remove from old parent
    if (node.parentId) {
      const oldParent = structure.tree.nodes.find(n => n.nodeId === node.parentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter(id => id !== nodeId);
      }
    }

    // Add to new parent
    node.parentId = newParentId;
    if (newParentId) {
      const newParent = structure.tree.nodes.find(n => n.nodeId === newParentId);
      if (newParent) {
        newParent.children.push(nodeId);
      }
    }

    structure.metadata.depth = calculateDepth(structure.tree.nodes);
    structure.updatedAt = new Date().toISOString();

    saveStructure(chainId, structureId, structure);
    return true;
  } catch (err) {
    console.error('[structure-manager] moveNode error:', err.message);
    return false;
  }
}
```

### RelationshipBuilder.jsx: Component Structure

```jsx
import { useState, useCallback } from 'react';
import styles from './RelationshipBuilder.module.css';
import StructureList from './StructureList';
import StructureEditor from './StructureEditor';
import SlidePreview from './SlidePreview';

export default function RelationshipBuilder({ chainId, setToast }) {
  const [structures, setStructures] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingStructure, setEditingStructure] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState(null);

  // Load structures on mount
  useEffect(() => {
    loadStructures();
  }, [chainId]);

  const loadStructures = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/html-flow/${chainId}/structures`);
      const result = await response.json();
      if (result.ok) {
        setStructures(result.structures);
      }
    } catch (err) {
      setToast({ type: 'error', message: 'Failed to load structures' });
    } finally {
      setIsLoading(false);
    }
  }, [chainId, setToast]);

  const handleCreateNew = useCallback(() => {
    setEditingStructure(null);
    setShowEditor(true);
  }, []);

  const handleEdit = useCallback((structure) => {
    setEditingStructure(structure);
    setShowEditor(true);
  }, []);

  const handleDelete = useCallback(async (structureId) => {
    if (!confirm('Delete this structure?')) return;

    try {
      const response = await fetch(`/api/html-flow/${chainId}/structures/${structureId}`, {
        method: 'DELETE'
      });
      const result = await response.json();
      if (result.ok) {
        setToast({ type: 'success', message: 'Structure deleted' });
        loadStructures();
      }
    } catch (err) {
      setToast({ type: 'error', message: 'Failed to delete structure' });
    }
  }, [chainId, setToast, loadStructures]);

  const handleSaveStructure = useCallback(async (structure) => {
    try {
      const response = await fetch(`/api/html-flow/${chainId}/structures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(structure)
      });
      const result = await response.json();
      if (result.ok) {
        setToast({ type: 'success', message: 'Structure saved' });
        setShowEditor(false);
        loadStructures();
      }
    } catch (err) {
      setToast({ type: 'error', message: 'Failed to save structure' });
    }
  }, [chainId, setToast, loadStructures]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Relationship Builder</h2>
        <button
          className={styles.createButton}
          onClick={handleCreateNew}
          disabled={isLoading}
        >
          + New Structure
        </button>
      </div>

      {isLoading ? (
        <p className={styles.loading}>Loading structures...</p>
      ) : structures.length === 0 ? (
        <p className={styles.empty}>No structures yet. Create one to get started.</p>
      ) : (
        <StructureList
          structures={structures}
          onEdit={handleEdit}
          onDelete={handleDelete}
          chainId={chainId}
        />
      )}

      {showEditor && (
        <StructureEditor
          chainId={chainId}
          structure={editingStructure}
          onSave={handleSaveStructure}
          onClose={() => setShowEditor(false)}
          setToast={setToast}
        />
      )}
    </div>
  );
}
```

---

## Testing Strategy

### Unit Tests

```javascript
// structure-manager.test.js
describe('structure-manager', () => {
  describe('createStructure', () => {
    test('should create a new structure with valid exports');
    test('should return null for invalid chainId');
    test('should return null for non-existent exports');
    test('should initialize empty tree');
    test('should update chain.json with structure reference');
  });

  describe('addNodeToStructure', () => {
    test('should add a node to the structure');
    test('should add node as parent if no parentId');
    test('should add node as child if parentId provided');
    test('should update parent children list');
    test('should update metadata (nodeCount, depth)');
  });

  describe('moveNode', () => {
    test('should move node to new parent');
    test('should prevent circular dependencies');
    test('should update parent children lists');
    test('should update depth metadata');
  });

  describe('removeNodeFromStructure', () => {
    test('should remove node from structure');
    test('should remove from parent children list');
    test('should handle orphaned children');
  });

  describe('validateStructure', () => {
    test('should detect circular dependencies');
    test('should identify orphaned slides');
    test('should return validation errors');
  });
});
```

### Integration Tests

```javascript
// structure-routes.test.js
describe('structure API routes', () => {
  describe('POST /structures', () => {
    test('should create structure from exports');
    test('should return structureId');
    test('should validate exportRefs');
  });

  describe('GET /structures', () => {
    test('should list all structures');
    test('should return empty array for new chain');
  });

  describe('PUT /structures/:id', () => {
    test('should add node to structure');
    test('should move node in structure');
    test('should remove node from structure');
    test('should prevent invalid operations');
  });

  describe('DELETE /structures/:id', () => {
    test('should delete structure');
    test('should update chain.json');
  });
});
```

### E2E Tests

```javascript
// relationship-builder.e2e.test.js
describe('Relationship Builder Workflow', () => {
  test('should create structure from exports');
  test('should build tree via drag-drop');
  test('should save structure');
  test('should edit existing structure');
  test('should delete structure');
  test('should handle large structures (50+ nodes)');
});
```

---

## Success Criteria

### Phase 4B is complete when:

✅ **Backend**:
- ✅ structure-manager.js implemented (~400-500 lines)
- ✅ CRUD operations working
- ✅ Tree operations (add, move, remove) working
- ✅ Validation functions working
- ✅ 7 API endpoints implemented
- ✅ All unit tests passing
- ✅ All integration tests passing

✅ **Frontend**:
- ✅ RelationshipBuilder component functional
- ✅ TreeNode component with drag-drop
- ✅ DragDropZone component working
- ✅ Create structure workflow working
- ✅ Edit structure workflow working
- ✅ Delete structure workflow working
- ✅ Drag-drop interactions smooth and responsive

✅ **Testing**:
- ✅ All tests passing (unit, integration, E2E)
- ✅ No regressions in existing functionality
- ✅ Build succeeds

✅ **Documentation**:
- ✅ Code comments added
- ✅ PROJECT_ARCHITECTURE.md updated
- ✅ API endpoints documented

---

## Files to Create/Modify

### New Files
- `server/lib/structure-manager.js` (400-500 lines)
- `client/src/components/RelationshipBuilder.jsx` (400-500 lines)
- `client/src/components/RelationshipBuilder.module.css` (200-300 lines)
- `client/src/components/TreeNode.jsx` (150-200 lines)
- `client/src/components/TreeNode.module.css` (150-200 lines)
- `client/src/components/DragDropZone.jsx` (200-250 lines)
- `client/src/components/DragDropZone.module.css` (100-150 lines)
- `client/src/components/SlidePreview.jsx` (150-200 lines) - NEW: Shows slide preview in right panel
- `client/src/components/SlidePreview.module.css` (100-150 lines) - NEW: Styles for preview pane
- `server/__tests__/structure-manager.test.js` (300-400 lines)
- `server/__tests__/structure-routes.test.js` (200-300 lines)

### Modified Files
- `server/routes/html-flow.js` (add 7 new endpoints)
- `PROJECT_ARCHITECTURE.md` (update Phase 4B section)

---

## Dependencies & Constraints

**Dependencies**:
- Phase 4A must be complete (DONE ✅)
- Export system must be working
- chain.json structure must be accessible

**Constraints**:
- Drag-drop must work smoothly (use native HTML5 or React DnD)
- Large structures (100+ nodes) must perform well
- Circular dependencies must be prevented
- All operations must be reversible (undo/redo optional but nice-to-have)

---

## Next Phases

After Phase 4B completion:

- **Phase 4C**: Packaging System
  - Create packages from structures
  - Organize files by hierarchy
  - Generate manifests and READMEs
  - ZIP download capability

- **Phase 4D**: Dashboard Integration
  - Add tabs to project dashboard
  - Route to RelationshipBuilder
  - Integrate with Export and Package tabs

- **Phase 4E**: Testing & Polish
  - Comprehensive test coverage
  - Performance optimization
  - UI refinement
  - Documentation

---

**Ready to proceed with Phase 4B implementation?**
