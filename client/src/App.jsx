import { useState } from 'react'

function App() {
  const [step, setStep] = useState('upload')
  const [templateFile, setTemplateFile] = useState(null)
  const [slides, setSlides] = useState([])
  const [selectedSlide, setSelectedSlide] = useState(0)
  const [tags, setTags] = useState([])
  const [recordSlideIndex, setRecordSlideIndex] = useState(null)
  const [tagModal, setTagModal] = useState(null)
  const [recipe, setRecipe] = useState('')
  const [jsonInput, setJsonInput] = useState('')
  const [validation, setValidation] = useState(null)
  const [previewData, setPreviewData] = useState([])

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.pptx')) {
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
        setStep('tag')
      } else {
        alert(result.error || 'Failed to upload')
      }
    }
    reader.readAsDataURL(file)
  }

  const handleElementClick = (element) => {
    const existingTag = tags.find(t => t.elementId === element.id)
    if (existingTag) {
      setTags(tags.filter(t => t.elementId !== element.id))
    } else {
      setTagModal({ element, slideIndex: slides[selectedSlide].index })
    }
  }

  const saveTag = (key, hint) => {
    if (!tagModal) return
    
    setTags([...tags.filter(t => t.elementId !== tagModal.element.id), {
      elementId: tagModal.element.id,
      key,
      hint,
      slideIndex: tagModal.slideIndex,
      originalText: tagModal.element.text
    }])
    setTagModal(null)
  }

  const generateRecipe = async () => {
    const response = await fetch('/api/generate-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags, recordSlideIndex })
    })
    
    const result = await response.json()
    if (result.ok) {
      setRecipe(result.recipe)
      setStep('recipe')
    }
  }

  const validateJson = async () => {
    const response = await fetch('/api/validate-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonString: jsonInput, tags, recordSlideIndex })
    })
    
    const result = await response.json()
    setValidation(result)
  }

  const generatePreview = async () => {
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
        setStep('preview')
      } else {
        alert(result.error)
      }
    } catch (err) {
      alert('Invalid JSON: ' + err.message)
    }
  }

  const downloadPptx = async () => {
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
      if (result.ok && result.downloadUrl) {
        window.location.href = result.downloadUrl
      }
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  if (step === 'upload') {
    return (
      <div className="app">
        <header>
          <h1>Solon Slide Studio</h1>
          <p>Upload a PPTX, tag elements, generate recipe, create presentation</p>
        </header>
        
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
        
        <div className="main-layout">
          <div className="sidebar">
            <div className="panel-section">
              <h3>Slides</h3>
              <div className="slide-strip">
                {slides.map((slide, idx) => (
                  <div 
                    key={idx}
                    className={`slide-thumb ${selectedSlide === idx ? 'active' : ''} ${recordSlideIndex === slide.index ? 'record' : ''}`}
                    onClick={() => setSelectedSlide(idx)}
                  >
                    {slide.index}
                  </div>
                ))}
              </div>
              
              <div className="record-toggle">
                <input 
                  type="checkbox" 
                  id="record-toggle"
                  checked={recordSlideIndex === currentSlide.index}
                  onChange={(e) => setRecordSlideIndex(e.target.checked ? currentSlide.index : null)}
                />
                <label htmlFor="record-toggle">Repeat per data item</label>
              </div>
            </div>
            
            <div className="panel-section">
              <h3>Tagged Fields ({tags.length})</h3>
              <div className="tagged-list">
                {tags.length === 0 ? (
                  <p style={{ color: '#718886', fontSize: 12 }}>No fields tagged yet</p>
                ) : (
                  tags.map(t => (
                    <div key={t.elementId} className="tagged-item">
                      <strong>{t.key}</strong>
                      {t.hint && <span>{t.hint}</span>}
                    </div>
                  ))
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
          
          <div className="workspace">
            <div className="panel-section">
              <h3>Slide {currentSlide.index}</h3>
              <div className="slide-preview">
                <div className="slide-preview-inner">
                  {currentSlide.elements.length === 0 ? (
                    <div className="no-elements">No text elements found in this slide</div>
                  ) : (
                    currentSlide.elements.map((elem, idx) => {
                      const isTagged = taggedElementIds.includes(elem.id)
                      const scale = 0.25
                      return (
                        <div
                          key={idx}
                          className={`slide-element ${isTagged ? 'tagged' : ''}`}
                          style={{
                            left: `${elem.bounds.x * scale + 20}px`,
                            top: `${elem.bounds.y * scale + 10}px`,
                            width: `${Math.max(elem.bounds.w * scale, 100)}px`,
                          }}
                          onClick={() => handleElementClick(elem)}
                          title={elem.text}
                        >
                          {isTagged ? `{{${tags.find(t => t.elementId === elem.id).key}}}` : elem.text.substring(0, 40)}
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
          
          <div className="sidebar">
            <div className="panel-section">
              <h3>Instructions</h3>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#B6D9C9', lineHeight: 1.8 }}>
                <li>Click text elements to create placeholders</li>
                <li>Give each placeholder a key name</li>
                <li>Optionally add an AI hint for better results</li>
                <li>Mark one slide as "repeatable" if you have data rows</li>
                <li>Generate the recipe when done</li>
              </ol>
            </div>
          </div>
        </div>
        
        {tagModal && (
          <div className="modal-overlay" onClick={() => setTagModal(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h4>Tag Element</h4>
              <p>Original: "{tagModal.element.text.substring(0, 60)}..."</p>
              <div className="form-group">
                <label>Placeholder name (key)</label>
                <input 
                  type="text" 
                  id="tag-key" 
                  placeholder="e.g., product_name"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>AI hint (optional)</label>
                <input 
                  type="text" 
                  id="tag-hint" 
                  placeholder="e.g., a short punchy headline, max 8 words"
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={() => {
                  const key = document.getElementById('tag-key').value.trim()
                  const hint = document.getElementById('tag-hint').value.trim()
                  if (key) saveTag(key, hint)
                }}>Save Tag</button>
                <button className="btn btn-secondary" onClick={() => setTagModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (step === 'recipe') {
    return (
      <div className="app">
        <header>
          <h1>Recipe</h1>
          <p>Copy this prompt and paste it into an online AI (Claude, ChatGPT)</p>
        </header>
        
        <div className="panel-section">
          <div className="recipe-area">{recipe}</div>
          
          <div className="actions">
            <button className="btn btn-secondary" onClick={() => {
              navigator.clipboard.writeText(recipe)
              alert('Copied to clipboard!')
            }}>
              Copy Recipe
            </button>
            <button className="btn btn-primary" onClick={() => setStep('json')}>
              Next: Paste JSON
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'json') {
    return (
      <div className="app">
        <header>
          <h1>Paste JSON</h1>
          <p>Paste the JSON response from the AI</p>
        </header>
        
        <div className="panel-section">
          <textarea 
            className="json-input"
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='{"title": "My Presentation", "records": [...]}'
          />
          
          <div className="actions">
            <button className="btn btn-secondary" onClick={validateJson}>
              Validate JSON
            </button>
            <button className="btn btn-primary" onClick={generatePreview}>
              Preview & Generate
            </button>
          </div>
          
          {validation && (
            <div className={`validation-status ${validation.valid ? 'valid' : 'invalid'}`}>
              <div><strong>Valid:</strong> {validation.valid ? 'Yes' : 'No'}</div>
              {validation.error && <div style={{ color: '#FF6359' }}>{validation.error}</div>}
              {validation.foundFields?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong>Found fields:</strong> {validation.foundFields.join(', ')}
                </div>
              )}
              {validation.missingFields?.length > 0 && (
                <div style={{ marginTop: 8, color: '#FFD282' }}>
                  <strong>Missing fields:</strong> {validation.missingFields.join(', ')}
                </div>
              )}
              {validation.recordCount !== undefined && (
                <div style={{ marginTop: 8 }}>
                  <strong>Records:</strong> {validation.recordCount}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div className="app">
        <header>
          <h1>Preview</h1>
          <p>Review your generated slides before downloading</p>
        </header>
        
        <div className="panel-section">
          <div className="preview-grid">
            {previewData.map((slide, idx) => (
              <div key={idx} className="preview-card">
                <div className="preview-card-header">
                  Slide {slide.slideNumber}
                  {slide.recordIndex ? ` (Item ${slide.recordIndex})` : ''}
                </div>
                <div className="preview-card-body">
                  Preview content here
                </div>
              </div>
            ))}
          </div>
          
          <div className="actions">
            <button className="btn btn-secondary" onClick={() => setStep('json')}>
              Back to Edit
            </button>
            <button className="btn btn-primary" onClick={downloadPptx}>
              Download PPTX
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  return null
}

export default App