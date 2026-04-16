/**
 * server/lib/relationship-manager.js
 *
 * Phase 4: Hierarchical Relationships & Bulk Assignment
 *
 * Manages parent-child relationships between slides across different exports.
 * Supports bulk assignment, querying the full relationship graph, and building
 * hierarchy trees for visualization.
 *
 * Data model:
 *   - Each export has a slides-manifest.json with a relationships array per slide
 *   - Each chain has a relationshipGraph in chain.json tracking all relationships
 *   - Relationships are stored bidirectionally (child_of and has_models)
 */

import fs from 'fs';
import path from 'path';
import { CHAINS_DIR } from '../config.js';

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
    console.error(`[relationship-manager] Failed to load chain ${chainId}:`, err.message);
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
    console.error(`[relationship-manager] Failed to save chain ${chainId}:`, err.message);
    return false;
  }
}

// ── Manifest I/O ──────────────────────────────────────────────────────────────

function loadManifest(chainId, exportId) {
  const exportDir = resolveExportDir(chainId, exportId);
  if (!exportDir) return null;
  const manifestPath = path.join(exportDir, 'slides-manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    console.error(`[relationship-manager] Failed to load manifest ${chainId}/${exportId}:`, err.message);
    return null;
  }
}

function saveManifest(chainId, exportId, manifest) {
  const exportDir = resolveExportDir(chainId, exportId);
  if (!exportDir) return false;
  const manifestPath = path.join(exportDir, 'slides-manifest.json');
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`[relationship-manager] Failed to save manifest ${chainId}/${exportId}:`, err.message);
    return false;
  }
}

// ── Relationship Assignment ───────────────────────────────────────────────────

/**
 * Bulk assign multiple slides to a parent slide.
 *
 * @param {string} chainId - The chain ID
 * @param {string} childExportId - The export containing child slides (e.g., "export-1")
 * @param {number[]} childSlideIndices - Array of slide indices to assign (1-indexed)
 * @param {string} parentExportId - The export containing the parent slide (e.g., "export-2")
 * @param {number} parentSlideIndex - Index of parent slide (1-indexed)
 * @param {string} relationshipType - Type of relationship (e.g., "child_of")
 * @param {string} relationshipLabel - Label for the relationship (e.g., "is a model of")
 * @returns {object|null} Result with assignmentsApplied and assigned[], or null on error
 */
