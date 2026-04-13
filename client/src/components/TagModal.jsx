import { useState } from 'react'

/**
 * Modal for creating or editing a placeholder tag on a slide element.
 *
 * All inputs are controlled — no getElementById or imperative DOM access.
 * isSharedKey / isDuplicateOnSlide are derived from state on every render
 * so notices update live as the user types.
 */
export default function TagModal({ tagModal, tags, onSave, onClose, onDelete }) {
  const existing        = tagModal.existingTag
  const calcMax         = tagModal.element.maxChars || 0
  const currentSlideIdx = tagModal.slideIndex
  const isChart         = tagModal.element.type === 'chart'
  const originalText    = isChart 
    ? `Chart: ${tagModal.element.chartData?.title || tagModal.element.shapeName}` 
    : (tagModal.element.text || '')

  const [key,          setKey]          = useState(existing?.key          ?? '')
  const [hint,         setHint]         = useState(existing?.hint         ?? '')
  const [maxChars,     setMaxChars]     = useState(
    existing?.maxChars != null ? String(existing.maxChars) : calcMax > 0 ? String(calcMax) : ''
  )
  const [autoGenerate, setAutoGenerate] = useState(existing?.autoGenerate ?? (isChart ? true : false))

  // Derived validation — recomputed on each render from controlled state
  const trimmedKey       = key.trim()
  const isSharedKey      = trimmedKey !== '' && tags.some(
    t => t.key === trimmedKey && t.slideIndex !== currentSlideIdx && t.elementId !== tagModal.element.id
  )
  const isDuplicateOnSlide = trimmedKey !== '' && tags.some(
    t => t.key === trimmedKey && t.slideIndex === currentSlideIdx && t.elementId !== tagModal.element.id
  )

  const hintLabel = isSharedKey
    ? 'Slide context (AI uses this to write content specific to this slide)'
    : 'AI hint (optional)'

  const handleSave = () => {
    if (!trimmedKey || isDuplicateOnSlide) return
    const parsed = maxChars !== '' ? parseInt(maxChars, 10) : null
    onSave(trimmedKey, hint.trim(), parsed || null, autoGenerate)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h4>{existing ? 'Edit Tag' : 'Tag Element'}</h4>
        <p>Original: "{originalText.substring(0, 60)}{originalText.length > 60 ? '…' : ''}"</p>

        {calcMax > 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '-12px', marginBottom: '12px' }}>
            Calculated max: ~{calcMax} chars
          </p>
        )}

        <div className="form-group">
          <label>Placeholder name (key)</label>
          <input
            data-testid="modal-key"
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="e.g., product_name"
            autoFocus
          />
          {isDuplicateOnSlide && (
            <div className="form-notice form-notice--error">
              Key already used on this slide. Choose a different key or edit the existing tag.
            </div>
          )}
          {isSharedKey && !isDuplicateOnSlide && (
            <div className="form-notice form-notice--info">
              This key is used on another slide. The recipe will ask the AI to generate a slide-specific value for each — make sure the hint below describes what is specific about this slide.
            </div>
          )}
        </div>

        <div className="form-group">
          <label>{hintLabel}</label>
          <input
            data-testid="modal-hint"
            type="text"
            value={hint}
            onChange={e => setHint(e.target.value)}
            placeholder={isSharedKey
              ? 'Describe what this slide is about or what angle this field should take…'
              : 'e.g., a short punchy headline, max 8 words'}
          />
        </div>

        <div className="form-group">
          <label>Max characters {calcMax > 0 ? `(calculated: ${calcMax})` : ''}</label>
          <input
            data-testid="modal-maxchars"
            type="number"
            value={maxChars}
            onChange={e => setMaxChars(e.target.value)}
            placeholder={calcMax > 0 ? `default: ${calcMax}` : 'unlimited'}
            min={1}
          />
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              data-testid="modal-ai"
              type="checkbox"
              checked={autoGenerate}
              onChange={e => setAutoGenerate(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <span>AI generates this value (auto-replace)</span>
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            If checked, AI will replace this value. If unchecked, original text is kept.
          </p>
        </div>

        <div className="modal-actions">
          {existing && (
            <button className="btn btn-danger" onClick={onDelete}>Delete</button>
          )}
          <button
            data-testid="modal-save"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!trimmedKey || isDuplicateOnSlide}
          >
            Save Tag
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
