/**
 * ExportDialog — Phase 3 & 4: Versioned Exports & Hierarchical Relationships
 *
 * A modal dialog with two steps:
 * Step 1: Edit slide metadata (slideId, name, type)
 * Step 2: Optionally assign slides to parent slides (bulk assignment)
 */

import { useState, useCallback, useEffect } from 'react';
import styles from './ExportDialog.module.css';

const SLIDE_TYPES = ['content', 'title', 'conclusion', 'other'];

export default function ExportDialog({
  chainId,
  roundId,
  outputFile,
  slideCount,
  onClose,
  onExported,
  setToast,
}) {
  // ── Step navigation ────────────────────────────────────────────────────────
  const [step, setStep] = useState(1); // 1 = metadata, 2 = relationships

  // ── Metadata state ─────────────────────────────────────────────────────────
  const [metadata, setMetadata] = useState(
    Array.from({ length: slideCount }, (_, i) => ({
      slideId: `slide-${i + 1}`,
      name: `Slide ${i + 1}`,
      type: 'content',
    }))
  );

  // ── Relationship state ─────────────────────────────────────────────────────
  const [selectedSlides, setSelectedSlides] = useState(new Set());
  const [parentExports, setParentExports] = useState([]);
  const [selectedParent, setSelectedParent] = useState(null);
  const [selectedParentSlide, setSelectedParentSlide] = useState(null);
  const [isLoadingParents, setIsLoadingParents] = useState(false);
  const [assignmentSummary, setAssignmentSummary] = useState('');

  const [isExporting, setIsExporting] = useState(false);

  // ── Load available parent exports on mount ─────────────────────────────────
  useEffect(() => {
    if (step === 2) {
      loadParentExports();
    }
  }, [step]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const loadParentExports = useCallback(async () => {
    setIsLoadingParents(true);
    try {
      const response = await fetch(`/api/html-flow/${chainId}/relationships/available-parents`);
      const result = await response.json();
      if (result.ok && result.parentExports) {
        setParentExports(result.parentExports);
      }
    } catch (err) {
      console.error('Failed to load parent exports:', err);
    } finally {
      setIsLoadingParents(false);
    }
  }, [chainId]);

  const handleMetadataChange = useCallback((index, field, value) => {
    setMetadata(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const handleToggleSlide = useCallback((slideIndex) => {
    setSelectedSlides(prev => {
      const updated = new Set(prev);
      if (updated.has(slideIndex)) {
        updated.delete(slideIndex);
      } else {
        updated.add(slideIndex);
      }
      return updated;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedSlides.size === slideCount) {
      setSelectedSlides(new Set());
    } else {
      setSelectedSlides(new Set(Array.from({ length: slideCount }, (_, i) => i + 1)));
    }
  }, [slideCount, selectedSlides.size]);

  const handleParentChange = useCallback((exportId) => {
    setSelectedParent(exportId);
    setSelectedParentSlide(null);
    setAssignmentSummary('');
  }, []);

  const handleParentSlideChange = useCallback((slideIndex) => {
    setSelectedParentSlide(slideIndex);
    if (selectedSlides.size > 0) {
      setAssignmentSummary(
        `Will assign ${selectedSlides.size} slide${selectedSlides.size !== 1 ? 's' : ''} to parent slide ${slideIndex}`
      );
    }
  }, [selectedSlides.size]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      // Step 1: Create the export
      const response = await fetch(`/api/html-flow/${chainId}/exports`, {
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

      // Step 2: If user selected relationships, apply them
      if (selectedSlides.size > 0 && selectedParent && selectedParentSlide !== null) {
        const childExportId = result.exportId;
        const childSlideIndices = Array.from(selectedSlides);

        const assignResponse = await fetch(`/api/html-flow/${chainId}/relationships/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            childExportId,
            childSlideIndices,
            parentExportId: selectedParent,
            parentSlideIndex: selectedParentSlide,
            relationshipType: 'child_of',
            relationshipLabel: 'is a model of',
          }),
        });

        const assignResult = await assignResponse.json();
        if (!assignResult.ok) {
          console.warn('Failed to assign relationships:', assignResult.error);
          // Don't fail the export if relationships fail
        }
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
  }, [chainId, roundId, outputFile, metadata, selectedSlides, selectedParent, selectedParentSlide, onExported, onClose, setToast]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title} id="export-dialog-title">
            Export to Slides {step === 2 && '— Step 2: Relationships'}
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
          {step === 1 ? (
            <>
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
            </>
          ) : (
            <>
              <p className={styles.description}>
                Optionally assign slides to parent slides to create hierarchical relationships.
              </p>

              {/* Select All / Deselect All */}
              <div className={styles.relationshipControls}>
                <button
                  className={styles.selectAllButton}
                  onClick={handleSelectAll}
                  disabled={isLoadingParents || isExporting}
                >
                  {selectedSlides.size === slideCount ? 'Deselect All' : 'Select All'}
                </button>
                <span className={styles.selectionCount}>
                  {selectedSlides.size} of {slideCount} selected
                </span>
              </div>

              {/* Slide selection list */}
              <div className={styles.slideList}>
                <h3 className={styles.sectionTitle}>Child Slides</h3>
                <div className={styles.slideCheckboxes}>
                  {metadata.map((slide, i) => (
                    <label key={i} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={selectedSlides.has(i + 1)}
                        onChange={() => handleToggleSlide(i + 1)}
                        disabled={isLoadingParents || isExporting}
                        className={styles.checkbox}
                      />
                      <span className={styles.checkboxText}>
                        Slide {i + 1}: {slide.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Parent selection */}
              {selectedSlides.size > 0 && (
                <div className={styles.parentSelection}>
                  <h3 className={styles.sectionTitle}>Assign to Parent</h3>

                  {isLoadingParents ? (
                    <p className={styles.loadingText}>Loading parent exports...</p>
                  ) : parentExports.length === 0 ? (
                    <p className={styles.noParentsText}>No parent exports available</p>
                  ) : (
                    <>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>Parent Export:</label>
                        <select
                          className={styles.select}
                          value={selectedParent || ''}
                          onChange={e => handleParentChange(e.target.value)}
                          disabled={isExporting}
                        >
                          <option value="">Select a parent export...</option>
                          {parentExports.map(exp => (
                            <option key={exp.exportId} value={exp.exportId}>
                              {exp.exportId} ({exp.slideCount} slides)
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedParent && (
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Parent Slide:</label>
                          <select
                            className={styles.select}
                            value={selectedParentSlide || ''}
                            onChange={e => handleParentSlideChange(parseInt(e.target.value, 10))}
                            disabled={isExporting}
                          >
                            <option value="">Select a parent slide...</option>
                            {parentExports
                              .find(exp => exp.exportId === selectedParent)
                              ?.slides.map(slide => (
                                <option key={slide.index} value={slide.index}>
                                  Slide {slide.index}: {slide.title}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}

                      {assignmentSummary && (
                        <div className={styles.assignmentSummary}>
                          {assignmentSummary}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
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

          {step === 1 && (
            <button
              className={styles.primaryButton}
              onClick={() => setStep(2)}
              disabled={isExporting}
            >
              Next: Relationships →
            </button>
          )}

          {step === 2 && (
            <>
              <button
                className={styles.secondaryButton}
                onClick={() => setStep(1)}
                disabled={isExporting}
              >
                ← Back
              </button>
              <button
                className={styles.primaryButton}
                onClick={handleExport}
                disabled={isExporting}
                data-testid="btn-export-confirm"
              >
                {isExporting ? 'Exporting...' : `Export ${slideCount} Slide${slideCount !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
