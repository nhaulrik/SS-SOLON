/**
 * server/lib/structure-manager.js
 *
 * Phase 4B: Relationship Builder - Structure Management
 *
 * Manages hierarchical structures for organizing exported slides.
 * Users can create multiple structures from the same exports, each with
 * independent parent-child relationships and drag-drop organization.
 *
 * Directory structure per chain:
 *   server/chains/<chainId>/structures/
 *     structure-1/
 *       structure.json      — structure metadata and tree
 *       metadata.json       — statistics and summary (optional)
 *     structure-2/
 *       ...
 */

import fs from 'fs';
import path from 'path';
import { CHAINS_DIR, isInsideDir } from '../config.js';

// ── Security helpers ──────────────────────────────────────────────────────────

/**
 * Validate a chainId and return safe chain directory path, or null.
 */
function resolveChainDir(chainId) {
  if (!chainId || typeof chainId !== 'string') return null;
  if (!/^[\w-]{1,100}$/.test(chainId)) return null;
  const chainDir = path.join(CHAINS_DIR, chainId);
  const resolved = path.resolve(CHAINS_DIR);
  const resolvedChainDir = path.resolve(chainDir);
  if (!resolvedChainDir.startsWith(resolved + path.sep) && resolvedChainDir !== resolved) return null;
  return chainDir;
}

/**
 * Validate a structureId and return safe structure directory path, or null.
 */
function resolveStructureDir(chainId, structureId) {
  const chainDir = resolveChainDir(chainId);
  if (!chainDir) return null;
  if (!structureId || typeof structureId !== 'string') return null;
  if (!/^structure-\d+$/.test(structureId)) return null;
  const structureDir = path.join(chainDir, 'structures', structureId);
  const resolvedChain = path.resolve(chainDir);
  if (!path.resolve(structureDir).startsWith(resolvedChain + path.sep)) return null;
  return structureDir;
}

/**
 * Validate an exportId and return safe export directory path, or null.
 */
function resolveExportDir(chainId, exportId) {
  const chainDir = resolveChainDir(chainId);
  if (!chainDir) return null;
  if (!exportId || typeof exportId !== 'string') return null;
  if (!/^export-\d+$/.test(exportId)) return null;
  const exportDir = path.join(chainDir, 'exports', exportId);
  const resolvedChain = path.resolve(chainDir);
  if (!path.resolve(exportDir).startsWith(resolvedChain + path.sep)) return null;
  return exportDir;
}

// ── Chain I/O ─────────────────────────────────────────────────────────────────

function loadChain(chainId) {
  const chainDir = resolveChainDir(chainId);
  if (!chainDir) return null;
  const chainPath = path.join(chainDir, 'chain.json');
  if (!fs.existsSync(chainPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(chainPath, 'utf8'));
  } catch (err) {
    console.error(`[structure-manager] Failed to load chain ${chainId}:`, err.message);
    return null;
  }
}

function saveChain(chainId, chain) {
  const chainDir = resolveChainDir(chainId);
  if (!chainDir) return false;
  const chainPath = path.join(chainDir, 'chain.json');
  try {
    fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`[structure-manager] Failed to save chain ${chainId}:`, err.message);
    return false;
  }
}

// ── Structure I/O ─────────────────────────────────────────────────────────────

function loadStructure(chainId, structureId) {
  const structureDir = resolveStructureDir(chainId, structureId);
  if (!structureDir) return null;
  const structurePath = path.join(structureDir, 'structure.json');
  if (!fs.existsSync(structurePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(structurePath, 'utf8'));
  } catch (err) {
    console.error(`[structure-manager] Failed to load structure ${structureId}:`, err.message);
    return null;
  }
}

