import { useState, useCallback, useEffect } from 'react'

// ============================================================
// Constants
// ============================================================
const EMU_PER_PIXEL = 914400 / 96
const SLIDE_WIDTH = 10 // inches
const SLIDE_HEIGHT = 5.625 // inches

const STEPS = ['upload', 'tag', 'recipe', 'preview']
const STEP_LABELS = {
  upload: 'Upload',
  tag: 'Tag Elements',
  recipe: 'Recipe + JSON',
  preview: 'Preview'
}

// ============================================================
// SlidePreview Component
// Renders a preview of a single slide with positioned elements
// ============================================================
function SlidePreview({ slide, size = 'normal' }) {
  const { elements, background, color } = slide
  
  if (!elements || elements.length === 0) {
    return <div className="preview-empty">{size === 'small' ? '—' : 'No elements'}</div>
  }

  const padding = size === 'small' ? 1 : 3
  const bgColor = '#ffffff'
  const scale = size === 'small' ? 0.12 : 0.9
  
  return (
    <div className="slide-preview-canvas" style={{ background: bgColor }}>
      {elements.map((el, idx) => {
        const left = (el.bounds.x / SLIDE_WIDTH) * 100
        const top = (el.bounds.y / SLIDE_HEIGHT) * 100
        const width = (el.bounds.w / SLIDE_WIDTH) * 100
        const height = (el.bounds.h / SLIDE_HEIGHT) * 100
        
        const elemFontSize = el.fontSize ? Math.round(el.fontSize * scale) : 12
        
        const style = {
          position: 'absolute',
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
          padding: padding,
          fontSize: `${elemFontSize}px`,
          fontWeight: el.fontBold ? 'bold' : 'normal',
          color: '#000000',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start',
          wordBreak: 'break-word',
          lineHeight: 1.2,
          textAlign: el.textAlign || 'left',
          whiteSpace: 'pre-wrap'
        }
        
        const text = el.text.length > 80 ? el.text.substring(0, 80) + '...' : el.text
        
        return (
          <div key={idx} style={style} title={el.shapeName}>
            {text}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// Main App Component
// ============================================================
function App() {
  // Step navigation state
  const [step, setStep] = useState('upload')
  const [animDir, setAnimDir] = useState('forward')
  
  // Template data state
  const [templateFile, setTemplateFile] = useState(null)
  const [slides, setSlides] = useState([])
  const [selectedSlide, setSelectedSlide] = useState(0)
  
  // Tags state
  const [tags, setTags] = useState([])
  const [recordSlideIndex, setRecordSlideIndex] = useState([])

  const toggleRecordSlide = (slideIndex) => {
    setRecordSlideIndex(prev => 
      prev.includes(slideIndex) 
        ? prev.filter(i => i !== slideIndex)
        : [...prev, slideIndex]
    )
  }
  const [tagModal, setTagModal] = useState(null)
  
  // Generation state
  const [recipe, setRecipe] = useState('')
  const [jsonInput, setJsonInput] = useState('')
  const [validation, setValidation] = useState(null)
  const [previewData, setPreviewData] = useState([])
  const [selectedPreviewIdx, setSelectedPreviewIdx] = useState(0)

  // Keyboard navigation for preview
  useEffect(() => {
    if (step !== 'preview') return
    
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        setSelectedPreviewIdx(i => Math.max(0, i - 1))
      } else if (e.key === 'ArrowRight') {
        setSelectedPreviewIdx(i => Math.min(previewData.length - 1, i + 1))
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [step, previewData.length])

  // Navigate to step with animation direction
  const navigateTo = useCallback((newStep) => {
    const curr = STEPS.indexOf(step)
    const next = STEPS.indexOf(newStep)
    if (next > curr) {
      setAnimDir('forward')
    } else {
      setAnimDir('backward')
    }
    setStep(newStep)
  }, [step])

  // Check if step can be navigated to
  const canNavigateTo = useCallback((s) => {
    if (s === 'upload') return true
    if (s === 'tag') return !!templateFile
    if (s === 'recipe') return templateFile && tags.length > 0
    if (s === 'preview') return templateFile && tags.length > 0 && jsonInput && validation?.valid
    return false
  }, [templateFile, tags, jsonInput, validation])

  // Handle file upload
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0]
    if (!file || !file.name.endsWith('.pptx')) {
      alert('Please upload a .pptx file')
      return
    }

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const base64 = evt.target.result.split(',')[1]
      
      const response = await fetch('/api/upload-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: base64, fileName: file.name })
      })
      
      const result = await response.json()
      if (result.ok) {
        setTemplateFile(result)
        setSlides(result.slides)
        navigateTo('tag')
      } else {
        alert(result.error || 'Failed to upload')
      }
    }
    reader.readAsDataURL(file)
  }, [navigateTo])

  // Handle element click for tagging
  const handleElementClick = useCallback((element) => {
    const existingTag = tags.find(t => t.elementId === element.id)
    if (existingTag) {
      setTagModal({ element, slideIndex: slides[selectedSlide].index, existingTag })
    } else {
      setTagModal({ element, slideIndex: slides[selectedSlide].index })
    }
  }, [tags, slides, selectedSlide])

  // Save a new tag
  const saveTag = useCallback((key, hint, maxChars) => {
    if (!tagModal) return
    
    let finalMaxChars = tagModal.element.maxChars
    if (maxChars !== null && maxChars !== undefined && maxChars > 0) {
      finalMaxChars = maxChars
    } else if (maxChars === 0 || maxChars === '') {
      finalMaxChars = null
    }
    
    setTags([...tags.filter(t => t.elementId !== tagModal.element.id), {
      elementId: tagModal.element.id,
      key,
      hint,
      slideIndex: tagModal.slideIndex,
      originalText: tagModal.element.text,
      maxChars: finalMaxChars
    }])
    setTagModal(null)
  }, [tagModal, tags])

  // Generate recipe prompt
  const generateRecipe = useCallback(async () => {
    const response = await fetch('/api/generate-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags, recordSlideIndex: recordSlideIndex[0] || null })
    })
    
    const result = await response.json()
    if (result.ok) {
      setRecipe(result.recipe)
      setStep('recipe')
    }
  }, [tags, recordSlideIndex])

  // Validate JSON
  const validateJson = useCallback((value = null) => {
    const jsonStr = value !== null ? value : jsonInput
    if (!jsonStr.trim()) {
      setValidation({ valid: null })
      return
    }
    
    let data
    try {
      data = JSON.parse(jsonStr)
    } catch (e) {
      setValidation({ valid: false, error: 'Invalid JSON syntax' })
      return
    }
    
    const foundFields = []
    const missingFields = []
    
    const rootTags = tags.filter(t => t.slideIndex !== recordSlideIndex[0])
    rootTags.forEach(tag => {
      if (data[tag.key] !== undefined) {
        foundFields.push(tag.key)
      } else {
        missingFields.push(tag.key)
      }
    })
    
    const recordTags = tags.filter(t => t.slideIndex === recordSlideIndex[0])
    if (recordSlideIndex[0] !== null && Array.isArray(data.records)) {
      data.records.forEach((record, idx) => {
        recordTags.forEach(tag => {
          if (record[tag.key] !== undefined) {
            if (!foundFields.includes(`${tag.key} (record ${idx + 1})`)) {
              foundFields.push(`${tag.key} (record ${idx + 1})`)
            }
          } else {
            if (!missingFields.includes(`${tag.key} (record ${idx + 1})`)) {
              missingFields.push(`${tag.key} (record ${idx + 1})`)
            }
          }
        })
      })
    }
    
    setValidation({
      valid: missingFields.length === 0,
      error: missingFields.length > 0 ? 'Missing fields: ' + missingFields.join(', ') : null,
      foundFields,
      missingFields,
      recordCount: data.records ? data.records.length : 0
    })
  }, [jsonInput, tags, recordSlideIndex])

  // Generate preview
  const generatePreview = useCallback(async () => {
    try {
      const jsonData = JSON.parse(jsonInput)
      
      
      
      const response = await fetch('/api/generate-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templatePath: templateFile.filePath,
          tags,
          jsonData,
          recordSlideIndex
        })
      })
      
      const result = await response.json()
      if (result.ok) {
        setPreviewData(result.previewData)
        navigateTo('preview')
      } else {
        alert(result.error)
      }
    } catch (err) {
      alert('Invalid JSON: ' + err.message)
    }
  }, [templateFile, tags, jsonInput, recordSlideIndex, navigateTo])

  // Download PPTX
  const downloadPptx = useCallback(async () => {
    try {
      const jsonData = JSON.parse(jsonInput)
      
      const response = await fetch('/api/generate-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templatePath: templateFile.filePath,
          tags,
          jsonData,
          recordSlideIndex: recordSlideIndex[0] || null
        })
      })
      
      const result = await response.json()
      if (result.ok && result.downloadUrl) {
        window.location.href = result.downloadUrl
      }
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }, [templateFile, tags, jsonInput, recordSlideIndex])

  // Animation class
  const stepAnimClass = animDir === 'forward' 
    ? 'step-content step-content-enter-right' 
    : 'step-content step-content-enter-left'

  // ============================================================
  // Breadcrumbs Component
  // ============================================================
  const Breadcrumbs = () => (
    <div className="breadcrumbs">
      {STEPS.map((s, idx) => {
        const isActive = step === s
        const currIdx = STEPS.indexOf(step)
        const isCompleted = currIdx > idx
        const canNav = canNavigateTo(s)
        
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div 
              className={`breadcrumb-item ${isActive ? 'active' : isCompleted ? 'completed' : ''} ${canNav ? 'clickable' : ''}`}
              onClick={() => canNav && navigateTo(s)}
            >
              <span className="breadcrumb-number">{idx + 1}</span>
              <span>{STEP_LABELS[s]}</span>
            </div>
            {idx < STEPS.length - 1 && <span className="breadcrumb-divider">›</span>}
          </div>
        )
      })}
    </div>
  )

  // ============================================================
  // Render Steps
  // ============================================================
  if (step === 'upload') {
    return (
      <div className="app">
        <header>
          <h1>Solon Slide Studio</h1>
          <p>Upload a PPTX, tag elements, generate recipe, create presentation</p>
        </header>
        <Breadcrumbs />
        
        <div className={`step-content ${stepAnimClass}`}>
          <div 
            className="upload-zone"
            onClick={() => document.getElementById('file-input').click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFileUpload(e) }}
          >
            <input 
              type="file" 
              id="file-input" 
              accept=".pptx" 
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <p>Drop your PPTX here</p>
            <p>or click to browse</p>
          </div>
          
          {templateFile && (
            <div className="actions" style={{ marginTop: 20 }}>
              <button className="btn btn-primary" onClick={() => navigateTo('tag')}>
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (step === 'tag') {
    const currentSlide = slides[selectedSlide]
    const taggedElementIds = tags.map(t => t.elementId)
    
    return (
      <div className="app">
        <header>
          <h1>Tag Elements</h1>
          <p>Click on text elements to tag them as placeholders</p>
        </header>
        <Breadcrumbs />
        
        <div className={`step-content ${stepAnimClass}`}>
          {/* Slide Carousel */}
          <div className="tag-slides">
            {slides.map((slide, idx) => (
              <div 
                key={idx}
                className={`tag-slide-btn ${selectedSlide === idx ? 'active' : ''} ${recordSlideIndex.includes(slide.index) ? 'record' : ''}`}
                onClick={() => setSelectedSlide(idx)}
              >
                <span className="tag-slide-num">{slide.index}</span>
                <span className="tag-slide-preview">
                  <SlidePreview slide={slide} size="small" />
                </span>
                <span 
                  className={`tag-slide-badge ${recordSlideIndex.includes(slide.index) ? 'active' : ''}`} 
                  title={recordSlideIndex.includes(slide.index) ? 'Click to remove repeatable' : 'Click to mark as repeatable'}
                  onClick={(e) => { e.stopPropagation(); toggleRecordSlide(slide.index) }}
                >⟳</span>
              </div>
            ))}
          </div>
          
          {/* Main layout */}
          <div className="main-layout">
            {/* Left sidebar */}
            <div className="sidebar">
              <div className="panel-section">
                <h3>Tagged Fields ({tags.length})</h3>
                <div className="tagged-list">
                  {tags.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No fields tagged yet. Click elements on the slide to tag them.</p>
                  ) : (
                    tags.map(t => {
                      const slide = slides.find(s => s.index === t.slideIndex)
                      const element = slide?.elements.find(e => e.id === t.elementId)
                      return (
                        <div 
                          key={t.elementId} 
                          className="tagged-item"
                          onClick={() => element && setTagModal({ element, slideIndex: t.slideIndex, existingTag: t })}
                        >
                          <strong>{t.key}</strong>
                          {t.hint && <span>{t.hint}</span>}
                          {t.maxChars && <span className="tagged-max">~{t.maxChars} chars</span>}
                        </div>
                      )
                    })
                  )}
                </div>
                
                <button 
                  className="btn btn-secondary" 
                  onClick={generateRecipe}
                  disabled={tags.length === 0}
                  style={{ width: '100%', marginTop: 16 }}
                >
                  Generate Recipe
                </button>
              </div>
            </div>
            
            {/* Center - Large slide preview */}
            <div className="workspace">
              <div className="panel-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                  <h3>Slide {currentSlide.index}</h3>
                  <label className="tag-repeatable">
                    <input 
                      type="checkbox" 
                      checked={recordSlideIndex.includes(currentSlide.index)}
                      onChange={(e) => toggleRecordSlide(currentSlide.index)}
                    />
                    <span>Repeatable</span>
                  </label>
                </div>
                <div className="slide-preview">
                  <div 
                    className="slide-preview-inner"
                    style={{ backgroundColor: '#ffffff' }}
                  >
                    {currentSlide.elements.length === 0 ? (
                      <div className="no-elements">No text elements found</div>
                    ) : (
                      currentSlide.elements.map((elem, idx) => {
                        const isTagged = taggedElementIds.includes(elem.id)
                        
                        const left = Math.max(0, Math.min(95, (elem.bounds.x / 10) * 100))
                        const top = Math.max(0, Math.min(95, (elem.bounds.y / 5.625) * 100))
                        const width = Math.max(5, Math.min(50, (elem.bounds.w / 10) * 100))
                        const height = Math.max(3, Math.min(30, (elem.bounds.h / 5.625) * 100))
                        
                        return (
                          <div
                            key={idx}
                            className={`slide-element ${isTagged ? 'tagged' : ''}`}
                            style={{
                              left: `${left}%`,
                              top: `${top}%`,
                              width: `${width}%`,
                              height: `${height}%`,
                              fontSize: `${Math.max(8, elem.fontSize * 0.7)}px`,
                              fontWeight: elem.fontBold ? 'bold' : 'normal',
                              color: isTagged ? '#C14A31' : '#000000',
                              textAlign: elem.textAlign || 'left',
                              justifyContent: elem.textAlign === 'center' ? 'center' : elem.textAlign === 'right' ? 'flex-end' : 'flex-start',
                              opacity: isTagged ? 0.7 : 1,
                            }}
                            onClick={() => handleElementClick(elem)}
                            title={elem.text}
                          >
                            {isTagged ? `{{${tags.find(t => t.elementId === elem.id).key}}}` : elem.text.substring(0, 60)}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
                
                <p className="help-text">
                  Click an element to tag it. Click again to remove the tag. Tagged elements appear in coral.
                </p>
              </div>
            </div>
          </div>
          
          {/* Tag modal */}
          {tagModal && (
            (() => {
              const existing = tagModal.existingTag
              const calcMax = tagModal.element.maxChars || 0
              const hasCalcMax = calcMax > 0
              const currentMax = existing?.maxChars || (hasCalcMax ? calcMax : '')
              return (
                <div className="modal-overlay" onClick={() => setTagModal(null)}>
                  <div className="modal-content" onClick={e => e.stopPropagation()}>
                    <h4>{existing ? 'Edit Tag' : 'Tag Element'}</h4>
                    <p>Original: "{tagModal.element.text.substring(0, 60)}..."</p>
                    {hasCalcMax && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '-12px', marginBottom: '12px' }}>
                        Calculated max: ~{calcMax} chars
                      </p>
                    )}
                    <div className="form-group">
                      <label>Placeholder name (key)</label>
                      <input 
                        type="text" 
                        id="tag-key" 
                        defaultValue={existing?.key || ''}
                        placeholder="e.g., product_name"
                        autoFocus
                      />
                    </div>
                    <div className="form-group">
                      <label>AI hint (optional)</label>
                      <input 
                        type="text" 
                        id="tag-hint" 
                        defaultValue={existing?.hint || ''}
                        placeholder="e.g., a short punchy headline, max 8 words"
                      />
                    </div>
                    <div className="form-group">
                      <label>Max characters {hasCalcMax ? `(calculated: ${calcMax})` : ''}</label>
                      <input 
                        type="number" 
                        id="tag-maxchars" 
                        defaultValue={currentMax || ''}
                        placeholder={hasCalcMax ? `default: ${calcMax}` : 'unlimited'}
                        min={1}
                      />
                    </div>
                    <div className="modal-actions">
                      {existing && (
                        <button 
                          className="btn btn-danger" 
                          onClick={() => {
                            setTags(tags.filter(t => t.elementId !== tagModal.element.id))
                            setTagModal(null)
                          }}
                        >
                          Delete
                        </button>
                      )}
                      <button className="btn btn-primary" onClick={() => {
                        const key = document.getElementById('tag-key').value.trim()
                        const hint = document.getElementById('tag-hint').value.trim()
                        const maxCharsInput = document.getElementById('tag-maxchars')
                        const maxChars = maxCharsInput?.value ? parseInt(maxCharsInput.value, 10) : null
                        if (key) saveTag(key, hint, maxChars)
                      }}>Save Tag</button>
                      <button className="btn btn-secondary" onClick={() => setTagModal(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )
            })()
          )}
        </div>
      </div>
    )
  }

  if (step === 'recipe') {
    return (
      <div className="app">
        <header>
          <h1>Recipe + JSON</h1>
          <p>Copy the recipe prompt for the AI, then paste the JSON response</p>
        </header>
        <Breadcrumbs />
        
        <div className={`step-content ${stepAnimClass}`}>
          <div className="recipe-json-layout">
            <div className="recipe-panel">
              <h3>Recipe Prompt</h3>
              <div className="recipe-area-wrapper">
                <button 
                  className="copy-btn" 
                  onClick={() => {
                    navigator.clipboard.writeText(recipe)
                    alert('Copied!')
                  }}
                  title="Copy to clipboard"
                >⧉</button>
                <div className="recipe-area">{recipe}</div>
              </div>
            </div>
            
            <div className="json-panel">
              <h3>JSON Response</h3>
              <textarea 
                className={`json-input ${validation?.valid === false ? 'has-error' : ''}`}
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value)
                  setTimeout(() => validateJson(e.target.value), 300)
                }}
                placeholder='{"title": "My Presentation", "records": [...]}'
              />
              
              {validation && validation.valid === false && (
                <div className="validation-status invalid">
                  {validation.error || 'Invalid JSON'}
                </div>
              )}
              
              <div className="actions">
                <button 
                  className="btn btn-primary" 
                  onClick={generatePreview}
                  disabled={!validation?.valid}
                >
                  Preview & Generate
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'preview') {
    const selectedSlide = previewData[selectedPreviewIdx]
    
    return (
      <div className="app">
        <header>
          <h1>Preview</h1>
          <p>Review your generated slides, use ← → arrow keys to navigate</p>
        </header>
        <Breadcrumbs />
        
        <div className={`step-content ${stepAnimClass}`}>
          {/* Large Preview - FIRST */}
          <div className="preview-large">
            <div className="preview-large-header">
              <span className="preview-large-title">
                {selectedSlide?.slideNumber ? `Slide ${selectedSlide.slideNumber}` : 'Preview'}
                {selectedSlide?.recordIndex ? ` - Item ${selectedSlide.recordIndex}` : ''}
              </span>
            </div>
            <div className="preview-large-canvas">
              {selectedSlide && <SlidePreview slide={selectedSlide} />}
            </div>
          </div>
          
          {/* Thumbnail Strip - SECOND */}
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
          
          {/* Actions */}
          <div className="preview-actions">
            <button className="btn btn-secondary" onClick={() => navigateTo('json')}>
              ← Back to Edit
            </button>
            <button className="btn btn-primary" onClick={downloadPptx}>
              Download PPTX ↓
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default App