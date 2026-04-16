/**
 * RelationshipViewer — Phase 4: Hierarchical Relationships Display
 *
 * Displays the hierarchy tree of slide relationships across exports.
 * Shows parent-child relationships in a collapsible tree structure.
 */

import { useState, useEffect } from 'react';
import styles from './RelationshipViewer.module.css';

export default function RelationshipViewer({ chainId, setToast }) {
  const [tree, setTree] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Load hierarchy tree on mount
  useEffect(() => {
    loadHierarchyTree();
  }, [chainId]);

  const loadHierarchyTree = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/html-flow/${chainId}/relationships/hierarchy`);
      const result = await response.json();
      if (result.ok && result.tree) {
        setTree(result.tree);
      } else {
        setToast({ type: 'error', message: 'Failed to load relationship hierarchy' });
      }
    } catch (err) {
      console.error('Failed to load hierarchy tree:', err);
      setToast({ type: 'error', message: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleNodeExpansion = (nodeId) => {
    setExpandedNodes(prev => {
      const updated = new Set(prev);
      if (updated.has(nodeId)) {
        updated.delete(nodeId);
      } else {
        updated.add(nodeId);
      }
      return updated;
    });
  };

  const renderNode = (node, depth = 0) => {
    if (!node) return null;

    const isExpanded = expandedNodes.has(node.globalSlideId);
    const hasChildren = node.childNodes && node.childNodes.length > 0;

    return (
      <div key={node.globalSlideId} className={styles.nodeWrapper}>
        <div
          className={styles.nodeContent}
          style={{ paddingLeft: `${depth * 20}px` }}
        >
          {hasChildren && (
            <button
              className={styles.expandButton}
              onClick={() => toggleNodeExpansion(node.globalSlideId)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {!hasChildren && <span className={styles.noExpandButton} />}

          <div className={styles.nodeLabel}>
            <span className={styles.slideId}>{node.globalSlideId}</span>
            <span className={styles.slideTitle}>{node.title}</span>
          </div>

          {node.children && node.children.length > 0 && (
            <span className={styles.childCount}>
              {node.children.length} child{node.children.length !== 1 ? 'ren' : ''}
            </span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className={styles.childrenContainer}>
            {node.childNodes.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>Loading relationship hierarchy...</p>
      </div>
    );
  }

  if (!tree || tree.roots.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.emptyText}>No relationships defined yet</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Relationship Hierarchy</h3>
        <button
          className={styles.refreshButton}
          onClick={loadHierarchyTree}
          aria-label="Refresh"
        >
          ↻
        </button>
      </div>

      <div className={styles.tree}>
        {tree.roots.map(root => renderNode(root))}
      </div>
    </div>
  );
}
