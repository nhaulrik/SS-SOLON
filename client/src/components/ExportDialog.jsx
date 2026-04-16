/**
 * ExportDialog — Phase 3 & 4A: Versioned Exports (Simplified)
 *
 * A single-step modal dialog for exporting slides:
 * - Edit slide metadata (slideId, name, type)
 * - No embedded relationships (Phase 4B+ handles relationships separately)
 */

import { useState, useCallback } from 'react';
import styles from './ExportDialog.module.css';

const SLIDE_TYPES = ['content', 'title', 'conclusion', 'other'];

export default function ExportDialog({
  projectName,
  flowId,
  roundId,
  outputFile,
  slideCount,
  onClose,
  onExported,
  setToast,
}) {
  // ── Metadata state ─────────────────────────────────────────────────────────
  const [metadata, setMetadata] = useState(
    Array.from({ length: slideCount }, (_, i) => ({
      slideId: `slide-${i + 1}`,
      name: `Slide ${i + 1}`,
      type: 'content',
    }))
  );

  const [isExporting, setIsExporting] = useState(false);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleMetadataChange = useCallback((index, field, value) => {
    setMetadata(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/projects/${projectName}/flows/${flowId}/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId,
          outputFile,
          slideMetadata: metadata,
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        setToast({ type: 'error', message: result.error || 'Export failed' });
        return;
      }

      setToast({
        type: 'success',
        message: `Export created: ${result.slideCount} slides saved as ${result.exportId}`,
      });

      onExported(result);
      onClose();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setIsExporting(false);
    }
  }, [projectName, flowId, roundId, outputFile, metadata, onExported, onClose, setToast]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title} id="export-dialog-title">
            Export to Slides
          </h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close dialog"
            disabled={isExporting}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          <p className={styles.description}>
            Export this generation as {slideCount} individual slide file{slideCount !== 1 ? 's' : ''}.
            Optionally edit the metadata for each slide.
          </p>

          {/* Slide metadata table */}
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>#</th>
                  <th className={styles.th}>Slide ID</th>
                  <th className={styles.th}>Name</th>
                  <th className={styles.th}>Type</th>
                </tr>
              </thead>
              <tbody>
                {metadata.map((slide, i) => (
                  <tr key={i} className={styles.tr}>
                    <td className={styles.tdIndex}>{i + 1}</td>
                    <td className={styles.td}>
                      <input
                        className={styles.input}
                        value={slide.slideId}
                        onChange={e => handleMetadataChange(i, 'slideId', e.target.value)}
                        placeholder={`slide-${i + 1}`}
                        disabled={isExporting}
                      />
                    </td>
                    <td className={styles.td}>
                      <input
                        className={styles.input}
                        value={slide.name}
                        onChange={e => handleMetadataChange(i, 'name', e.target.value)}
                        placeholder={`Slide ${i + 1}`}
                        disabled={isExporting}
                      />
                    </td>
                    <td className={styles.td}>
                      <select
                        className={styles.select}
                        value={slide.type}
                        onChange={e => handleMetadataChange(i, 'type', e.target.value)}
                        disabled={isExporting}
                      >
                        {SLIDE_TYPES.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={isExporting}
          >
            Cancel
          </button>

          <button
            className={styles.primaryButton}
            onClick={handleExport}
            disabled={isExporting}
            data-testid="btn-export-confirm"
          >
            {isExporting ? 'Exporting...' : `Export ${slideCount} Slide${slideCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