export function assignSlidesToParent(
  chainId,
  childExportId,
  childSlideIndices,
  parentExportId,
  parentSlideIndex,
  relationshipType = 'child_of',
  relationshipLabel = 'is a model of'
) {
  try {
    // Validate inputs
    if (!chainId || !childExportId || !parentExportId) {
      throw new Error('chainId, childExportId, and parentExportId are required');
    }
    if (!Array.isArray(childSlideIndices) || childSlideIndices.length === 0) {
      throw new Error('childSlideIndices must be a non-empty array');
    }
    if (typeof parentSlideIndex !== 'number' || parentSlideIndex < 1) {
      throw new Error('parentSlideIndex must be a positive number');
    }

    // Load manifests
    const childManifest = loadManifest(chainId, childExportId);
    if (!childManifest) {
      throw new Error(`Child export manifest not found: ${childExportId}`);
    }

    const parentManifest = loadManifest(chainId, parentExportId);
    if (!parentManifest) {
      throw new Error(`Parent export manifest not found: ${parentExportId}`);
    }

    // Validate parent slide exists
    const parentSlide = parentManifest.slides.find(s => s.index === parentSlideIndex);
    if (!parentSlide) {
      throw new Error(`Parent slide not found: index ${parentSlideIndex}`);
    }

    const assigned = [];

    // Assign each child slide
    for (const childSlideIndex of childSlideIndices) {
      const childSlide = childManifest.slides.find(s => s.index === childSlideIndex);
      if (!childSlide) {
        console.warn(`[relationship-manager] Child slide not found: index ${childSlideIndex}`);
        continue;
      }

      // Create relationship
      const relationship = {
        type: relationshipType,
        targetSlideId: parentSlide.slideId,
        targetExportId: parentExportId,
        targetTitle: parentSlide.title,
        relationshipLabel,
      };

      // Add to child slide's relationships
      if (!childSlide.relationships) {
        childSlide.relationships = [];
      }

      // Check if relationship already exists
      const existingIndex = childSlide.relationships.findIndex(
        r => r.targetExportId === parentExportId && r.targetSlideId === parentSlide.slideId
      );

      if (existingIndex >= 0) {
        childSlide.relationships[existingIndex] = relationship;
      } else {
        childSlide.relationships.push(relationship);
      }

      assigned.push({
        slideIndex: childSlideIndex,
        slideId: childSlide.slideId,
        title: childSlide.title,
        parentSlideIndex,
        parentSlideId: parentSlide.slideId,
        parentTitle: parentSlide.title,
      });
    }

    // Save updated child manifest
    if (!saveManifest(chainId, childExportId, childManifest)) {
      throw new Error('Failed to save child manifest');
    }

    // Update chain.json with relationship graph
    const chain = loadChain(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    if (!chain.relationshipGraph) {
      chain.relationshipGraph = {
        enabled: true,
        slides: [],
      };
    }

    // Add/update entries in relationship graph
    for (const assignment of assigned) {
      const globalSlideId = `${childExportId}/${assignment.slideIndex}`;
      let graphEntry = chain.relationshipGraph.slides.find(s => s.globalSlideId === globalSlideId);

      if (!graphEntry) {
        graphEntry = {
          globalSlideId,
          exportId: childExportId,
          slideIndex: assignment.slideIndex,
          slideId: assignment.slideId,
          title: assignment.title,
          type: 'content',
          children: [],
          parents: [],
        };
        chain.relationshipGraph.slides.push(graphEntry);
      }

      // Add parent to parents array if not already there
      const parentGlobalId = `${parentExportId}/${parentSlideIndex}`;
      if (!graphEntry.parents.includes(parentGlobalId)) {
        graphEntry.parents.push(parentGlobalId);
      }
    }

    // Update parent slide's children list
    const parentGlobalId = `${parentExportId}/${parentSlideIndex}`;
    let parentGraphEntry = chain.relationshipGraph.slides.find(s => s.globalSlideId === parentGlobalId);

    if (!parentGraphEntry) {
      // Create parent entry if it doesn't exist
      const parentSlide = parentManifest.slides.find(s => s.index === parentSlideIndex);
      parentGraphEntry = {
        globalSlideId: parentGlobalId,
        exportId: parentExportId,
        slideIndex: parentSlideIndex,
        slideId: parentSlide.slideId,
        title: parentSlide.title,
        type: 'content',
        children: [],
        parents: [],
      };
      chain.relationshipGraph.slides.push(parentGraphEntry);
    }

    // Add children to parent's children array
    for (const assignment of assigned) {
      const childGlobalId = `${childExportId}/${assignment.slideIndex}`;
      if (!parentGraphEntry.children.includes(childGlobalId)) {
        parentGraphEntry.children.push(childGlobalId);
      }
    }

    chain.updatedAt = new Date().toISOString();

    if (!saveChain(chainId, chain)) {
      throw new Error('Failed to update chain.json with relationship graph');
    }

    return {
      assignmentsApplied: assigned.length,
      assigned,
    };
  } catch (err) {
    console.error('[relationship-manager] assignSlidesToParent error:', err.message);
    return null;
  }
}

// ── Relationship Querying ─────────────────────────────────────────────────────

/**
 * Get the full relationship graph for a chain.
 *
 * @param {string} chainId - The chain ID
 * @returns {object|null} The relationship graph from chain.json, or null on error
 */
export function getRelationshipGraph(chainId) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    return chain.relationshipGraph || { enabled: false, slides: [] };
  } catch (err) {
    console.error('[relationship-manager] getRelationshipGraph error:', err.message);
    return null;
  }
}

/**
 * Get relationships as a tree structure for visualization.
 * Returns root nodes (slides with no parents) and their descendants.
 *
 * @param {string} chainId - The chain ID
 * @returns {object|null} Tree structure with roots and lookup, or null on error
 */
export function getHierarchyTree(chainId) {
  try {
    const graph = getRelationshipGraph(chainId);
    if (!graph || !graph.slides) {
      return { roots: [], lookup: {} };
    }

    const lookup = {};
    const roots = [];

    // Build lookup and identify roots
    for (const slide of graph.slides) {
      lookup[slide.globalSlideId] = {
        ...slide,
        childNodes: [],
      };

      if (!slide.parents || slide.parents.length === 0) {
        roots.push(slide.globalSlideId);
      }
    }

    // Build tree structure
    for (const slide of graph.slides) {
      if (slide.children && slide.children.length > 0) {
        for (const childId of slide.children) {
          if (lookup[childId]) {
            lookup[slide.globalSlideId].childNodes.push(lookup[childId]);
          }
        }
      }
    }

    return {
      roots: roots.map(id => lookup[id]),
      lookup,
    };
  } catch (err) {
    console.error('[relationship-manager] getHierarchyTree error:', err.message);
    return null;
  }
}

