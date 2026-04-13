import { useState } from 'react'

/**
 * Modal for configuring how a shared key is propagated across slides.
 *
 * Props:
 *   sharedKey             – the key being configured (string)
 *   slideList             – array of slide indices where this key exists (number[])
 *   currentSlideElements  – tags on the current slide excluding sharedKey itself
 *                           used to populate the click-to-pick context list
 *   currentConfig         – existing PropagationConfig | null
 *   onSave(config)        – called with { mode, linkedKey? } or null to clear
 *   onClose()             – called to dismiss without saving
 */
export default function PropagateModal({
  sharedKey,
  slideList,
  currentSlideElements = [],
  currentConfig,
  onSave,
  onClose
}) {
  const [mode,        setMode]        = useState(currentConfig?.mode      ?? null)
  const [linkedKey,   setLinkedKey]   = useState(currentConfig?.linkedKey ?? '')

  const handleSave = () => {
    if (!mode) {
      onSave(null)
    } else if (mode === 'unique') {
      onSave({ mode, linkedKey: linkedKey || undefined })
    } else {
      onSave({ mode })
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content propagate-modal" onClick={e => e.stopPropagation()}>
        <h3 className="propagate-modal-title">
          Propagate<br />
          <code className="propagate-key-pill">{sharedKey}</code>
        </h3>

        <p className="propagate-slide-list">
          Tagged on slides: {slideList.join(', ')}
        </p>

        <div className="propagate-modes">
          <label className="propagate-mode-option">
            <input
              type="radio"
              name="propagate-mode"
              data-testid="mode-non-unique"
              checked={mode === 'non-unique'}
              onChange={() => { setMode('non-unique'); setLinkedKey('') }}
            />
            <span>
              <strong>Non-unique</strong> — same AI-generated content on all slides with this key
            </span>
          </label>

          <label className="propagate-mode-option">
            <input
              type="radio"
              name="propagate-mode"
              data-testid="mode-unique"
              checked={mode === 'unique'}
              onChange={() => setMode('unique')}
            />
            <span>
              <strong>Unique</strong> — different AI content per slide, informed by another element
            </span>
          </label>
        </div>

        {mode === 'unique' && (
          <div className="propagate-unique-section">
            <p className="propagate-pick-prompt" data-testid="propagate-pick-prompt">
              Click an element below to use as context when generating{' '}
              <code className="propagate-key-pill">{sharedKey}</code>{' '}
              for each slide.
            </p>

            <div className="propagate-pick-overlay" data-testid="propagate-pick-overlay">
              <div className="propagate-pick-header">
                <span>Key</span>
                <span>Element Text</span>
              </div>
              {currentSlideElements.length === 0 ? (
                <p className="propagate-pick-empty">
                  No other tagged elements on this slide to use as context.
                </p>
              ) : (
                currentSlideElements.map(elem => (
                  <div
                    key={elem.elementId}
                    className={`propagate-pick-item${linkedKey === elem.key ? ' propagate-pick-item--selected' : ''}`}
                    onClick={() => setLinkedKey(elem.key)}
                  >
                    <span className="propagate-pick-item-key">{elem.key}</span>
                    <span className="propagate-pick-item-text">{elem.originalText}</span>
                  </div>
                ))
              )}
            </div>

            {linkedKey && (
              <p className="propagate-context-display" data-testid="propagate-context-display">
                Context: <strong>{linkedKey}</strong>
              </p>
            )}
          </div>
        )}

        <div className="propagate-clear">
          <button
            className="btn-link"
            onClick={() => { setMode(null); setLinkedKey('') }}
            disabled={mode === null}
          >
            Clear (revert to auto-detect)
          </button>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            data-testid="propagate-save"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
