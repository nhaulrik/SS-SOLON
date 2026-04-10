import { useState, useCallback, useEffect, useRef } from 'react'

// ============================================================
// Constants
// ============================================================
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

// Header component
const AppHeader = ({ title, subtitle }) => (
  <header>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <a 
        href="/docs.html" 
        target="_blank" 
        className="docs-link"
        title="Open Documentation"
      >
        ⬡ Docs
      </a>
    </div>
  </header>
)

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
  const [highlightedElement, setHighlightedElement] = useState(null)
  
  // Tags state
  const [tags, setTags] = useState([])
  const [repeatableSlides, setRepeatableSlides] = useState([]) // [{ slideIndex, customPrompt, structureType }]

  const toggleRecordSlide = (slideIndex) => {
    setRepeatableSlides(prev => {
      const exists = prev.find(r => r.slideIndex === slideIndex)
      if (exists) {
        return prev.filter(r => r.slideIndex !== slideIndex)
      }
      return [...prev, { slideIndex, customPrompt: '', structureType: '' }]
    })
  }

  const updateRepeatablePrompt = (slideIndex, customPrompt) => {
    setRepeatableSlides(prev => 
      prev.map(r => r.slideIndex === slideIndex ? { ...r, customPrompt } : r)
    )
  }

  const updateRepeatableStructureType = (slideIndex, structureType) => {
    setRepeatableSlides(prev => 
      prev.map(r => r.slideIndex === slideIndex ? { ...r, structureType } : r)
    )
  }

  const getRepeatableConfig = (slideIndex) => {
    return repeatableSlides.find(r => r.slideIndex === slideIndex)
  }
  const [tagModal, setTagModal] = useState(null)
  
  // Patch state
  const [patches, setPatches] = useState([])
  const [currentPatch, setCurrentPatch] = useState(null)
  const [patchName, setPatchName] = useState('')

  // Load patches from server
  useEffect(() => {
    fetch('/api/patches')
      .then(res => res.json())
      .then(data => setPatches(data || []))
      .catch(() => setPatches([]))
  }, [])

  // Save patch to server
  const savePatchToServer = useCallback(async (patch) => {
    await fetch('/api/patches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch })
    })
  }, [])

  // Manual save trigger - only when user makes explicit changes
  const lastSavedPatchRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  
  const triggerSave = useCallback((newTags, newRecordSlide) => {
    if (!currentPatch) return
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      const currentData = JSON.stringify({ tags: newTags, repeatableSlides: newRecordSlide })
      
      if (currentData !== lastSavedPatchRef.current) {
        lastSavedPatchRef.current = currentData
        
        const updated = patches.map(p => 
          p.id === currentPatch 
            ? { ...p, tags: newTags, repeatableSlides: newRecordSlide, updatedAt: new Date().toISOString() }
            : p
        )
        setPatches(updated)
        const patchToSave = updated.find(p => p.id === currentPatch)
        if (patchToSave) {
          savePatchToServer(patchToSave)
        }
      }
    }, 1000)
  }, [currentPatch, patches, savePatchToServer])

  // Auto-create tags from slide elements when entering tag step
  useEffect(() => {
    if (step === 'tag' && slides.length > 0 && tags.length === 0) {
      // Check if a patch already exists for this file
      const existingPatch = patches.find(p => p.pptxFile === templateFile?.fileName)
      if (existingPatch) {
        // Apply existing patch instead of creating new one
        setTags(existingPatch.tags || [])
        setRepeatableSlides(existingPatch.repeatableSlides || [])
        setCurrentPatch(existingPatch.id)
        setPatchName(existingPatch.name)
        lastSavedPatchRef.current = JSON.stringify({ tags: existingPatch.tags, repeatableSlides: existingPatch.repeatableSlides })
        return
      }
      
      const autoTags = []
      slides.forEach(slide => {
        slide.elements.forEach(elem => {
          if (elem.text && elem.text.trim()) {
            const key = elem.text.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
            autoTags.push({
              elementId: elem.id,
              key: key || 'field',
              hint: elem.text.trim(),
              slideIndex: slide.index,
              originalText: elem.text,
              maxChars: elem.maxChars,
              autoGenerate: false
            })
          }
        })
      })
      if (autoTags.length > 0) {
        setTags(autoTags)
        
        // Initialize ref to prevent immediate re-save
        lastSavedPatchRef.current = JSON.stringify({ tags: autoTags, repeatableSlides: [] })
        
        // Auto-create and save a patch only if no existing patch
        const patchName = templateFile?.fileName ? templateFile.fileName.replace('.pptx', '') + '_auto' : 'auto_patch'
        const newPatch = {
          id: Date.now(),
          name: patchName,
          pptxFile: templateFile?.fileName || '',
          createdAt: new Date().toISOString(),
          tags: autoTags,
          repeatableSlides: []
        }
        setPatches(prev => [...prev, newPatch])
        setCurrentPatch(newPatch.id)
        setPatchName(patchName)
        savePatchToServer(newPatch)
      }
    }
  }, [step, slides, tags.length, templateFile, patches, savePatchToServer, setPatches, setCurrentPatch, setPatchName])

  // Delete patch from server
  const deletePatchFromServer = useCallback(async (id) => {
    await fetch(`/api/patches/${id}`, { method: 'DELETE' })
  }, [])

  // Create new patch
  const createPatch = useCallback((name) => {
    if (!name.trim()) return
    const newPatch = {
      id: Date.now(),
      name: name.trim(),
      pptxFile: templateFile?.fileName || '',
      createdAt: new Date().toISOString(),
      tags: [...tags],
      repeatableSlides: [...repeatableSlides]
    }
    const updated = [...patches, newPatch]
    setPatches(updated)
    savePatchToServer(newPatch)
    setCurrentPatch(newPatch.id)
    setPatchName(name.trim())
  }, [templateFile, tags, repeatableSlides, patches, savePatchToServer])

  // Apply patch to current tags
  const applyPatch = useCallback((patchId) => {
    const patch = patches.find(p => p.id === patchId)
    if (patch) {
      setTags(patch.tags || [])
      setRepeatableSlides(patch.repeatableSlides || [])
      setCurrentPatch(patch.id)
      setPatchName(patch.name)
    }
  }, [patches])

  // Auto-suggest matching patch when PPTX is loaded
  useEffect(() => {
    if (templateFile?.fileName && patches.length > 0) {
      const matchingPatch = patches.find(p => p.pptxFile === templateFile.fileName)
      if (matchingPatch) {
        // Auto-apply if matches
        setTags(matchingPatch.tags || [])
        setRepeatableSlides(matchingPatch.repeatableSlides || [])
        setCurrentPatch(matchingPatch.id)
        setPatchName(matchingPatch.name)
        // Initialize ref to prevent re-saving the loaded patch
        lastSavedPatchRef.current = JSON.stringify({ tags: matchingPatch.tags, repeatableSlides: matchingPatch.repeatableSlides })
      }
    }
  }, [templateFile, patches])
  
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
  const saveTag = useCallback((key, hint, maxChars, autoGenerate) => {
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
      maxChars: finalMaxChars,
      autoGenerate: autoGenerate ?? false
    }])
    setTagModal(null)
  }, [tagModal, tags])

  // Generate recipe prompt
  const generateRecipe = useCallback(async () => {
    const response = await fetch('/api/generate-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags, repeatableSlides })
    })
    
    const result = await response.json()
    if (result.ok) {
      setRecipe(result.recipe)
      setStep('recipe')
    }
  }, [tags, repeatableSlides])

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
    
    const generateOnlyTags = tags.filter(t => t.autoGenerate)
    const repeatableSet = new Set(repeatableSlides.map(r => r.slideIndex))
    
    // Validate static fields (under "static" key)
    const staticData = data.static || data
    const staticTags = generateOnlyTags.filter(t => !repeatableSet.has(t.slideIndex))
    staticTags.forEach(tag => {
      if (staticData[tag.key] !== undefined) {
        foundFields.push(tag.key)
      } else {
        missingFields.push(tag.key)
      }
    })
    
    // Validate repeatable slides
    const slidesData = data.slides || {}
    repeatableSlides.forEach(repeatable => {
      const dataKey = repeatable.structureType || `slide_${repeatable.slideIndex}`
      const instances = slidesData[dataKey]
      
      if (!Array.isArray(instances) || instances.length === 0) {
        missingFields.push(`${dataKey} (no instances found)`)
        return
      }
      
      instances.forEach((instance, idx) => {
        if (!instance.structure_type) {
          missingFields.push(`structure_type (${dataKey} instance ${idx + 1})`)
        }
        
        const slideTags = generateOnlyTags.filter(t => t.slideIndex === repeatable.slideIndex)
        slideTags.forEach(tag => {
          if (instance[tag.key] !== undefined) {
            foundFields.push(`${tag.key} (${dataKey} instance ${idx + 1})`)
          } else {
            missingFields.push(`${tag.key} (${dataKey} instance ${idx + 1})`)
          }
        })
      })
    })
    
    const instanceCount = Object.values(slidesData).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
    
    setValidation({
      valid: missingFields.length === 0,
      error: missingFields.length > 0 ? 'Missing fields: ' + missingFields.join(', ') : null,
      foundFields,
      missingFields,
      instanceCount
    })
  }, [jsonInput, tags, repeatableSlides])

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
          repeatableSlides
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
  }, [templateFile, tags, jsonInput, repeatableSlides, navigateTo])

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
          repeatableSlides
        })
      })
      
      const result = await response.json()
      if (result.ok && result.downloadUrl) {
        window.location.href = result.downloadUrl
      }
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }, [templateFile, tags, jsonInput, repeatableSlides])

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
        <AppHeader title="Solon Slide Studio" subtitle="Upload a PPTX, tag elements, generate recipe, create presentation" />
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
        <AppHeader title="Tag Elements" subtitle="Click on text elements to tag them as placeholders" />
        <Breadcrumbs />
        
        <div className={`step-content ${stepAnimClass}`}>
          {/* Slide Carousel */}
          <div className="tag-slides">
            {slides.map((slide, idx) => {
              const isRepeatable = repeatableSlides.some(r => r.slideIndex === slide.index);
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
                    onClick={(e) => { e.stopPropagation(); toggleRecordSlide(slide.index) }}
                  >⟳</span>
                </div>
              );
            })}
          </div>
          
          {/* Two column layout */}
          <div className="main-layout">
            {/* Left - Patch Panel */}
            <div className="patch-panel">
