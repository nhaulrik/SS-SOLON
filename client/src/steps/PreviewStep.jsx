import { useEffect } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'
import SlidePreview from '../components/SlidePreview.jsx'

export default function PreviewStep({
  previewData,
  selectedPreviewIdx,
  setSelectedPreviewIdx,
  step,
  canNavigateTo,
  navigateTo,
  stepAnimClass,
  applyPatchAndContinue,
  generateFinalFile,
  debugContext
}) {
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft')  setSelectedPreviewIdx(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setSelectedPreviewIdx(i => Math.min(previewData.length - 1, i + 1))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewData.length, setSelectedPreviewIdx])

  const selectedSlide = previewData[selectedPreviewIdx]

  return (
    <div className="app">
      <AppHeader title="Preview" subtitle="Review your generated slides, use arrow keys to navigate" debugContext={debugContext} />

      <div className={stepAnimClass}>
        <div className="preview-large">
          <div className="preview-large-header">
            <span className="preview-large-title">
              {selectedSlide?.slideNumber ? `Slide ${selectedSlide.slideNumber}` : 'Preview'}
              {selectedSlide?.recordIndex  ? ` - Item ${selectedSlide.recordIndex}` : ''}
            </span>
          </div>
          <div className="preview-large-canvas">
            {selectedSlide && <SlidePreview slide={selectedSlide} />}
          </div>
        </div>

        <div className="preview-thumbs">
          {previewData.map((slide, idx) => (
            <div
              key={idx}
              className={`preview-thumb ${selectedPreviewIdx === idx ? 'active' : ''}`}
              onClick={() => setSelectedPreviewIdx(idx)}
            >
              <div className="preview-thumb-num">{slide.slideNumber}</div>
              <div className="preview-thumb-body">
                <SlidePreview slide={slide} size="small" />
              </div>
              {slide.recordIndex && (
                <div className="preview-thumb-badge">{slide.recordIndex}</div>
              )}
            </div>
          ))}
        </div>

        <div className="preview-actions">
          <button className="btn btn-secondary" onClick={() => navigateTo('recipe')}>
            ← Back to Edit
          </button>
          <button className="btn btn-secondary" onClick={applyPatchAndContinue}>
            Apply Patch &amp; Continue →
          </button>
          <button className="btn btn-primary" onClick={generateFinalFile}>
            Generate Final File ↓
          </button>
        </div>
      </div>
    </div>
  )
}