function saveStructure(chainId, structureId, structure) {
  const structureDir = resolveStructureDir(chainId, structureId);
  if (!structureDir) return false;
  const structurePath = path.join(structureDir, 'structure.json');
  try {
    fs.writeFileSync(structurePath, JSON.stringify(structure, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`[structure-manager] Failed to save structure ${structureId}:`, err.message);
    return false;
  }
}

// ── Utility functions ─────────────────────────────────────────────────────────

/**
 * Get slide count for an export.
 */
function getSlideCount(chainId, exportId) {
  try {
    const exportDir = resolveExportDir(chainId, exportId);
    if (!exportDir) return 0;
    const exportPath = path.join(exportDir, 'export.json');
    if (!fs.existsSync(exportPath)) return 0;
    const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    return exportData.content?.slideCount || 0;
  } catch (err) {
    console.error(`[structure-manager] Failed to get slide count for export ${exportId}:`, err.message);
    return 0;
  }
}

/**
 * Get slide title from an export.
 */
function getSlideTitle(chainId, exportId, slideIndex) {
  try {
    const exportDir = resolveExportDir(chainId, exportId);
    if (!exportDir) return `Slide ${slideIndex}`;
    const exportPath = path.join(exportDir, 'export.json');
    if (!fs.existsSync(exportPath)) return `Slide ${slideIndex}`;
    const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    const slide = exportData.content?.slides?.find(s => s.index === slideIndex);
    return slide?.title || `Slide ${slideIndex}`;
  } catch (err) {
    return `Slide ${slideIndex}`;
  }
}

/**
 * Calculate tree depth (maximum nesting level).
 */
function calculateDepth(nodes) {
  if (nodes.length === 0) return 0;

  const getDepth = (nodeId, visited = new Set()) => {
    if (visited.has(nodeId)) return 0; // Prevent infinite loops
    visited.add(nodeId);

    const node = nodes.find(n => n.nodeId === nodeId);
    if (!node || node.children.length === 0) return 0;

    const maxChildDepth = Math.max(...node.children.map(childId => getDepth(childId, new Set(visited))));
    return 1 + maxChildDepth;
  };

  // Find root nodes (no parent)
  const rootNodes = nodes.filter(n => !n.parentId);
  if (rootNodes.length === 0) return 0;

  return Math.max(...rootNodes.map(root => getDepth(root.nodeId)));
}

/**
 * Check for circular dependencies.
 */
function isCircularDependency(nodes, nodeId, newParentId) {
  if (!newParentId) return false; // Moving to root is always safe

  const visited = new Set();
  const hasPath = (currentId, targetId) => {
    if (currentId === targetId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);

    const node = nodes.find(n => n.nodeId === currentId);
    if (!node) return false;

    return node.children.some(childId => hasPath(childId, targetId));
  };

  // Check if newParentId is a descendant of nodeId
  return hasPath(nodeId, newParentId);
}

/**
 * Get orphaned slides (slides not in tree).
 */
function getOrphanedSlides(chainId, structure) {
  try {
    const usedSlideRefs = new Set();
    structure.tree.nodes.forEach(node => {
      usedSlideRefs.add(node.slideRef);
    });

    const orphans = [];
    for (const exportRef of structure.sources.exports) {
      const slideCount = getSlideCount(chainId, exportRef.exportId);
      for (let i = 1; i <= slideCount; i++) {
        const slideRef = `${exportRef.exportId}/${i}`;
        if (!usedSlideRefs.has(slideRef)) {
          orphans.push({
            slideRef,
            exportId: exportRef.exportId,
            slideIndex: i,
            title: getSlideTitle(chainId, exportRef.exportId, i),
          });
        }
      }
    }
    return orphans;
  } catch (err) {
    console.error(`[structure-manager] Failed to get orphaned slides:`, err.message);
    return [];
  }
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Create a new structure from selected exports.
 * Returns structureId on success, null on failure.
 */
export function createStructure(chainId, name, description, exportIds) {
  try {
    if (!chainId || !name || !Array.isArray(exportIds) || exportIds.length === 0) {
      throw new Error('chainId, name, and at least one exportId are required');
    }

    const chain = loadChain(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    // Validate all exports exist
    for (const exportId of exportIds) {
      const exportDir = resolveExportDir(chainId, exportId);
      if (!exportDir || !fs.existsSync(exportDir)) {
        throw new Error(`Export ${exportId} not found`);
      }
    }

    // Create structure directory
    const chainDir = resolveChainDir(chainId);
    const existingStructures = chain.structures || [];
    const structureNumber = existingStructures.length + 1;
    const structureId = `structure-${structureNumber}`;
    const structureDir = path.join(chainDir, 'structures', structureId);

    if (!fs.existsSync(structureDir)) {
      fs.mkdirSync(structureDir, { recursive: true });
    }

    // Create structure.json
    const now = new Date().toISOString();
    const structure = {
      structureId,
      chainId,
      name,
      description: description || '',
      createdAt: now,
      updatedAt: now,
      sources: {
        exports: exportIds.map(exportId => ({
          exportId,
          slideCount: getSlideCount(chainId, exportId),
          path: `exports/${exportId}`,
        })),
      },
      tree: {
        rootId: 'root',
        nodes: [],
      },
      metadata: {
        totalSlides: 0,
        depth: 0,
        nodeCount: 0,
        orphanSlides: 0,
        usedSlides: 0,
      },
    };

    if (!saveStructure(chainId, structureId, structure)) {
      throw new Error('Failed to save structure');
    }

    // Update chain.json
    if (!chain.structures) chain.structures = [];
    chain.structures.push({
      structureId,
      name,
      createdAt: now,
      path: `structures/${structureId}`,
    });
    if (!saveChain(chainId, chain)) {
      throw new Error('Failed to update chain.json');
    }

    return structureId;
  } catch (err) {
    console.error('[structure-manager] createStructure error:', err.message);
    return null;
  }
}

/**
 * List all structures for a chain.
 */
export function listStructures(chainId) {
  try {
    const chain = loadChain(chainId);
    if (!chain) return [];
    return (chain.structures || []).slice().reverse(); // newest first
  } catch (err) {
    console.error('[structure-manager] listStructures error:', err.message);
    return [];
  }
}

/**
 * Get structure details with full tree.
 */
export function getStructure(chainId, structureId) {
  try {
    const structure = loadStructure(chainId, structureId);
    if (!structure) return null;

    // Calculate orphaned slides
    const orphans = getOrphanedSlides(chainId, structure);
    structure.metadata.orphanSlides = orphans.length;

    return structure;
  } catch (err) {
    console.error('[structure-manager] getStructure error:', err.message);
    return null;
  }
}

/**
 * Add a node to the structure tree.
 * Returns the updated structure on success, null on failure.
 */
export function addNodeToStructure(chainId, structureId, parentId, slideRef, title) {
  try {
    if (!slideRef || !title) {
      throw new Error('slideRef and title are required');
    }

    const structure = loadStructure(chainId, structureId);
    if (!structure) {
      throw new Error('Structure not found');
    }

    // Validate slideRef format
    const [exportId, slideIndexStr] = slideRef.split('/');
    const slideIndex = parseInt(slideIndexStr, 10);
    if (!exportId || isNaN(slideIndex) || slideIndex < 1) {
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
      createdAt: new Date().toISOString(),
    };

    structure.tree.nodes.push(newNode);

    // Update parent's children list if parent exists
    if (parentId) {
      const parent = structure.tree.nodes.find(n => n.nodeId === parentId);
      if (parent && !parent.children.includes(nodeId)) {
        parent.children.push(nodeId);
      }
    }

    // Update metadata
    structure.metadata.nodeCount = structure.tree.nodes.length;
    structure.metadata.usedSlides = structure.tree.nodes.length;
    structure.metadata.depth = calculateDepth(structure.tree.nodes);
    structure.updatedAt = new Date().toISOString();

    if (!saveStructure(chainId, structureId, structure)) {
      throw new Error('Failed to save structure');
    }

    return structure;
  } catch (err) {
    console.error('[structure-manager] addNodeToStructure error:', err.message);
    return null;
  }
}

/**
 * Move a node to a new parent.
 * Returns the updated structure on success, null on failure.
 */
export function moveNode(chainId, structureId, nodeId, newParentId) {
  try {
    const structure = loadStructure(chainId, structureId);
    if (!structure) {
      throw new Error('Structure not found');
    }

    const node = structure.tree.nodes.find(n => n.nodeId === nodeId);
    if (!node) {
      throw new Error('Node not found');
    }

    // Check for circular dependency
    if (newParentId && isCircularDependency(structure.tree.nodes, nodeId, newParentId)) {
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
    node.parentId = newParentId || null;
    if (newParentId) {
      const newParent = structure.tree.nodes.find(n => n.nodeId === newParentId);
      if (newParent && !newParent.children.includes(nodeId)) {
        newParent.children.push(nodeId);
      }
    }

    structure.metadata.depth = calculateDepth(structure.tree.nodes);
    structure.updatedAt = new Date().toISOString();

    if (!saveStructure(chainId, structureId, structure)) {
      throw new Error('Failed to save structure');
    }

    return structure;
  } catch (err) {
    console.error('[structure-manager] moveNode error:', err.message);
    return null;
  }
}

/**
 * Remove a node from the structure tree.
 * Returns the updated structure on success, null on failure.
 */
export function removeNodeFromStructure(chainId, structureId, nodeId) {
  try {
    const structure = loadStructure(chainId, structureId);
    if (!structure) {
      throw new Error('Structure not found');
    }

    const nodeIndex = structure.tree.nodes.findIndex(n => n.nodeId === nodeId);
    if (nodeIndex === -1) {
      throw new Error('Node not found');
    }

    const node = structure.tree.nodes[nodeIndex];

    // Remove from parent's children list
    if (node.parentId) {
      const parent = structure.tree.nodes.find(n => n.nodeId === node.parentId);
      if (parent) {
        parent.children = parent.children.filter(id => id !== nodeId);
      }
    }

    // Remove the node
    structure.tree.nodes.splice(nodeIndex, 1);

    // Update metadata
    structure.metadata.nodeCount = structure.tree.nodes.length;
    structure.metadata.usedSlides = structure.tree.nodes.length;
    structure.metadata.depth = calculateDepth(structure.tree.nodes);
    structure.updatedAt = new Date().toISOString();

    if (!saveStructure(chainId, structureId, structure)) {
      throw new Error('Failed to save structure');
    }

    return structure;
  } catch (err) {
    console.error('[structure-manager] removeNodeFromStructure error:', err.message);
    return null;
  }
}

/**
 * Delete a structure entirely.
 * Returns true on success, false on failure.
 */
export function deleteStructure(chainId, structureId) {
  try {
    const structureDir = resolveStructureDir(chainId, structureId);
    if (!structureDir) {
      throw new Error('Invalid structureId');
    }

    // Delete structure directory
    if (fs.existsSync(structureDir)) {
      fs.rmSync(structureDir, { recursive: true, force: true });
    }

    // Update chain.json
    const chain = loadChain(chainId);
    if (chain) {
      chain.structures = (chain.structures || []).filter(s => s.structureId !== structureId);
      saveChain(chainId, chain);
    }

    return true;
  } catch (err) {
    console.error('[structure-manager] deleteStructure error:', err.message);
    return false;
  }
}

/**
 * Validate structure integrity.
 * Returns { valid: boolean, errors: string[], orphans: [...] }
 */
export function validateStructure(chainId, structureId) {
  try {
    const structure = loadStructure(chainId, structureId);
    if (!structure) {
      return { valid: false, errors: ['Structure not found'], orphans: [] };
    }

    const errors = [];
    const visited = new Set();

    // Check for orphaned nodes (nodes without valid parent)
    for (const node of structure.tree.nodes) {
      if (node.parentId) {
        const parent = structure.tree.nodes.find(n => n.nodeId === node.parentId);
        if (!parent) {
          errors.push(`Node ${node.nodeId} references non-existent parent ${node.parentId}`);
        }
      }
    }

    // Check for circular dependencies
    const checkCircular = (nodeId, path = []) => {
      if (path.includes(nodeId)) {
        errors.push(`Circular dependency detected: ${path.join(' -> ')} -> ${nodeId}`);
        return;
      }

      const node = structure.tree.nodes.find(n => n.nodeId === nodeId);
      if (!node) return;

      for (const childId of node.children) {
        checkCircular(childId, [...path, nodeId]);
      }
    };

    for (const node of structure.tree.nodes) {
      if (!node.parentId) {
        checkCircular(node.nodeId);
      }
    }

    // Get orphaned slides
    const orphans = getOrphanedSlides(chainId, structure);

    return {
      valid: errors.length === 0,
      errors,
      orphans,
    };
  } catch (err) {
    console.error('[structure-manager] validateStructure error:', err.message);
    return { valid: false, errors: [err.message], orphans: [] };
  }
}

/**
 * Get orphaned slides for a structure.
 */
export function getOrphanedSlidesForStructure(chainId, structureId) {
  try {
    const structure = loadStructure(chainId, structureId);
    if (!structure) return [];
    return getOrphanedSlides(chainId, structure);
  } catch (err) {
    console.error('[structure-manager] getOrphanedSlidesForStructure error:', err.message);
    return [];
  }
}

/**
 * Get tree visualization data for frontend rendering.
 */
export function getTreeVisualization(chainId, structureId) {
  try {
    const structure = loadStructure(chainId, structureId);
    if (!structure) return null;

    const buildTreeNode = (nodeId) => {
      const node = structure.tree.nodes.find(n => n.nodeId === nodeId);
      if (!node) return null;

      return {
        nodeId: node.nodeId,
        label: node.title,
        slideRef: node.slideRef,
        children: node.children
          .map(childId => buildTreeNode(childId))
          .filter(child => child !== null),
      };
    };

    const rootNodes = structure.tree.nodes.filter(n => !n.parentId);
    const tree = {
      label: structure.name,
      children: rootNodes
        .map(root => buildTreeNode(root.nodeId))
        .filter(node => node !== null),
    };

    return tree;
  } catch (err) {
    console.error('[structure-manager] getTreeVisualization error:', err.message);
    return null;
  }
}