/**
 * Get all relationships for a specific slide.
 *
 * @param {string} chainId - The chain ID
 * @param {string} exportId - The export ID (e.g., "export-1")
 * @param {number} slideIndex - The slide index (1-indexed)
 * @returns {object|null} Slide relationships, or null on error
 */
export function getSlideRelationships(chainId, exportId, slideIndex) {
  try {
    const manifest = loadManifest(chainId, exportId);
    if (!manifest) {
      throw new Error(`Manifest not found: ${exportId}`);
    }

    const slide = manifest.slides.find(s => s.index === slideIndex);
    if (!slide) {
      throw new Error(`Slide not found: index ${slideIndex}`);
    }

    return {
      slideId: slide.slideId,
      title: slide.title,
      relationships: slide.relationships || [],
    };
  } catch (err) {
    console.error('[relationship-manager] getSlideRelationships error:', err.message);
    return null;
  }
}

/**
 * Remove a relationship between two slides.
 *
 * @param {string} chainId - The chain ID
 * @param {string} childExportId - The export containing the child slide
 * @param {number} childSlideIndex - Index of child slide (1-indexed)
 * @param {string} parentExportId - The export containing the parent slide
 * @param {number} parentSlideIndex - Index of parent slide (1-indexed)
 * @returns {boolean} True if successful, false otherwise
 */
export function removeRelationship(
  chainId,
  childExportId,
  childSlideIndex,
  parentExportId,
  parentSlideIndex
) {
  try {
    // Load and update child manifest
    const childManifest = loadManifest(chainId, childExportId);
    if (!childManifest) {
      throw new Error(`Child manifest not found: ${childExportId}`);
    }

    const childSlide = childManifest.slides.find(s => s.index === childSlideIndex);
    if (!childSlide) {
      throw new Error(`Child slide not found: index ${childSlideIndex}`);
    }

    // Remove relationship from child slide
    if (childSlide.relationships) {
      childSlide.relationships = childSlide.relationships.filter(
        r => !(r.targetExportId === parentExportId && r.targetSlideIndex === parentSlideIndex)
      );
    }

    if (!saveManifest(chainId, childExportId, childManifest)) {
      throw new Error('Failed to save child manifest');
    }

    // Update chain.json relationship graph
    const chain = loadChain(chainId);
    if (!chain || !chain.relationshipGraph) {
      return true; // No graph to update
    }

    const childGlobalId = `${childExportId}/${childSlideIndex}`;
    const parentGlobalId = `${parentExportId}/${parentSlideIndex}`;

    const childEntry = chain.relationshipGraph.slides.find(s => s.globalSlideId === childGlobalId);
    if (childEntry && childEntry.parents) {
      childEntry.parents = childEntry.parents.filter(p => p !== parentGlobalId);
    }

    const parentEntry = chain.relationshipGraph.slides.find(s => s.globalSlideId === parentGlobalId);
    if (parentEntry && parentEntry.children) {
      parentEntry.children = parentEntry.children.filter(c => c !== childGlobalId);
    }

    chain.updatedAt = new Date().toISOString();

    if (!saveChain(chainId, chain)) {
      throw new Error('Failed to update chain.json');
    }

    return true;
  } catch (err) {
    console.error('[relationship-manager] removeRelationship error:', err.message);
    return false;
  }
}

/**
 * Get all available parent exports (exports that can be assigned as parents).
 * Returns list of exports with their slides.
 *
 * @param {string} chainId - The chain ID
 * @returns {object[]|null} Array of exports with slides, or null on error
 */
export function getAvailableParentExports(chainId) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    const exports = chain.exports || [];
    const parentExports = [];

    for (const exportEntry of exports) {
      const manifest = loadManifest(chainId, exportEntry.exportId);
      if (manifest) {
        parentExports.push({
          exportId: exportEntry.exportId,
          exportNumber: exportEntry.exportNumber,
          createdAt: exportEntry.createdAt,
          slideCount: manifest.slideCount,
          slides: manifest.slides.map(s => ({
            index: s.index,
            slideId: s.slideId,
            title: s.title,
            type: s.type,
          })),
        });
      }
    }

    return parentExports;
  } catch (err) {
    console.error('[relationship-manager] getAvailableParentExports error:', err.message);
    return null;
  }
}