<h3>Patch</h3>
                
              {/* Patch name input */}
              <div className="patch-name-row">
                <input 
                  type="text" 
                  className="patch-name-input"
                  value={patchName}
                  onChange={(e) => setPatchName(e.target.value)}
                  placeholder="Enter patch name..."
                />
              </div>
              
              {/* Patch selector */}
              {patches.length > 0 && (
                <div className="patch-selector">
                  <select 
                    value={currentPatch || ''} 
                    onChange={(e) => applyPatch(Number(e.target.value))}
                  >
                    <option value="">Select a patch...</option>
                    {patches.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.pptxFile ? `(${p.pptxFile})` : ''}
                      </option>
                    ))}
                  </select>
                  {currentPatch && (
                    <button 
                      className="btn-link"
                      onClick={async () => {
                        await deletePatchFromServer(currentPatch)
                        const updated = patches.filter(p => p.id !== currentPatch)
                        setPatches(updated)
                        setCurrentPatch(null)
                        setPatchName('')
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
              
{/* Patch data table */}
              <div className="patch-table">
                {(() => {
                  const currentSlideNum = slides[selectedSlide]?.index
                  const slideTags = tags.filter(t => t.slideIndex === currentSlideNum)
                  const hasAnyAutoGenerate = slideTags.some(t => t.autoGenerate)
                  const hasAnyNonAutoGenerate = slideTags.some(t => !(t.autoGenerate))
                  
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
                          {slideTags.map((t) => {
                            const slide = slides.find(s => s.index === t.slideIndex)
                            const element = slide?.elements.find(e => e.id === t.elementId)
                            const isAutoGenerate = t.autoGenerate ?? false
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
                                    checked={isAutoGenerate}
                                    onChange={(e) => {
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
                                {isAutoGenerate ? (
                                  <input 
                                    className="patch-hint-input"
                                    defaultValue={t.hint || ''}
                                    placeholder="Enter hint for AI..."
                                    onChange={(e) => {
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
                onClick={generateRecipe}
                disabled={tags.length === 0}
                style={{ width: '100%', marginTop: 16 }}
              >
                Generate Recipe
              </button>
            </div>
            
            {/* Right - Large slide preview */}
            <div className="workspace">
              <div className="panel-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                  <h3>Slide {currentSlide.index}</h3>
                  <label className="tag-repeatable">
                    <input 
                      type="checkbox" 
                      checked={!!getRepeatableConfig(currentSlide.index)}
                      onChange={(e) => {
                        toggleRecordSlide(currentSlide.index)
                        // Update save - remove or add new repeatable entry
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
                        onChange={(e) => {
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
                        onChange={(e) => {
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
                              outline: highlightedElement === elem.id ? '3px solid #73AA87' : 'none',
                              boxShadow: highlightedElement === elem.id ? '0 0 0 4px #73AA87, 0 4px 12px rgba(115, 170, 135, 0.4)' : 'none',
                              zIndex: highlightedElement === elem.id ? 10 : 1,
                              backgroundColor: highlightedElement === elem.id ? 'rgba(115, 170, 135, 0.5)' : 'rgba(255,255,255,0.85)',
                            }}
                            onClick={() => handleElementClick(elem)}
                            onMouseEnter={() => isTagged && setHighlightedElement(elem.id)}
                            onMouseLeave={() => setHighlightedElement(null)}
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
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          id="tag-autogenerate"
                          defaultChecked={existing?.autoGenerate ?? false}
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
                        const autoGenerate = document.getElementById('tag-autogenerate')?.checked ?? false
                        if (key) saveTag(key, hint, maxChars, autoGenerate)
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
        <AppHeader title="Recipe + JSON" subtitle="Copy the recipe prompt for the AI, then paste the JSON response" />
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
              <div className="json-input-wrapper">
                <button 
                  className="copy-btn" 
                  onClick={() => {
                    navigator.clipboard.writeText(jsonInput)
                    alert('Copied!')
                  }}
                  title="Copy to clipboard"
                >⧉</button>
                <textarea 
                  className={`json-input ${validation?.valid === false ? 'has-error' : ''}`}
                  value={jsonInput}
                  onChange={(e) => {
                    setJsonInput(e.target.value)
                    setTimeout(() => validateJson(e.target.value), 300)
                  }}
                  placeholder='{"static": {...}, "slides": {...}}'
                />
              </div>
              
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
        <AppHeader title="Preview" subtitle="Review your generated slides, use ← → arrow keys to navigate" />
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