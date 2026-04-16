/**
 * server/__tests__/relationship-manager.test.js
 *
 * Unit tests for Phase 4: Hierarchical Relationships & Bulk Assignment
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assignSlidesToParent,
  getRelationshipGraph,
  getHierarchyTree,
  getSlideRelationships,
  removeRelationship,
  getAvailableParentExports,
} from '../lib/relationship-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_CHAINS_DIR = path.join(__dirname, '../test-chains');

function createTestChain(chainId, numExports = 2) {
  const chainDir = path.join(TEST_CHAINS_DIR, chainId);
  fs.mkdirSync(chainDir, { recursive: true });

  // Create chain.json
  const chainData = {
    chainId,
    projectName: 'Test Project',
    templateFile: 'template.html',
    exports: [],
    relationshipGraph: {
      enabled: true,
      slides: [],
    },
  };

  // Create exports
  for (let i = 1; i <= numExports; i++) {
    const exportId = `export-${i}`;
    const exportDir = path.join(chainDir, 'exports', exportId);
    fs.mkdirSync(exportDir, { recursive: true });

    // Create slides-manifest.json
    const manifest = {
      exportId,
      flowId: chainId,
      exportedAt: new Date().toISOString(),
      slideCount: 3,
      slides: [
        {
          index: 1,
          file: 'slide-1.html',
          slideId: `${exportId}-slide-1`,
          title: `Export ${i} Slide 1`,
          type: 'content',
          metadata: {},
          relationships: [],
        },
        {
          index: 2,
          file: 'slide-2.html',
          slideId: `${exportId}-slide-2`,
          title: `Export ${i} Slide 2`,
          type: 'content',
          metadata: {},
          relationships: [],
        },
        {
          index: 3,
          file: 'slide-3.html',
          slideId: `${exportId}-slide-3`,
          title: `Export ${i} Slide 3`,
          type: 'content',
          metadata: {},
          relationships: [],
        },
      ],
      relationshipTypes: [
        {
          id: 'child_of',
          label: 'is a model of',
          inverse: 'has_models',
          cardinality: 'many_to_one',
        },
      ],
    };

    fs.writeFileSync(path.join(exportDir, 'slides-manifest.json'), JSON.stringify(manifest, null, 2));

    // Add to chain exports
    chainData.exports.push({
      exportId,
      exportNumber: i,
      createdAt: new Date().toISOString(),
      slideCount: 3,
      path: `exports/${exportId}/`,
      files: {
        metadata: `exports/${exportId}/export.json`,
        projectIndex: `exports/${exportId}/project.json`,
        manifest: `exports/${exportId}/slides-manifest.json`,
      },
    });
  }

  fs.writeFileSync(path.join(chainDir, 'chain.json'), JSON.stringify(chainData, null, 2));
  return chainDir;
}

function cleanupTestChain(chainId) {
  const chainDir = path.join(TEST_CHAINS_DIR, chainId);
  if (fs.existsSync(chainDir)) {
    fs.rmSync(chainDir, { recursive: true, force: true });
  }
}

describe('relationship-manager', () => {
  beforeEach(() => {
    // Mock CHAINS_DIR
    vi.stubEnv('CHAINS_DIR', TEST_CHAINS_DIR);
  });

  afterEach(() => {
    // Cleanup all test chains
    if (fs.existsSync(TEST_CHAINS_DIR)) {
      fs.rmSync(TEST_CHAINS_DIR, { recursive: true, force: true });
    }
  });

  describe('assignSlidesToParent', () => {
    it('should assign a single slide to a parent', () => {
      const chainId = 'test-chain-1';
      createTestChain(chainId);

      const result = assignSlidesToParent(
        chainId,
        'export-1',
        [1],
        'export-2',
        1,
        'child_of',
        'is a model of'
      );

      expect(result).not.toBeNull();
      expect(result.assignmentsApplied).toBe(1);
      expect(result.assigned).toHaveLength(1);
      expect(result.assigned[0].slideIndex).toBe(1);
      expect(result.assigned[0].parentSlideIndex).toBe(1);

      cleanupTestChain(chainId);
    });

    it('should assign multiple slides to a parent', () => {
      const chainId = 'test-chain-2';
      createTestChain(chainId);

      const result = assignSlidesToParent(
        chainId,
        'export-1',
        [1, 2, 3],
        'export-2',
        1,
        'child_of',
        'is a model of'
      );

      expect(result).not.toBeNull();
      expect(result.assignmentsApplied).toBe(3);
      expect(result.assigned).toHaveLength(3);

      cleanupTestChain(chainId);
    });

    it('should update manifest with relationships', () => {
      const chainId = 'test-chain-3';
      createTestChain(chainId);

      assignSlidesToParent(chainId, 'export-1', [1], 'export-2', 1);

      // Verify manifest was updated
      const manifestPath = path.join(TEST_CHAINS_DIR, chainId, 'exports', 'export-1', 'slides-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      expect(manifest.slides[0].relationships).toHaveLength(1);
      expect(manifest.slides[0].relationships[0].targetExportId).toBe('export-2');
      expect(manifest.slides[0].relationships[0].targetSlideId).toBe('export-2-slide-1');

      cleanupTestChain(chainId);
    });

    it('should update chain.json relationshipGraph', () => {
      const chainId = 'test-chain-4';
      createTestChain(chainId);

      assignSlidesToParent(chainId, 'export-1', [1, 2], 'export-2', 1);

      // Verify chain.json was updated
      const chainPath = path.join(TEST_CHAINS_DIR, chainId, 'chain.json');
      const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));

      expect(chain.relationshipGraph.slides).toHaveLength(3); // 2 children + 1 parent
      const childEntry = chain.relationshipGraph.slides.find(s => s.globalSlideId === 'export-1/1');
      expect(childEntry).toBeDefined();
      expect(childEntry.parents).toContain('export-2/1');

      const parentEntry = chain.relationshipGraph.slides.find(s => s.globalSlideId === 'export-2/1');
      expect(parentEntry).toBeDefined();
      expect(parentEntry.children).toContain('export-1/1');
      expect(parentEntry.children).toContain('export-1/2');

      cleanupTestChain(chainId);
    });

    it('should reject invalid chainId', () => {
      const result = assignSlidesToParent('invalid/chainId', 'export-1', [1], 'export-2', 1);
      expect(result).toBeNull();
    });

    it('should reject missing childExportId', () => {
      const chainId = 'test-chain-5';
      createTestChain(chainId);

      const result = assignSlidesToParent(chainId, null, [1], 'export-2', 1);
      expect(result).toBeNull();

      cleanupTestChain(chainId);
    });

    it('should reject empty childSlideIndices', () => {
      const chainId = 'test-chain-6';
      createTestChain(chainId);

      const result = assignSlidesToParent(chainId, 'export-1', [], 'export-2', 1);
      expect(result).toBeNull();

      cleanupTestChain(chainId);
    });

    it('should skip non-existent child slides', () => {
      const chainId = 'test-chain-7';
      createTestChain(chainId);

      const result = assignSlidesToParent(chainId, 'export-1', [1, 999], 'export-2', 1);

      expect(result).not.toBeNull();
      expect(result.assignmentsApplied).toBe(1); // Only slide 1 was assigned
      expect(result.assigned).toHaveLength(1);

      cleanupTestChain(chainId);
    });

    it('should replace existing relationship', () => {
      const chainId = 'test-chain-8';
      createTestChain(chainId);

      // First assignment
      assignSlidesToParent(chainId, 'export-1', [1], 'export-2', 1);

      // Second assignment (should replace)
      const result = assignSlidesToParent(
        chainId,
        'export-1',
        [1],
        'export-2',
        1,
        'child_of',
        'is a model of (updated)'
      );

      expect(result).not.toBeNull();

      // Verify manifest has only one relationship
      const manifestPath = path.join(TEST_CHAINS_DIR, chainId, 'exports', 'export-1', 'slides-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.slides[0].relationships).toHaveLength(1);

      cleanupTestChain(chainId);
    });
  });

  describe('getRelationshipGraph', () => {
    it('should return empty graph for new chain', () => {
      const chainId = 'test-chain-9';
      createTestChain(chainId);

      const graph = getRelationshipGraph(chainId);

      expect(graph).not.toBeNull();
      expect(graph.enabled).toBe(true);
      expect(graph.slides).toEqual([]);

      cleanupTestChain(chainId);
    });

    it('should return populated graph after assignments', () => {
      const chainId = 'test-chain-10';
      createTestChain(chainId);

      assignSlidesToParent(chainId, 'export-1', [1, 2], 'export-2', 1);

      const graph = getRelationshipGraph(chainId);

      expect(graph.slides).toHaveLength(3);
      const childSlides = graph.slides.filter(s => s.globalSlideId.startsWith('export-1'));
      expect(childSlides).toHaveLength(2);

      cleanupTestChain(chainId);
    });

    it('should return null for invalid chainId', () => {
      const graph = getRelationshipGraph('invalid/chainId');
      expect(graph).toBeNull();
    });
  });

  describe('getHierarchyTree', () => {
    it('should return empty tree for new chain', () => {
      const chainId = 'test-chain-11';
      createTestChain(chainId);

      const tree = getHierarchyTree(chainId);

      expect(tree).not.toBeNull();
      expect(tree.roots).toEqual([]);
      expect(tree.lookup).toEqual({});

      cleanupTestChain(chainId);
    });

    it('should build tree with roots and children', () => {
      const chainId = 'test-chain-12';
      createTestChain(chainId);

      assignSlidesToParent(chainId, 'export-1', [1, 2], 'export-2', 1);

      const tree = getHierarchyTree(chainId);

      expect(tree.roots).toHaveLength(2); // export-2/1 and export-1/3 (unassigned)
      expect(tree.lookup['export-2/1']).toBeDefined();
      expect(tree.lookup['export-2/1'].childNodes).toHaveLength(2);

      cleanupTestChain(chainId);
    });

    it('should return null for invalid chainId', () => {
      const tree = getHierarchyTree('invalid/chainId');
      expect(tree).toBeNull();
    });
  });

  describe('getSlideRelationships', () => {
    it('should return empty relationships for new slide', () => {
      const chainId = 'test-chain-13';
      createTestChain(chainId);

      const relationships = getSlideRelationships(chainId, 'export-1', 1);

      expect(relationships).not.toBeNull();
      expect(relationships.slideId).toBe('export-1-slide-1');
      expect(relationships.relationships).toEqual([]);

      cleanupTestChain(chainId);
    });

    it('should return relationships after assignment', () => {
      const chainId = 'test-chain-14';
      createTestChain(chainId);

      assignSlidesToParent(chainId, 'export-1', [1], 'export-2', 1);

      const relationships = getSlideRelationships(chainId, 'export-1', 1);

      expect(relationships).not.toBeNull();
      expect(relationships.relationships).toHaveLength(1);
      expect(relationships.relationships[0].targetExportId).toBe('export-2');

      cleanupTestChain(chainId);
    });

    it('should return null for non-existent slide', () => {
      const chainId = 'test-chain-15';
      createTestChain(chainId);

      const relationships = getSlideRelationships(chainId, 'export-1', 999);

      expect(relationships).toBeNull();

      cleanupTestChain(chainId);
    });

    it('should return null for non-existent export', () => {
      const chainId = 'test-chain-16';
      createTestChain(chainId);

      const relationships = getSlideRelationships(chainId, 'export-999', 1);

      expect(relationships).toBeNull();

      cleanupTestChain(chainId);
    });
  });

  describe('removeRelationship', () => {
    it('should remove a relationship', () => {
      const chainId = 'test-chain-17';
      createTestChain(chainId);

      assignSlidesToParent(chainId, 'export-1', [1], 'export-2', 1);

      const success = removeRelationship(chainId, 'export-1', 1, 'export-2', 1);

      expect(success).toBe(true);

      // Verify manifest was updated
      const manifestPath = path.join(TEST_CHAINS_DIR, chainId, 'exports', 'export-1', 'slides-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.slides[0].relationships).toEqual([]);

      cleanupTestChain(chainId);
    });

    it('should update chain.json after removal', () => {
      const chainId = 'test-chain-18';
      createTestChain(chainId);

      assignSlidesToParent(chainId, 'export-1', [1], 'export-2', 1);
      removeRelationship(chainId, 'export-1', 1, 'export-2', 1);

      const chainPath = path.join(TEST_CHAINS_DIR, chainId, 'chain.json');
      const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));

      const childEntry = chain.relationshipGraph.slides.find(s => s.globalSlideId === 'export-1/1');
      expect(childEntry.parents).toEqual([]);

      const parentEntry = chain.relationshipGraph.slides.find(s => s.globalSlideId === 'export-2/1');
      expect(parentEntry.children).toEqual([]);

      cleanupTestChain(chainId);
    });

    it('should return true for non-existent relationship', () => {
      const chainId = 'test-chain-19';
      createTestChain(chainId);

      const success = removeRelationship(chainId, 'export-1', 1, 'export-2', 1);

      expect(success).toBe(true); // Idempotent

      cleanupTestChain(chainId);
    });

    it('should return false for invalid chainId', () => {
      const success = removeRelationship('invalid/chainId', 'export-1', 1, 'export-2', 1);
      expect(success).toBe(false);
    });
  });

  describe('getAvailableParentExports', () => {
    it('should return all exports with slides', () => {
      const chainId = 'test-chain-20';
      createTestChain(chainId, 3);

      const parentExports = getAvailableParentExports(chainId);

      expect(parentExports).not.toBeNull();
      expect(parentExports).toHaveLength(3);
      expect(parentExports[0].slides).toHaveLength(3);

      cleanupTestChain(chainId);
    });

    it('should return null for invalid chainId', () => {
      const parentExports = getAvailableParentExports('invalid/chainId');
      expect(parentExports).toBeNull();
    });

    it('should include exportId and exportNumber', () => {
      const chainId = 'test-chain-21';
      createTestChain(chainId);

      const parentExports = getAvailableParentExports(chainId);

      expect(parentExports[0].exportId).toBe('export-1');
      expect(parentExports[0].exportNumber).toBe(1);

      cleanupTestChain(chainId);
    });
  });

  describe('integration: complex relationship scenarios', () => {
    it('should handle multiple parent-child relationships', () => {
      const chainId = 'test-chain-22';
      createTestChain(chainId);

      // Assign export-1 slides to export-2/1
      assignSlidesToParent(chainId, 'export-1', [1, 2], 'export-2', 1);

      // Assign export-2/2 and export-2/3 to export-3 (if we had it)
      // For now, just verify the first assignment worked
      const graph = getRelationshipGraph(chainId);
      expect(graph.slides).toHaveLength(3);

      cleanupTestChain(chainId);
    });

    it('should maintain consistency across operations', () => {
      const chainId = 'test-chain-23';
      createTestChain(chainId);

      // Assign
      assignSlidesToParent(chainId, 'export-1', [1, 2], 'export-2', 1);

      // Verify in manifest
      const manifestPath = path.join(TEST_CHAINS_DIR, chainId, 'exports', 'export-1', 'slides-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.slides[0].relationships).toHaveLength(1);
      expect(manifest.slides[1].relationships).toHaveLength(1);

      // Verify in chain.json
      const chainPath = path.join(TEST_CHAINS_DIR, chainId, 'chain.json');
      const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
      expect(chain.relationshipGraph.slides).toHaveLength(3);

      // Remove one relationship
      removeRelationship(chainId, 'export-1', 1, 'export-2', 1);

      // Verify consistency
      const updatedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(updatedManifest.slides[0].relationships).toEqual([]);
      expect(updatedManifest.slides[1].relationships).toHaveLength(1);

      const updatedChain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
      const parentEntry = updatedChain.relationshipGraph.slides.find(s => s.globalSlideId === 'export-2/1');
      expect(parentEntry.children).toEqual(['export-1/2']);

      cleanupTestChain(chainId);
    });
  });
});
