import { useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'
import SlidePreview from '../components/SlidePreview.jsx'
import TagModal from '../components/TagModal.jsx'
import { keyGen } from '../utils/tagUtils.js'

const SLIDE_WIDTH  = 10
const SLIDE_HEIGHT = 5.625

export default function TagStep({
  // Slide data
  slides,
  // Tag state — owned by App, passed down
  tags,
  setTags,
  repeatableSlides,
  setRepeatableSlides,
  // Patch state
  patches,
  currentPatch,
  patchName,
  setPatchName,
  globalPrompt,
  setGlobalPrompt,
  triggerSave,
  onApplyPatch,
  onDeletePatch,
  // Navigation
  step,
  canNavigateTo,
  navigateTo,
  stepAnimClass,
  // Actions
  onGenerateRecipe
}) {
  // Internal state — not needed outside this step
  const [selectedSlide,      setSelectedSlide]      = useState(0)
  const [highlightedElement, setHighlightedElement] = useState(null)
  const [tagModal,           setTagModal]           = useState(null)

  const currentSlide = slides[selectedSlide]

  // ── Repeatable slide helpers ───────────────────────────────────
  const getRepeatableConfig = (slideIndex) =>
    repeatableSlides.find(r => r.slideIndex === slideIndex)

  const toggleRecordSlide = (slideIndex) => {
    setRepeatableSlides(prev => {
      const exists = prev.find(r => r.slideIndex === slideIndex)
      return exists
        ? prev.filter(r => r.slideIndex !== slideIndex)
        : [...prev, { slideIndex, customPrompt: '', structureType: '' }]
    })
  }

  const updateRepeatableStructureType = (slideIndex, structureType) => {
    setRepeatableSlides(prev =>
      prev.map(r => r.slideIndex === slideIndex ? { ...r, structureType } : r)
    )
  }

  const updateRepeatablePrompt = (slideIndex, customPrompt) => {
    setRepeatableSlides(prev =>
      prev.map(r => r.slideIndex === slideIndex ? { ...r, customPrompt } : r)
    )
  }

  // ── Tag helpers ────────────────────────────────────────────────
  const handleElementClick = (element) => {
    const existingTag = tags.find(t => t.elementId === element.id)
    setTagModal({
      element,
      slideIndex: slides[selectedSlide].index,
      existingTag: existingTag || null
    })
  }

  const handleSaveTag = (key, hint, maxChars, autoGenerate) => {
    if (!tagModal) return
    const newTags = [
      ...tags.filter(t => t.elementId !== tagModal.element.id),
      {
        elementId:    tagModal.element.id,
        key,
        hint,
        slideIndex:   tagModal.slideIndex,
        originalText: tagModal.element.text,
        maxChars,
        autoGenerate: autoGenerate ?? false
      }
    ]
    setTags(newTags)
    triggerSave(newTags, repeatableSlides)
    setTagModal(null)
  }

  const handleDeleteTag = () => {
    if (!tagModal) return
    const newTags = tags.filter(t => t.elementId !== tagModal.element.id)
    setTags(newTags)
    triggerSave(newTags, repeatableSlides)
    setTagModal(null)
  }

  const taggedElementIds = tags.map(t => t.elementId)

  return (
    <div className="app">
      <AppHeader title="Tag Elements" subtitle="Click on text elements to tag them as placeholders" />
      <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} />

      <div className={stepAnimClass}>
        {/* Slide Carousel */}
        <div className="tag-slides">
          {slides.map((slide, idx) => {
            const isRepeatable = repeatableSlides.some(r => r.slideIndex === slide.index)
            return (
              <div
                key={idx}
                className={`tag-slide-btn ${selectedSlide === idx ? 'active' : ''} ${isRepeatable ? 'record' : ''}`}
                onClick={() => setSelectedSlide(idx)}
              >
                <span className="tag-slide-num">{slide.index}</span>
                <span className="tag-slide-preview">
                  <SlidePreview slide={slide} size="small" />
                </span>
                <span
                  className={`tag-slide-badge ${isRepeatable ? 'active' : ''}`}
                  title={isRepeatable ? 'Click to remove repeatable' : 'Click to mark as repeatable'}
                  onClick={e => { e.stopPropagation(); toggleRecordSlide(slide.index) }}
                >⟳</span>
              </div>
            )
          })}
        </div>

        {/* Two-column layout */}
        <div className="main-layout">
          {/* Left – Patch Panel */}
          <div className="patch-panel">
            <h3>Patch</h3>

            <div className="patch-name-row">
              <input
                type="text"
                className="patch-name-input"
                value={patchName}
                onChange={e => setPatchName(e.target.value)}
                placeholder="Enter patch name..."
              />
            </div>

            {patches.length > 0 && (
              <div className="patch-selector">
                <select
                  value={currentPatch || ''}
                  onChange={e => onApplyPatch(Number(e.target.value))}
                >
                  <option value="">Select a patch...</option>
                  {patches.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.pptxFile ? `(${p.pptxFile})` : ''}
                    </option>
                  ))}
                </select>
                {currentPatch && (
                  <button className="btn-link" onClick={onDeletePatch}>Delete</button>
                )}
              </div>
            )}

            {currentPatch && (
              <div className="global-prompt-section">
                <label className="global-prompt-label">Global Prompt (guidance for AI)</label>
                <textarea
                  className="global-prompt-input"
                  value={globalPrompt}
                  onChange={e => {
                    setGlobalPrompt(e.target.value)
                    triggerSave(tags, repeatableSlides, e.target.value)
                  }}
                  placeholder="Add overall guidance for the AI (e.g., 'Generate a professional presentation with clear structure')"
                  rows={3}
                />
              </div>
            )}

            {/* Tag table for current slide */}
            <div className="patch-table">
              {(() => {
                const currentSlideNum = slides[selectedSlide]?.index
                const slideTags = tags.filter(t => t.slideIndex === currentSlideNum)
                return (
                  <>
                    <div className="patch-table-header">
                      <span style={{ width: '40px' }}>AI</span>
                      <span>Hint</span>
                      <span>Content</span>
                      <span style={{ width: '40px' }}>Max</span>
                    </div>

                    {slideTags.length === 0 ? (
                      <div className="patch-empty">
                        No fields tagged on this slide. Click elements to tag them.
                      </div>
                    ) : (
                      <div className="patch-table-body">
                        {slideTags.map(t => {
                          const slide   = slides.find(s => s.index === t.slideIndex)
                          const element = slide?.elements.find(e => e.id === t.elementId)
                          return (
                            <div
                              key={t.elementId}
                              className="patch-row"
                              onMouseEnter={() => setHighlightedElement(t.elementId)}
                              onMouseLeave={() => setHighlightedElement(null)}
                              onClick={() => setHighlightedElement(t.elementId)}
                              style={{
                                cursor: 'pointer',
                                background: highlightedElement === t.elementId ? 'rgba(255, 195, 0, 0.2)' : undefined
                              }}
                            >
                              <label className="toggle-switch">
                                <input
                                  type="checkbox"
                                  checked={t.autoGenerate ?? false}
                                  onChange={e => {
                                    const newTags = tags.map(tag =>
                                      tag.elementId === t.elementId
                                        ? { ...tag, autoGenerate: e.target.checked }
                                        : tag
                                    )
                                    setTags(newTags)
                                    triggerSave(newTags, repeatableSlides)
                                  }}
                                />
                                <span className="toggle-slider"></span>
                              </label>

                              {t.autoGenerate ? (
                                <input
                                  className="patch-hint-input"
                                  defaultValue={t.hint || ''}
                                  placeholder="Enter hint for AI..."
                                  onChange={e => {
                                    const newTags = tags.map(tag =>
                                      tag.elementId === t.elementId
                                        ? { ...tag, hint: e.target.value }
                                        : tag
                                    )
                                    setTags(newTags)
                                    triggerSave(newTags, repeatableSlides)
                                  }}
                                />
                              ) : (
                                <span className="patch-dash">—</span>
                              )}

                              <span className="patch-content" title={element?.text || ''}>
                                {element?.text?.substring(0, 40) || t.originalText?.substring(0, 40) || '—'}
                              </span>
                              <span className="patch-max">{t.maxChars || '—'}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            <button
              className="btn btn-secondary"
              onClick={onGenerateRecipe}
              disabled={tags.length === 0}
              style={{ width: '100%', marginTop: 16 }}
            >
              Generate Recipe
            </button>
          </div>

          {/* Right – Large slide preview */}
          <div className="workspace">
            <div className="panel-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <h3>Slide {currentSlide.index}</h3>
                <label className="tag-repeatable">
                  <input
                    type="checkbox"
                    checked={!!getRepeatableConfig(currentSlide.index)}
                    onChange={e => {
                      toggleRecordSlide(currentSlide.index)
                      const newRepeatable = e.target.checked
                        ? [...repeatableSlides, { slideIndex: currentSlide.index, customPrompt: '', structureType: '' }]
                        : repeatableSlides.filter(r => r.slideIndex !== currentSlide.index)
                      setTimeout(() => triggerSave(tags, newRepeatable), 100)
                    }}
                  />
                  <span>Repeatable</span>
                </label>
              </div>

              {getRepeatableConfig(currentSlide.index) && (
                <div className="repeatable-config">
                  <div className="form-group">
                    <label>Structure Type (unique identifier for this slide type)</label>
                    <input
                      type="text"
                      placeholder="e.g., group_summary, initiative_detail"
                      value={getRepeatableConfig(currentSlide.index).structureType || ''}
                      onChange={e => {
                        updateRepeatableStructureType(currentSlide.index, e.target.value)
                        triggerSave(tags, repeatableSlides.map(r =>
                          r.slideIndex === currentSlide.index ? { ...r, structureType: e.target.value } : r
                        ))
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Custom prompt for instances:</label>
                    <textarea
                      placeholder="Describe what instances to generate (e.g., 'List 5 major car manufacturers with revenue and HQ')"
                      value={getRepeatableConfig(currentSlide.index).customPrompt}
                      onChange={e => {
                        updateRepeatablePrompt(currentSlide.index, e.target.value)
                        triggerSave(tags, repeatableSlides.map(r =>
                          r.slideIndex === currentSlide.index ? { ...r, customPrompt: e.target.value } : r
                        ))
                      }}
                      rows={3}
                    />
                  </div>
                </div>
              )}

              <div className="slide-preview">
                <div className="slide-preview-inner" style={{ backgroundColor: '#ffffff', position: 'relative' }}>
                  {currentSlide.elements.length === 0 ? (
                    <div className="no-elements">No text elements found</div>
                  ) : (
                    <>
                      <SlidePreview slide={currentSlide} size="normal" />

                      {/* Click-target overlay */}
                      <div className="slide-overlay">
                        {currentSlide.elements.map((elem, idx) => {
                          const isTagged      = taggedElementIds.includes(elem.id)
                          const isHighlighted = highlightedElement === elem.id

                          const left   = Math.max(0, Math.min(95, (elem.bounds.x / SLIDE_WIDTH)  * 100))
                          const top    = Math.max(0, Math.min(95, (elem.bounds.y / SLIDE_HEIGHT) * 100))
                          const width  = Math.max(5, Math.min(50, (elem.bounds.w / SLIDE_WIDTH)  * 100))
                          const height = Math.max(3, Math.min(30, (elem.bounds.h / SLIDE_HEIGHT) * 100))

                          return (
                            <div
                              key={idx}
                              className={`overlay-element ${isTagged ? 'tagged' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                              style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                              onClick={() => handleElementClick(elem)}
                              onMouseEnter={() => isTagged && setHighlightedElement(elem.id)}
                              onMouseLeave={() => setHighlightedElement(null)}
                              title={isTagged ? tags.find(t => t.elementId === elem.id)?.key : elem.text}
                            />
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <p className="help-text">
                Click an element to tag it. Click again to remove the tag. Tagged elements appear in coral.
              </p>
            </div>
          </div>
        </div>

        {tagModal && (
          <TagModal
            tagModal={tagModal}
            tags={tags}
            onSave={handleSaveTag}
            onClose={() => setTagModal(null)}
            onDelete={handleDeleteTag}
          />
        )}
      </div>
    </div>
  )
}
