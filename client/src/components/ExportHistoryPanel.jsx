/**
 * ExportHistoryPanel — Phase 3: Versioned Exports & Slide Metadata
 *
 * Shows a list of all exports for a chain with download buttons
 * for individual slides and ZIP archives.
 */

import { useState, useEffect, useCallback } from 'react';
import styles from './ExportHistoryPanel.module.css';

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ExportHistoryPanel({ chainId, refreshTrigger, setToast }) {
  const [exports, setExports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedExport, setExpandedExport] = useState(null);

  // ── Load exports ───────────────────────────────────────────────────────────
  const loadExports = useCallback(async () => {
    if (!chainId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/html-flow/${chainId}/exports`);
      const data = await res.json();
      if (data.ok) {
        setExports(data.exports || []);
      }
    } catch (err) {
      console.error('Failed to load exports:', err);
    } finally {
      setLoading(false);
    }
  }, [chainId]);

  useEffect(() => {
    loadExports();
  }, [loadExports, refreshTrigger]);

  // ── Download handlers ──────────────────────────────────────────────────────
  const handleDownloadSlide = useCallback((exportId, slideFile) => {
    const url = `/api/html-flow/${chainId}/exports/${exportId}/slides/${slideFile}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = slideFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [chainId]);

  const handleDownloadZip = useCallback((exportId) => {
    const url = `/api/html-flow/${chainId}/exports/${exportId}/download`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-${exportId}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [chainId]);

  const handleDeleteExport = useCallback(async (exportId) => {
    try {
      const res = await fetch(`/api/html-flow/${chainId}/exports/${exportId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.ok) {
        setToast({ type: 'success', message: `Export ${exportId} deleted` });
        setExports(prev => prev.filter(e => e.exportId !== exportId));
        if (expandedExport === exportId) setExpandedExport(null);
      } else {
        setToast({ type: 'error', message: data.error || 'Failed to delete export' });
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }, [chainId, expandedExport, setToast]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.panel}>
        <div className={styles.loading}>Loading exports...</div>
      </div>
    );
  }

  if (exports.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          No exports yet. Use "Export to Slides" after applying content.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Export History</span>
        <span className={styles.headerCount}>{exports.length} export{exports.length !== 1 ? 's' : ''}</span>
      </div>

      <div className={styles.list}>
        {exports.map(exp => {
          const isExpanded = expandedExport === exp.exportId;

          return (
            <div key={exp.exportId} className={styles.exportItem}>
              {/* Summary row */}
              <div className={styles.exportSummary}>
                <button
                  className={styles.expandButton}
                  onClick={() => setExpandedExport(isExpanded ? null : exp.exportId)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${exp.exportId}`}
                >
                  <span className={styles.expandIcon}>{isExpanded ? '▾' : '▸'}</span>
                  <span className={styles.exportId}>{exp.exportId}</span>
                  <span className={styles.exportMeta}>
                    {exp.slideCount} slide{exp.slideCount !== 1 ? 's' : ''}
                    {exp.totalSize ? ` · ${formatBytes(exp.totalSize)}` : ''}
                    {exp.createdAt ? ` · ${formatDate(exp.createdAt)}` : ''}
                  </span>
                </button>

                <div className={styles.exportActions}>
                  <button
                    className={`${styles.actionBtn} ${styles.zipBtn}`}
                    onClick={() => handleDownloadZip(exp.exportId)}
                    title="Download all slides as ZIP"
                    data-testid={`btn-download-zip-${exp.exportId}`}
                  >
                    ZIP
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={() => handleDeleteExport(exp.exportId)}
                    title="Delete this export"
                    data-testid={`btn-delete-export-${exp.exportId}`}
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Expanded slide list */}
              {isExpanded && (
                <ExportSlideList
                  chainId={chainId}
                  exportId={exp.exportId}
                  onDownloadSlide={handleDownloadSlide}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Lazy-loaded slide list for an expanded export.
 */
function ExportSlideList({ chainId, exportId, onDownloadSlide }) {
  const [slides, setSlides] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/html-flow/${chainId}/exports/${exportId}/project`);
        const data = await res.json();
        if (data.ok) {
          setSlides(data.project.slides || []);
        }
      } catch (err) {
        console.error('Failed to load export slides:', err);
        setSlides([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [chainId, exportId]);

  if (loading) {
    return <div className={styles.slideListLoading}>Loading slides...</div>;
  }

  if (!slides || slides.length === 0) {
    return <div className={styles.slideListEmpty}>No slides found.</div>;
  }

  return (
    <div className={styles.slideList}>
      {slides.map(slide => (
        <div key={slide.index} className={styles.slideRow}>
          <span className={styles.slideIndex}>{slide.index}</span>
          <div className={styles.slideInfo}>
            <span className={styles.slideTitle}>{slide.title || slide.name || slide.file}</span>
            {slide.type && slide.type !== 'content' && (
              <span className={styles.slideType}>{slide.type}</span>
            )}
            {slide.slideId && (
              <span className={styles.slideId}>{slide.slideId}</span>
            )}
          </div>
          <button
            className={`${styles.actionBtn} ${styles.downloadBtn}`}
            onClick={() => onDownloadSlide(exportId, slide.file)}
            title={`Download ${slide.file}`}
          >
            Download
          </button>
        </div>
      ))}
    </div>
  );
}
