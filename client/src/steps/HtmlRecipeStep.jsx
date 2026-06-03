/**
 * HtmlRecipeStep - Stage 2 of the HTML Visual Flow.
 * Agentic-only generation flow.
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'
import agenticCss from '../components/AgenticPanel.module.css'
import ContentReviewTable from '../components/ContentReviewTable.jsx'
import { readSSE } from '../utils/readSSE.js'

export default function HtmlRecipeStep({
  project,
  projectName,
  flowId,
  step,
  canNavigateTo,
  navigateTo,
  onBack,
  onApplied,
  onAiResponseChange,
  setToast,
  debugContext,
  agenticStatus,
  agenticPhase,
  agenticLogs,
  agenticAgents,
  agenticErrorMsg,
  agenticElapsed,
  agenticContentPrompt,
  agenticPlan,
  setAgenticStatus,
  setAgenticPhase,
  setAgenticLogs,
  setAgenticAgents,
  setAgenticErrorMsg,
  setAgenticElapsed,
  setAgenticContentPrompt,
  setAgenticPlan,
  highlightedAgent,
  onHighlightCleared,
}) {
  const safeProject = project || {}
  const { selections = [], zones = [] } = safeProject

  const [jsonInput, setJsonInput] = useState(safeProject.agenticJsonResponse ? (typeof safeProject.agenticJsonResponse === 'string' ? safeProject.agenticJsonResponse : JSON.stringify(safeProject.agenticJsonResponse, null, 2)) : '')
  const [validation, setValidation] = useState(null)
  const [applying, setApplying] = useState(false)
  const [applySuccess, setApplySuccess] = useState(false)
  const [contextFiles, setContextFiles] = useState([])
  const [selectedFiles, setSelectedFiles] = useState(safeProject.selectedContextFiles || [])
  const [loadingContextFiles, setLoadingContextFiles] = useState(false)
  const [agenticPhaseLocal, setAgenticPhaseLocal] = useState('')
  const [agenticLogsLocal, setAgenticLogsLocal] = useState([])
  const [agenticAgentsLocal, setAgenticAgentsLocal] = useState([])
  const [agenticElapsedLocal, setAgenticElapsedLocal] = useState(0)
  const [agenticPlanLocal, setAgenticPlanLocal] = useState(null)
  const [agenticErrorMsgLocal, setAgenticErrorMsgLocal] = useState('')
  const [agenticCustomInput, setAgenticCustomInput] = useState(safeProject.agenticCustomInput || '')
  const [sliceTemplates, setSliceTemplates] = useState([])
  const [sliceOutputTemplate, setSliceOutputTemplate] = useState(safeProject.sliceOutputTemplate || null)
  const [groupingColumn, setGroupingColumn] = useState(safeProject.groupingColumn || '')
  const [availableColumns, setAvailableColumns] = useState([])
  const [columnsLoading, setColumnsLoading] = useState(false)
   const [filters, setFilters] = useState(safeProject.filters || [])
   const [expandedFilterId, setExpandedFilterId] = useState(null)
   const [filterValuesLoading, setFilterValuesLoading] = useState(false)
   const [filterColumnValues, setFilterColumnValues] = useState({})
   const [retryingAgents, setRetryingAgents] = useState(new Set())
   const [skippedSlides, setSkippedSlides] = useState(safeProject._metadata?.skippedSlides || [])

  const customInputSaveTimerRef = useRef(null)
  const validateTimerRef = useRef(null)
  const agenticLogEndRef = useRef(null)

  useEffect(() => { window.scrollTo(0, 0) }, [])

  const fetchContextFiles = useCallback(async () => {
    setLoadingContextFiles(true)
    try {
      const res = await fetch(`/api/html-flow/context-files?projectName=${encodeURIComponent(projectName)}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setContextFiles((data.files || []).map(f => ({ filename: f.name, ext: f.ext })))
      if (project.selectedContextFiles) setSelectedFiles(project.selectedContextFiles)
    } catch (err) {
      setToast({ message: 'Failed to load context files: ' + err.message, type: 'error' })
    } finally {
      setLoadingContextFiles(false)
    }
  }, [project.selectedContextFiles, projectName, setToast])

  useEffect(() => {
    if (contextFiles.length === 0) fetchContextFiles()
    if (sliceTemplates.length === 0) {
      fetch('/api/opencode/slice-templates').then(r => r.json()).then(data => {
        const list = Array.isArray(data) ? data : []
        setSliceTemplates(list)
        // Preselect the previously saved template once the list is available
        const saved = safeProject.sliceOutputTemplate
        if (saved && !sliceOutputTemplate && list.some(t => t.filename === saved)) {
          setSliceOutputTemplate(saved)
        }
      }).catch(() => {})
    }
  }, [contextFiles.length, fetchContextFiles, sliceTemplates.length])

  useEffect(() => {
    if (!projectName) return
    setColumnsLoading(true)
    const params = new URLSearchParams({ projectName })
    if (selectedFiles.length > 0) params.set('selectedFiles', selectedFiles.join(','))
    fetch(`/api/opencode/agentic/context-columns?${params}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(data => setAvailableColumns(data.columns || []))
      .catch(() => setAvailableColumns([]))
      .finally(() => setColumnsLoading(false))
  }, [projectName, selectedFiles])

   useEffect(() => {
     if (!expandedFilterId || !projectName) {
       setFilterValuesLoading(false)
       return
     }
     const filter = filters.find(f => f.id === expandedFilterId)
     if (!filter || !filter.column) return
     
     let cancelled = false
     setFilterValuesLoading(true)
     const params = new URLSearchParams({ projectName, column: filter.column })
     if (selectedFiles.length > 0) params.set('selectedFiles', selectedFiles.join(','))
     fetch(`/api/opencode/agentic/context-column-values?${params}`)
       .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
       .then(data => {
         if (!cancelled) {
           const vals = data.values || []
           setFilterColumnValues(prev => ({ ...prev, [filter.column]: vals }))
         }
       })
       .catch(() => { if (!cancelled) setFilterColumnValues(prev => ({ ...prev, [filter.column]: [] })) })
       .finally(() => { if (!cancelled) setFilterValuesLoading(false) })
     return () => { cancelled = true }
   }, [expandedFilterId, filters, projectName, selectedFiles])

  const saveSelectedFilesToFlow = useCallback(async (files) => {
    try {
      await fetch(`/api/projects/${projectName}/flows/${flowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedContextFiles: files }),
      })
    } catch {
    }
  }, [flowId, projectName])

  const saveSliceOutputTemplateToFlow = useCallback(async (filename) => {
    try {
      await fetch(`/api/projects/${projectName}/flows/${flowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sliceOutputTemplate: filename }),
      })
    } catch {
    }
  }, [flowId, projectName])

   const addFilter = useCallback(() => {
     const newId = `filter-${Date.now()}`
     const newFilter = { id: newId, column: '', values: [] }
     setFilters(prev => [...prev, newFilter])
     setExpandedFilterId(newId)
   }, [])

   const removeFilter = useCallback((id) => {
     setFilters(prev => prev.filter(f => f.id !== id))
     if (expandedFilterId === id) setExpandedFilterId(null)
   }, [expandedFilterId])

   const updateFilterColumn = useCallback((id, column) => {
     setFilters(prev => prev.map(f => 
       f.id === id ? { ...f, column, values: [] } : f
     ))
     setFilterColumnValues(prev => ({ ...prev, [column]: [] }))
   }, [])

   const updateFilterValues = useCallback((id, values) => {
     setFilters(prev => prev.map(f => 
       f.id === id ? { ...f, values } : f
     ))
   }, [])

   const saveGroupingColumnToFlow = useCallback(async (value) => {
     try {
       await fetch(`/api/projects/${projectName}/flows/${flowId}/agentic`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ groupingColumn: value || null }),
       })
     } catch {}
   }, [flowId, projectName])

  const saveAgenticCustomInputToFlow = useCallback(async (value) => {
    try {
      await fetch(`/api/projects/${projectName}/flows/${flowId}/agentic`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agenticCustomInput: value }),
      })
    } catch {
    }
  }, [flowId, projectName])

  const saveAgenticJsonResponseToFlow = useCallback(async (value) => {
    try {
      await fetch(`/api/projects/${projectName}/flows/${flowId}/agentic`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agenticJsonResponse: value }),
      })
    } catch {
    }
  }, [flowId, projectName])

  const handleJsonChange = useCallback((value) => {
    setJsonInput(value)
    saveAgenticJsonResponseToFlow(value)
    if (!value.trim()) {
      setValidation(null)
      onAiResponseChange?.(null)
    }
  }, [onAiResponseChange, saveAgenticJsonResponseToFlow])

  useEffect(() => {
    if (project.contentPrompt && !agenticContentPrompt) {
      setAgenticContentPrompt(project.contentPrompt)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const validateJson = useCallback(async (value) => {
    if (!value.trim()) {
      setValidation(null)
      onAiResponseChange?.(null)
      return
    }
    try {
      const res = await fetch('/api/html-flow/validate-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, flowId, jsonString: value }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setValidation(data)
      onAiResponseChange?.({ raw: value, validated: true, validationResult: data })
    } catch (err) {
      const errorData = { valid: false, error: 'Validation failed: ' + err.message }
      setValidation(errorData)
      onAiResponseChange?.({ raw: value, validated: true, validationResult: errorData })
    }
   }, [flowId, onAiResponseChange, projectName])

   const handleAgenticGenerate = useCallback(async () => {
    setAgenticStatus('planning')
    setAgenticPhaseLocal('analyzing')
    setAgenticPlanLocal(null)
    setAgenticLogsLocal([])
    setAgenticAgentsLocal([])
    setAgenticErrorMsgLocal('')
    setAgenticElapsedLocal(0)

    try {
      const response = await fetch('/api/opencode/agentic/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           projectName,
           flowId,
           recipe: '',
           zones,
           repeatableSlides: project.repeatableSlides || [],
           contentPrompt: agenticContentPrompt,
           customInput: agenticCustomInput,
           selectedFiles,
           sliceOutputTemplate,
           groupingColumn: groupingColumn || null,
           filters: filters.filter(f => f.column && f.values.length > 0),
         }),
      })
      if (!response.ok) throw new Error(`Server error ${response.status}`)

      for await (const { type, data } of readSSE(response)) {
        if (type === 'phase') setAgenticPhaseLocal(data)
        if (type === 'log') setAgenticLogsLocal(prev => [...prev, data])
        if (type === 'plan') {
          const planData = JSON.parse(data)
          setAgenticPlanLocal(planData)
          setAgenticPlan(planData)
          setAgenticStatus('confirming')
        }
        if (type === 'error') {
          setAgenticStatus('error')
          setAgenticErrorMsgLocal(data)
        }
      }
    } catch (err) {
      setAgenticStatus('error')
      setAgenticErrorMsgLocal(err.message)
    }
   }, [agenticContentPrompt, agenticCustomInput, filters, flowId, project.repeatableSlides, projectName, readSSE, selectedFiles, setAgenticErrorMsgLocal, setAgenticLogsLocal, setAgenticPlanLocal, setAgenticPhaseLocal, setAgenticStatus, sliceOutputTemplate, zones])

  const handleAgenticAccept = useCallback(async () => {
    if (!agenticPlanLocal) return
    setAgenticStatus('running')
    setAgenticPhaseLocal('generating')
    setAgenticLogsLocal([])
    setAgenticAgentsLocal([])
    setAgenticElapsedLocal(0)
    try {
      const response = await fetch('/api/opencode/agentic/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          flowId,
          zones,
          repeatableSlides: project.repeatableSlides || [],
          instances: agenticPlanLocal.instances,
          instanceNames: agenticPlanLocal.instanceNames,
          contentPrompt: agenticContentPrompt,
          customInput: agenticCustomInput,
        }),
      })
      if (!response.ok) throw new Error(`Server error ${response.status}`)
      for await (const { type, data } of readSSE(response)) {
        if (type === 'phase') setAgenticPhaseLocal(data)
        if (type === 'log') setAgenticLogsLocal(prev => [...prev, data])
        if (type === 'agents') setAgenticAgentsLocal(JSON.parse(data))
        if (type === 'agent_update') {
          const u = JSON.parse(data)
          setAgenticAgentsLocal(prev => prev.map(a => a.id === u.id ? { ...a, state: u.state } : a))
        }
        if (type === 'done') {
          setAgenticStatus('done')
          setJsonInput(data)
          validateJson(data)
          handleJsonChange(data)
          saveAgenticJsonResponseToFlow(data)
          setToast({ message: 'JSON generated - review and apply when ready', type: 'success' })
        }
        if (type === 'error') {
          setAgenticStatus('error')
          setAgenticErrorMsgLocal(data)
        }
      }
    } catch (err) {
      setAgenticStatus('error')
      setAgenticErrorMsgLocal(err.message)
    }
    }, [agenticCustomInput, agenticPlanLocal, agenticContentPrompt, flowId, handleJsonChange, project.repeatableSlides, projectName, saveAgenticJsonResponseToFlow, selectedFiles, setAgenticStatus, setToast, validateJson, zones])

  const handleAgenticCancel = () => {
    setAgenticStatus('idle')
    setAgenticPhaseLocal('')
    setAgenticPlanLocal(null)
    setAgenticLogsLocal([])
    setAgenticAgentsLocal([])
    setAgenticErrorMsgLocal('')
    setAgenticElapsedLocal(0)
  }

  const handleApply = useCallback(async () => {
    if (!validation?.valid) return
    setApplying(true)
    try {
      const response = await fetch('/api/html-flow/apply-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          flowId,
          jsonString: jsonInput,
        }),
      })
      if (!response.ok) throw new Error(`Server error ${response.status}`)
      const data = await response.json()
      setApplySuccess(true)
      onApplied?.(data)
      setToast({ message: 'Content applied successfully', type: 'success' })
    } catch (err) {
      setToast({ message: `Failed to apply content: ${err.message}`, type: 'error' })
    } finally {
      setApplying(false)
    }
  }, [flowId, jsonInput, onApplied, projectName, setToast, validation?.valid])

  const handleAgenticRetry = useCallback(async (agentId, { onSuccess } = {}) => {
    setRetryingAgents(prev => new Set([...prev, agentId]))
    setAgenticAgentsLocal(prev => prev.map(a => a.id === agentId ? { ...a, state: 'running' } : a))
    const resolvedInstances = agenticPlanLocal?.instances ?? agenticPlan?.instances ?? {}
    try {
      const res = await fetch('/api/opencode/agentic/retry-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          flowId,
          agentId,
          zones,
          repeatableSlides: project.repeatableSlides || [],
          instances: resolvedInstances,
          contentPrompt: agenticContentPrompt,
          customInput: agenticCustomInput,
          currentJson: jsonInput,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Retry failed')
      setAgenticAgentsLocal(prev => prev.map(a => a.id === agentId ? { ...a, state: 'done' } : a))
      handleJsonChange(data.json)
      saveAgenticJsonResponseToFlow(data.json)
      if (data.resume) {
        const resumeRes = await fetch('/api/opencode/agentic/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName,
            flowId,
            zones,
            repeatableSlides: project.repeatableSlides || [],
            instances: resolvedInstances,
            contentPrompt: agenticContentPrompt,
            customInput: agenticCustomInput,
            currentJson: data.json,
            startFrom: data.resumeStartFrom ?? 0,
          }),
        })
        if (!resumeRes.ok) throw new Error(`Resume failed ${resumeRes.status}`)
        for await (const { type, data: resumeData } of readSSE(resumeRes)) {
          if (type === 'agent_update') {
            const u = JSON.parse(resumeData)
            setAgenticAgentsLocal(prev => prev.map(a => a.id === u.id ? { ...a, state: u.state } : a))
          }
          if (type === 'done') {
            setJsonInput(resumeData)
            handleJsonChange(resumeData)
            saveAgenticJsonResponseToFlow(resumeData)
          }
        }
      }
      onSuccess?.()
      setToast({ message: 'Agent retried successfully', type: 'success' })
    } catch (err) {
      setAgenticAgentsLocal(prev => prev.map(a => a.id === agentId ? { ...a, state: 'error' } : a))
      setToast({ message: 'Retry failed: ' + err.message, type: 'error' })
    } finally {
      setRetryingAgents(prev => { const s = new Set(prev); s.delete(agentId); return s })
    }
   }, [agenticContentPrompt, agenticCustomInput, agenticPlan, agenticPlanLocal, flowId, handleJsonChange, jsonInput, project.repeatableSlides, projectName, saveAgenticJsonResponseToFlow, setToast, zones])

  const handleSkipSlide = useCallback(async () => {
    if (!agenticPlanLocal?.instances) return
    
    // Extract the failing slide name from the error message
    const slideMatch = agenticErrorMsgLocal?.match(/Agent "([^"]+)"/);
    const failingSlide = slideMatch ? slideMatch[1] : null;
    
    if (!failingSlide) {
      setToast({ message: 'Could not identify which slide failed', type: 'error' })
      return
    }

    // Add to skipped slides list
    const updated = [...skippedSlides, failingSlide]
    setSkippedSlides(updated)

    // Save skipped slides to flow
    try {
      await fetch(`/api/projects/${projectName}/flows/${flowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          _metadata: { 
            ...project._metadata,
            skippedSlides: updated 
          } 
        }),
      })
    } catch (err) {
      console.error('Failed to save skipped slides:', err)
    }

    // Create a minimal valid JSON structure with empty slides object
    const emptyJson = JSON.stringify({ slides: {} }, null, 2)
    setJsonInput(emptyJson)
    handleJsonChange(emptyJson)

    // Reset error state and continue
    setAgenticStatus('idle')
    setAgenticPhaseLocal('')
    setAgenticPlanLocal(null)
    setAgenticLogsLocal([])
    setAgenticAgentsLocal([])
    setAgenticErrorMsgLocal('')
    setAgenticElapsedLocal(0)
    
    setToast({ 
      message: `Skipped slide "${failingSlide}". You can retry or move forward with the remaining slides.`, 
      type: 'info' 
    })
  }, [agenticErrorMsgLocal, agenticPlanLocal, flowId, projectName, project._metadata, setToast, skippedSlides, handleJsonChange])

  useEffect(() => {
    if (agenticStatus === 'running') {
      const timer = setInterval(() => setAgenticElapsedLocal(e => e + 1), 1000)
      return () => clearInterval(timer)
    }
  }, [agenticStatus])

  useEffect(() => {
    agenticLogEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [agenticLogsLocal])

  const handleOpenTemplatesFolder = async () => {
    try {
      await fetch('/api/opencode/slice-templates/open-folder', { method: 'POST' })
    } catch {
    }
  }

  const totalCount = selections.length || zones.length
  const currentPhaseIdx = ['analyzing', 'planning', 'generating', 'assembling'].indexOf(agenticPhaseLocal)
  const isAgenticActive = agenticStatus === 'planning' || agenticStatus === 'running'

  const getExtBadgeClass = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'md') return 'ext-badge ext-badge-md'
    if (ext === 'docx') return 'ext-badge ext-badge-docx'
    if (ext === 'xlsx') return 'ext-badge ext-badge-xlsx'
    return 'ext-badge ext-badge-other'
  }

  const handleToggleFile = (filename) => {
    const updated = selectedFiles.includes(filename) ? selectedFiles.filter(f => f !== filename) : [...selectedFiles, filename]
    setSelectedFiles(updated)
    saveSelectedFilesToFlow(updated)
  }

  const handleSelectAllFiles = () => {
    const allSelected = selectedFiles.length === contextFiles.length
    const updated = allSelected ? [] : contextFiles.map(f => f.filename)
    setSelectedFiles(updated)
    saveSelectedFilesToFlow(updated)
  }

  const handleAgenticCustomInputChange = (value) => {
    setAgenticCustomInput(value)
    clearTimeout(customInputSaveTimerRef.current)
    customInputSaveTimerRef.current = setTimeout(() => saveAgenticCustomInputToFlow(value), 500)
  }

  return (
    <div className="app">
      <AppHeader title={safeProject.name || flowId} subtitle={safeProject.templateFilename || projectName} debugContext={debugContext} />
      <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} flow="html" />

      {applySuccess && (
        <div className="apply-success-banner">
          <span className="apply-success-icon">✓</span>
          <span className="apply-success-text">Slides applied successfully! Taking you to preview…</span>
        </div>
      )}

      <div className="recipe-tab-panel">
        <div className="agentic-tab-layout">
          <div className="context-files-panel">
            <div className="context-files-header">
              <h4 className="context-files-heading">
                Context Files
                <span className="slice-template-info-icon" tabIndex={0} aria-label="What are context files?">
                  ⓘ
                  <span className="slice-template-tooltip">
                    Context files are documents in your project's AI Context folder — spreadsheets, briefs, or any data the AI should read when generating slide content. Select only the files relevant to this flow.
                  </span>
                </span>
              </h4>
              {contextFiles.length > 0 && (
                <div className="context-files-controls">
                  <button className="context-files-link" onClick={handleSelectAllFiles}>
                    {selectedFiles.length === contextFiles.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              )}
            </div>
            {loadingContextFiles ? (
              <div className="context-files-loading">Loading context files…</div>
            ) : contextFiles.length === 0 ? (
              <div className="context-files-empty"><p>No context files found. Add files to the 'AI Context' folder in your project.</p></div>
            ) : (
              <div className="context-files-list">
                {contextFiles.map(file => (
                  <div key={file.filename} className="context-file-row">
                    <label className="context-file-label">
                      <input type="checkbox" checked={selectedFiles.includes(file.filename)} onChange={() => handleToggleFile(file.filename)} className="context-file-checkbox" />
                      <span className="context-file-name">{file.filename}</span>
                      <span className={getExtBadgeClass(file.filename)}>{file.filename.split('.').pop()?.toLowerCase()}</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="agentic-prompt-section">
            <label htmlFor="sliceOutputTemplate" className="agentic-prompt-label">
              <span className="agentic-label-row">
                Slice output template
                <span className="slice-template-info-icon" tabIndex={0} aria-label="What is a slice template?">
                  ⓘ
                  <span className="slice-template-tooltip">
                    A slice template tells the AI how to structure the output for each generated slide. It defines which fields to populate and how to map data from your context files — one slice of content per slide instance.
                  </span>
                </span>
              </span>
              <span className="agentic-prompt-hint agentic-prompt-hint--required">Required</span>
            </label>
            <div className="agentic-column-picker-row">
              <select id="sliceOutputTemplate" className={`agentic-template-select${!sliceOutputTemplate ? ' agentic-template-select--empty' : ''}`} value={sliceOutputTemplate || ''} onChange={e => { const val = e.target.value || null; setSliceOutputTemplate(val); saveSliceOutputTemplateToFlow(val) }} disabled={isAgenticActive || agenticStatus === 'confirming'}>
                <option value="">— Select a template —</option>
                {sliceTemplates.map(t => <option key={t.filename} value={t.filename} title={t.description}>{t.name}</option>)}
              </select>
              <button
                type="button"
                className="slice-template-open-folder-btn"
                onClick={handleOpenTemplatesFolder}
                title="Open templates folder"
                aria-label="Open templates folder in file explorer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="agentic-prompt-section">
            <label htmlFor="agenticCustomInput" className="agentic-prompt-label">What should the AI generate?</label>
            <textarea id="agenticCustomInput" className="agentic-prompt-textarea" value={agenticCustomInput} onChange={e => handleAgenticCustomInputChange(e.target.value)} disabled={isAgenticActive || agenticStatus === 'confirming'} placeholder="Describe the slides you want - tone, focus, number of instances, anything specific…" />
          </div>

          {(availableColumns.length > 0 || columnsLoading) && (
            <div className="agentic-prompt-section">
              <label htmlFor="groupingColumn" className="agentic-prompt-label">
                Grouping column
                <span className="agentic-prompt-hint">One slide instance per unique value · leave blank for AI to decide</span>
              </label>
              {columnsLoading ? (
                <div className="agentic-columns-loading">Loading columns…</div>
              ) : (
                <div className="agentic-column-picker-row">
                  <select
                    id="groupingColumn"
                    className="agentic-template-select"
                    value={groupingColumn}
                    onChange={e => {
                      setGroupingColumn(e.target.value)
                      saveGroupingColumnToFlow(e.target.value)
                    }}
                    disabled={isAgenticActive || agenticStatus === 'confirming'}
                  >
                    <option value="">AI decides grouping</option>
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  {groupingColumn && (
                    <button
                      className="agentic-column-clear-btn"
                      onClick={() => { setGroupingColumn(''); saveGroupingColumnToFlow('') }}
                      disabled={isAgenticActive || agenticStatus === 'confirming'}
                      title="Clear — let AI decide"
                    >×</button>
                  )}
                </div>
              )}
            </div>
          )}

           {availableColumns.length > 0 && (
             <div className="agentic-prompt-section">
               <label className="agentic-prompt-label">
                 Filter data
                 <span className="agentic-prompt-hint">Add filters to limit which rows the AI receives</span>
               </label>

               {/* Active filters list */}
               {filters.length > 0 && (
                 <div className={agenticCss.filterChipsList}>
                   {filters.map(filter => (
                     <div key={filter.id} className={agenticCss.filterChip}>
                       <div className={agenticCss.filterChipContent}>
                         <span className={agenticCss.filterChipLabel}>
                           {filter.column || 'Select column'}
                           {filter.column && filter.values.length > 0 && (
                             <span className={agenticCss.filterChipCount}>{filter.values.length}</span>
                           )}
                         </span>
                       </div>
                       <button
                         className={agenticCss.filterChipRemoveBtn}
                         onClick={() => removeFilter(filter.id)}
                         disabled={isAgenticActive || agenticStatus === 'confirming'}
                         title="Remove filter"
                       >×</button>
                     </div>
                   ))}
                 </div>
               )}

               {/* Expanded filter editor */}
               {expandedFilterId && (
                 <div className={agenticCss.filterEditor}>
                   {(() => {
                     const filter = filters.find(f => f.id === expandedFilterId)
                     if (!filter) return null
                     const availableValues = filter.column ? (filterColumnValues[filter.column] || []) : []
                     const selectedValuesSet = new Set(filter.values)
                     
                     return (
                       <>
                         <div className={agenticCss.filterEditorHeader}>
                           <span className={agenticCss.filterEditorTitle}>Edit filter</span>
                           <button
                             className={agenticCss.filterEditorCloseBtn}
                             onClick={() => setExpandedFilterId(null)}
                             title="Close"
                           >×</button>
                         </div>

                         <div className={agenticCss.filterEditorSection}>
                           <label className={agenticCss.filterEditorLabel}>Column</label>
                           <select
                             className="agentic-template-select"
                             value={filter.column}
                             onChange={e => updateFilterColumn(filter.id, e.target.value)}
                             disabled={isAgenticActive || agenticStatus === 'confirming'}
                           >
                             <option value="">Select a column</option>
                             {availableColumns.map(col => (
                               <option key={col} value={col}>{col}</option>
                             ))}
                           </select>
                         </div>

                         {filterValuesLoading && (
                           <div className="agentic-columns-loading">Loading values…</div>
                         )}

                         {filter.column && !filterValuesLoading && availableValues.length > 0 && (
                           <div className={agenticCss.filterEditorSection}>
                             <div className={agenticCss.filterValuesHeader}>
                               <span className={agenticCss.filterValuesCount}>
                                 {filter.values.length} of {availableValues.length} selected
                               </span>
                               <button
                                 className={agenticCss.filterToggleBtn}
                                 onClick={() => updateFilterValues(filter.id, [...availableValues])}
                                 disabled={isAgenticActive || agenticStatus === 'confirming'}
                               >All</button>
                               <button
                                 className={agenticCss.filterToggleBtn}
                                 onClick={() => updateFilterValues(filter.id, [])}
                                 disabled={isAgenticActive || agenticStatus === 'confirming'}
                               >None</button>
                             </div>
                             <div className={agenticCss.filterCheckboxList}>
                               {availableValues.map(val => (
                                 <label key={val} className={agenticCss.filterCheckboxItem}>
                                   <input
                                     type="checkbox"
                                     checked={selectedValuesSet.has(val)}
                                     onChange={e => {
                                       if (e.target.checked) updateFilterValues(filter.id, [...filter.values, val])
                                       else updateFilterValues(filter.id, filter.values.filter(v => v !== val))
                                     }}
                                     disabled={isAgenticActive || agenticStatus === 'confirming'}
                                   />
                                   <span className={agenticCss.filterCheckboxLabel}>{val}</span>
                                 </label>
                               ))}
                             </div>
                             {filter.values.length === 0 && (
                               <p className={agenticCss.filterWarning}>No values selected for this filter</p>
                             )}
                           </div>
                         )}
                       </>
                     )
                   })()}
                 </div>
               )}

               {/* Add filter button */}
               <button
                 className={agenticCss.addFilterBtn}
                 onClick={addFilter}
                 disabled={isAgenticActive || agenticStatus === 'confirming'}
               >+ Add filter</button>
             </div>
           )}

           <div className="agentic-generate-section">
             {(() => {
               const hasInvalidFilters = filters.some(f => f.column && f.values.length === 0)
               return (
                 <button className={`agentic-generate-btn ${isAgenticActive ? 'running' : ''}`} onClick={isAgenticActive ? undefined : handleAgenticGenerate} disabled={isAgenticActive || agenticStatus === 'confirming' || !sliceOutputTemplate || hasInvalidFilters}>{agenticStatus === 'planning' ? 'Analysing…' : agenticStatus === 'running' ? 'Generating…' : '✦ Generate with AI'}</button>
               )
             })()}
             {agenticStatus === 'running' && <span className={agenticCss.timer}>{agenticElapsedLocal}s</span>}
           </div>

          {(agenticStatus === 'planning' || agenticStatus === 'confirming' || agenticStatus === 'running' || agenticStatus === 'done') && (
            <div className={agenticCss.stepper}>
              {['analyzing', 'planning', 'generating', 'assembling'].map((label, index) => {
                const isDone = (agenticStatus === 'confirming' && index <= 1) || (currentPhaseIdx > index && agenticStatus !== 'confirming') || agenticStatus === 'done'
                const isActive = currentPhaseIdx === index && (agenticStatus === 'planning' || agenticStatus === 'running')
                return (
                  <div key={label} className={agenticCss.stepItem}>
                    <div className={`${agenticCss.stepDot} ${isDone ? agenticCss.done : ''} ${isActive ? agenticCss.active : ''}`}>{isDone ? '✓' : index + 1}</div>
                    <span className={`${agenticCss.stepLabel} ${isDone ? agenticCss.done : ''} ${isActive ? agenticCss.active : ''}`}>{label}</span>
                    {index < 3 && <div className={`${agenticCss.stepConnector} ${isDone ? agenticCss.done : ''}`} />}
                  </div>
                )
              })}
            </div>
          )}

          {agenticStatus === 'confirming' && agenticPlanLocal && (
            <div className={agenticCss.confirmCard}>
              <div className={agenticCss.confirmHeader}><span className={agenticCss.confirmIcon}>◎</span><span className={agenticCss.confirmTitle}>Review generated content</span></div>
              {agenticPlanLocal.rationale && (
                <p className={agenticCss.confirmRationale}>
                  {agenticPlanLocal.rationale}
                  {agenticPlanLocal.groupingColumn && (
                    <span className={agenticCss.confirmGroupingTag}>grouped by <strong>{agenticPlanLocal.groupingColumn}</strong></span>
                  )}
                </p>
              )}
              {agenticPlanLocal.contextSlices && Object.keys(agenticPlanLocal.contextSlices).length > 0 ? (
                <div className={agenticCss.reviewTableWrapper}><ContentReviewTable contextSlices={agenticPlanLocal.contextSlices} instanceNames={agenticPlanLocal.instanceNames || []} /></div>
              ) : (
                <div className={agenticCss.confirmRationale} style={{ fontStyle: 'italic' }}><strong style={{ fontStyle: 'normal' }}>No data preview available.</strong> Generation will still proceed using the full context files.</div>
              )}
              <div className={agenticCss.confirmActions}>
                <button className={agenticCss.acceptBtn} onClick={handleAgenticAccept}>Accept &amp; Generate</button>
                <button className={agenticCss.cancelBtn} onClick={handleAgenticCancel}>Cancel</button>
              </div>
            </div>
          )}

          {highlightedAgent && !retryingAgents.has(highlightedAgent.id) && (
            <div className={agenticCss.regenRequestCard}>
              <div className={agenticCss.regenRequestHeader}>
                <span className={agenticCss.regenRequestIcon}>↺</span>
                <span className={agenticCss.regenRequestTitle}>Slide flagged for regeneration</span>
              </div>
              <p className={agenticCss.regenRequestLabel}>{highlightedAgent.label}</p>
              <div className={agenticCss.regenRequestActions}>
                <button
                  className={agenticCss.acceptBtn}
                  onClick={() => handleAgenticRetry(highlightedAgent.id, { onSuccess: onHighlightCleared })}
                >
                  Regenerate
                </button>
                <button className={agenticCss.cancelBtn} onClick={onHighlightCleared}>Dismiss</button>
              </div>
            </div>
          )}

          {highlightedAgent && retryingAgents.has(highlightedAgent.id) && (
            <div className={agenticCss.regenRequestCard}>
              <div className={agenticCss.regenRequestHeader}>
                <div className={agenticCss.chipSpinner} />
                <span className={agenticCss.regenRequestTitle}>Regenerating {highlightedAgent.label}…</span>
              </div>
            </div>
          )}

          {agenticAgentsLocal.length > 0 && (
            <div className={agenticCss.chipsSection}>
              <div className={agenticCss.chipsLabel}>Agents</div>
              <div className={agenticCss.chips}>
                {agenticAgentsLocal.map(agent => (
                  <div key={agent.id} className={`${agenticCss.chip} ${agenticCss[agent.state]}`}>
                    {agent.state === 'running' && <div className={agenticCss.chipSpinner} />}
                    {agent.state === 'done'    && '✓ '}
                    {agent.state === 'error'   && '✕ '}
                    {agent.label}
                    {agent.state === 'error' && !retryingAgents.has(agent.id) && (
                      <button
                        className={agenticCss.chipRetryBtn}
                        onClick={() => handleAgenticRetry(agent.id)}
                        title="Retry this agent"
                      >↺</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(agenticStatus === 'planning' || agenticStatus === 'running' || agenticStatus === 'done' || agenticStatus === 'error') && (
            <div className={agenticCss.logSection}>
              <div className={agenticCss.logLabel}>Activity</div>
              <div className={agenticCss.log}>
                {agenticLogsLocal.length === 0
                  ? (agenticStatus === 'planning' || agenticStatus === 'running') && <span className={agenticCss.logWaiting}>Connecting to AI…</span>
                  : agenticLogsLocal.map((line, i) => <span key={i} className={`${agenticCss.logLine} ${i === agenticLogsLocal.length - 1 ? agenticCss.latest : ''}`}>{line}{'\n'}</span>)}
                <span ref={agenticLogEndRef} />
              </div>
            </div>
          )}

          {agenticStatus === 'done' && (
            <div className={agenticCss.successBanner}><span>✓</span><span>JSON generated and pasted into the Response field. Review and apply when ready.</span></div>
          )}

          {agenticStatus === 'error' && (
            <div className={agenticCss.errorBanner}>
              <strong>Generation failed</strong>
              <pre className={agenticCss.errorDetail}>{agenticErrorMsgLocal || agenticErrorMsg}</pre>
              <div className={agenticCss.errorActions}>
                <button className={agenticCss.resetBtn} onClick={handleAgenticCancel}>Try again</button>
                <button className={agenticCss.resetBtn} onClick={handleSkipSlide} style={{backgroundColor: '#ff9800'}}>Skip this slide</button>
                <button className={agenticCss.copyBtn} onClick={() => navigator.clipboard.writeText(agenticErrorMsgLocal || agenticErrorMsg)}>Copy error</button>
              </div>
            </div>
          )}

          <div className="agentic-json-section">
            <h4>JSON Response</h4>
            <div className="html-recipe-json-wrapper">
              <textarea className={`json-input${validation?.valid === false ? ' has-error' : ''}`} value={jsonInput} onChange={e => handleJsonChange(e.target.value)} placeholder="JSON will appear here after generation…" spellCheck={false} />
            </div>
            {validation?.valid === false && (
              <div className="validation-status invalid"><strong>{validation.error || 'Invalid JSON'}</strong></div>
            )}
            {validation?.valid === true && (
              <div className="validation-status valid">✓ {validation.foundFields?.length ?? 0} fields</div>
            )}
            <div className="html-recipe-actions">
              <button className="btn btn-link" onClick={onBack}><span aria-hidden="true">←</span> Back to template</button>
              <button className="btn btn-primary" onClick={handleApply} disabled={!validation?.valid || applying}>{applying ? 'Applying…' : <><span aria-hidden="true">→</span> Apply content</>}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
