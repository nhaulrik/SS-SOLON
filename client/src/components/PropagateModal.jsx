import { useState } from 'react'

/**
 * Modal for configuring how a shared key is propagated across slides.
 *
 * Props:
 *   sharedKey       – the key being configured (string)
 *   slideList       – array of slide indices where this key exists (number[])
 *   allKeysOnSlide  – all keys available on the current slide, for the context dropdown (string[])
 *   currentConfig   – existing PropagationConfig | null
 *   onSave(config)  – called with { mode, linkedKey? } or null to clear
 *   onClose()       – called to dismiss without saving
 */
export default function PropagateModal({
  sharedKey,
  slideList,
  allKeysOnSlide,
  currentConfig,
  onSave,
  onClose
}) {
  const [mode,      setMode]      = useState(currentConfig?.mode      ?? null)
  const [linkedKey, setLinkedKey] = useState(currentConfig?.linkedKey ?? '')

  const contextKeys = allKeysOnSlide.filter(k => k !== sharedKey)

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
        <h3>Propagate &ldquo;{sharedKey}&rdquo;</h3>

        <p className="propagate-slide-list">
          This key is tagged on slides: {slideList.join(', ')}
        </p>

        <div className="propagate-modes">
          <label className="propagate-mode-option">
            <input
              type="radio"
              name="propagate-mode"
              data-testid="mode-non-unique"
              checked={mode === 'non-unique'}
              onChange={() => setMode('non-unique')}
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
              <strong>Unique</strong> — different AI content per slide, informed by another field
            </span>
          </label>

          {mode === 'unique' && (
            <div className="propagate-linked-key">
              <label htmlFor="linked-key-select">Context field key:</label>
              <select
                id="linked-key-select"
                data-testid="linked-key-select"
                value={linkedKey}
                onChange={e => setLinkedKey(e.target.value)}
              >
                <option value="">— choose a field —</option>
                {contextKeys.map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <p className="propagate-linked-hint">
                The AI will use each slide&rsquo;s value of this field as context when generating &ldquo;{sharedKey}&rdquo;.
              </p>
            </div>
          )}
        </div>

        <div className="propagate-clear">
          <button
            className="btn-link"
            onClick={() => setMode(null)}
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
