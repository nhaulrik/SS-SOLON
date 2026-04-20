import { useMemo } from 'react'
import styles from './StructurePreview.module.css'

function flattenTreeForPreview(tree, slides, depth = 0) {
  const result = []
  for (const node of tree) {
    const slide = slides.find(s => s.id === node.slideRefId)
    result.push({ node, slide, depth })
    if (node.children && node.children.length > 0) {
      result.push(...flattenTreeForPreview(node.children, slides, depth + 1))
    }
  }
  return result
}

export default function StructurePreview({ slides, tree, levelNames, projectName }) {
  const flat = useMemo(() => flattenTreeForPreview(tree, slides), [tree, slides])

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Preview</span>
        <span className={styles.slideCount}>{flat.length} slide{flat.length !== 1 ? 's' : ''}</span>
      </div>

      {flat.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Add slides to the tree to see a preview here.</p>
        </div>
      ) : (
        <div className={styles.previewList}>
          {flat.map(({ node, slide, depth }, idx) => (
            <div
              key={node.slideRefId}
              className={styles.previewNode}
              style={{ '--depth': depth }}
            >
              {/* Depth connector lines */}
              <div className={styles.depthLine} style={{ width: `${depth * 20}px` }} aria-hidden="true" />

              {/* Connector icon */}
              {depth > 0 && (
                <span className={styles.connector} aria-hidden="true">└</span>
              )}

              {/* Slide card */}
              <div className={styles.slideCard}>
                {/* Thumbnail placeholder */}
                <div className={styles.thumbnail} aria-hidden="true">
                  <span className={styles.thumbnailIndex}>{idx + 1}</span>
                </div>

                {/* Info */}
                <div className={styles.slideInfo}>
                  <span className={styles.slideTitle}>{slide?.title || 'Untitled'}</span>
                  <span className={styles.slideMeta}>
                    {slide?.exportId} · Slide {slide?.slideIndex}
                    {((levelNames || [])[depth] || depth > 0) && (
                      <span className={styles.depthBadge}>
                        {(levelNames || [])[depth] || `Level ${depth}`}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
