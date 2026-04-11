import { useState, useCallback, useEffect, useRef } from 'react'
import Toast        from './components/Toast.jsx'
import UploadStep   from './steps/UploadStep.jsx'
import TagStep      from './steps/TagStep.jsx'
import RecipeStep   from './steps/RecipeStep.jsx'
import PreviewStep  from './steps/PreviewStep.jsx'
import { mergeTagsWithSlides, triggerDownload } from './utils/tagUtils.js'

const STEPS = ['upload', 'tag', 'recipe', 'preview']

export default function App() {
  // ── Step navigation ────────────────────────────────────────────
  const [step,    setStep]    = useState('upload')
  const [animDir, setAnimDir] = useState('forward')

  const navigateTo = useCallback((newStep) => {
    const curr = STEPS.indexOf(step)
    const next = STEPS.indexOf(newStep)
    setAnimDir(next >= curr ? 'forward' : 'backward')
    setStep(newStep)
  }, [step])

  const stepAnimClass = `step-content step-content-enter-${animDir === 'forward' ? 'right' : 'left'}`

  // ── Template data ──────────────────────────────────────────────
  const [templateFile, setTemplateFile] = useState(null)
  const [slides,       setSlides]       = useState([])

  // ── Tags ───────────────────────────────────────────────────────
  const [tags,             setTags]             = useState([])
  const [repeatableSlides, setRepeatableSlides] = useState([])

  // ── Patch persistence ──────────────────────────────────────────
  const [patches,      setPatches]      = useState([])
  const [currentPatch, setCurrentPatch] = useState(null)
  const [patchName,    setPatchName]    = useState('')
  const [globalPrompt, setGlobalPrompt] = useState('')
  const lastSavedPatchRef = useRef(null)
  const saveTimeoutRef    = useRef(null)

  // ── Chain state ────────────────────────────────────────────────
  const [chainId, setChainId] = useState(null)

  // ── Recipe / generation ────────────────────────────────────────
  const [recipe,             setRecipe]             = useState('')
  const [jsonInput,          setJsonInput]          = useState('')
  const [validation,         setValidation]         = useState(null)
  const [previewData,        setPreviewData]        = useState([])
  const [selectedPreviewIdx, setSelectedPreviewIdx] = useState(0)

  // ── Global toast notification ──────────────────────────────────
  const [toast, setToast] = useState(null)

  // ── canNavigateTo guard ────────────────────────────────────────
  const canNavigateTo = useCallback((s) => {
    if (s === 'upload')  return true
    if (s === 'tag')     return !!templateFile
    if (s === 'recipe')  return !!(templateFile && tags.length > 0)
    if (s === 'preview') return !!(templateFile && tags.length > 0 && jsonInput && validation?.valid)
    return false
  }, [templateFile, tags.length, jsonInput, validation])

  // ── Load patches on mount ──────────────────────────────────────
  useEffect(() => {
    fetch('/api/patches')
      .then(res => res.ok ? res.json() : [])
      .then(data => setPatches(data || []))
      .catch(() => setPatches([]))
  }, [])

  // ── Patch save helpers ─────────────────────────────────────────
  const savePatchToServer = useCallback(async (patch) => {
    try {
      await fetch('/api/patches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch })
      })
    } catch {
      // Non-critical; user is not blocked if a save fails silently
    }
  }, [])

  const triggerSave = useCallback((newTags, newRepeatableSlides, newGlobalPrompt) => {
    if (!currentPatch) return

    const promptToSave = newGlobalPrompt !== undefined ? newGlobalPrompt : globalPrompt

    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      const snapshot = JSON.stringify({ tags: newTags, repeatableSlides: newRepeatableSlides, globalPrompt: promptToSave })
      if (snapshot === lastSavedPatchRef.current) return

      lastSavedPatchRef.current = snapshot
      const updated = patches.map(p =>
        p.id === currentPatch
          ? { ...p, tags: newTags, repeatableSlides: newRepeatableSlides, globalPrompt: promptToSave, updatedAt: new Date().toISOString() }
          : p
      )
      setPatches(updated)
      const patchToSave = updated.find(p => p.id === currentPatch)
      if (patchToSave) savePatchToServer(patchToSave)
    }, 1000)
  }, [currentPatch, patches, globalPrompt, savePatchToServer])

  // ── Auto-load / create patch when entering Tag step ───────────
  useEffect(() => {
    if (step !== 'tag' || slides.length === 0 || tags.length > 0) return
    if (chainId) return  // inside a chain — start fresh

    const existing = patches.find(p => p.pptxFile === templateFile?.fileName)
    if (existing) {
      const merged = mergeTagsWithSlides(existing.tags || [], slides)
      setTags(merged)
      setRepeatableSlides(existing.repeatableSlides || [])
      setCurrentPatch(existing.id)
      setPatchName(existing.name)
      setGlobalPrompt(existing.globalPrompt || '')
      lastSavedPatchRef.current = JSON.stringify({ tags: merged, repeatableSlides: existing.repeatableSlides || [], globalPrompt: existing.globalPrompt || '' })
      return
    }

    const autoTags = mergeTagsWithSlides([], slides)
    if (autoTags.length === 0) return

    setTags(autoTags)
    lastSavedPatchRef.current = JSON.stringify({ tags: autoTags, repeatableSlides: [], globalPrompt: '' })

    const autoPatchName = templateFile?.fileName
      ? templateFile.fileName.replace('.pptx', '') + '_auto'
      : 'auto_patch'
    const newPatch = {
      id: Date.now(),
      name: autoPatchName,
      pptxFile: templateFile?.fileName || '',
      createdAt: new Date().toISOString(),
      tags: autoTags,
      repeatableSlides: [],
      globalPrompt: ''
    }
    setPatches(prev => [...prev, newPatch])
    setCurrentPatch(newPatch.id)
    setPatchName(autoPatchName)
    savePatchToServer(newPatch)
  }, [step, slides, tags.length, templateFile, patches, chainId, savePatchToServer])

  // ── Auto-match patch when a PPTX is loaded ────────────────────
  useEffect(() => {
    if (!templateFile?.fileName || patches.length === 0 || slides.length === 0) return
    const match = patches.find(p => p.pptxFile === templateFile.fileName)
    if (!match) return

    const merged = mergeTagsWithSlides(match.tags || [], slides)
    setTags(merged)
    setRepeatableSlides(match.repeatableSlides || [])
    setCurrentPatch(match.id)
    setPatchName(match.name)
    setGlobalPrompt(match.globalPrompt || '')
    lastSavedPatchRef.current = JSON.stringify({ tags: merged, repeatableSlides: match.repeatableSlides || [], globalPrompt: match.globalPrompt || '' })
  }, [templateFile, patches, slides])

  // ── Apply a saved patch ────────────────────────────────────────
  const handleApplyPatch = useCallback((patchId) => {
    const patch = patches.find(p => p.id === patchId)
    if (!patch || slides.length === 0) return

    const merged = mergeTagsWithSlides(patch.tags || [], slides)
    setTags(merged)
    setRepeatableSlides(patch.repeatableSlides || [])
    setCurrentPatch(patch.id)
    setPatchName(patch.name)
    setGlobalPrompt(patch.globalPrompt || '')
    lastSavedPatchRef.current = JSON.stringify({ tags: merged, repeatableSlides: patch.repeatableSlides || [], globalPrompt: patch.globalPrompt || '' })
  }, [patches, slides])

  // ── Delete a patch ─────────────────────────────────────────────
  const handleDeletePatch = useCallback(async () => {
    if (!currentPatch) return
    try {
      await fetch(`/api/patches/${currentPatch}`, { method: 'DELETE' })
    } catch { /* best-effort */ }
    setPatches(prev => prev.filter(p => p.id !== currentPatch))
    setCurrentPatch(null)
    setPatchName('')
    setGlobalPrompt('')
  }, [currentPatch])

  // ── File upload ────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0]
    if (!file || !file.name.endsWith('.pptx')) {
      setToast({ message: 'Please upload a .pptx file', type: 'error' })
      return
    }

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const base64 = evt.target.result.split(',')[1]
        const res = await fetch('/api/upload-pptx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: base64, fileName: file.name })
        })
        if (!res.ok) throw new Error(`Upload failed (${res.status})`)
        const result = await res.json()
        if (!result.ok) throw new Error(result.error || 'Failed to upload')
        setTemplateFile(result)
        setSlides(result.slides)
        navigateTo('tag')
      } catch (err) {
        setToast({ message: err.message, type: 'error' })
      }
    }
    reader.readAsDataURL(file)
  }, [navigateTo])

  // ── Generate recipe ────────────────────────────────────────────
  const handleGenerateRecipe = useCallback(async () => {
    try {
      const res = await fetch('/api/generate-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags, repeatableSlides, globalPrompt })
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const result = await res.json()
      setRecipe(result.recipe)
      navigateTo('recipe')  // was setStep('recipe') — bug fixed
    } catch (err) {
      setToast({ message: 'Failed to generate recipe: ' + err.message, type: 'error' })
    }
  }, [tags, repeatableSlides, globalPrompt, navigateTo])

  // ── Generate preview & navigate to Preview step ───────────────
  const generatePreview = useCallback(async () => {
    try {
      const jsonData = JSON.parse(jsonInput)
      const res = await fetch('/api/generate-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templatePath: templateFile.filePath, tags, jsonData, repeatableSlides })
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const result = await res.json()
      if (!result.ok) throw new Error(result.error || 'Failed to generate')
      setPreviewData(result.previewData)
      navigateTo('preview')
    } catch (err) {
      setToast({ message: 'Generate failed: ' + err.message, type: 'error' })
    }
  }, [templateFile, tags, jsonInput, repeatableSlides, navigateTo])

  // ── Apply patch round and reset to Tag step ────────────────────
  const applyPatchAndContinue = useCallback(async () => {
    try {
      const jsonData = JSON.parse(jsonInput)

      let activeChainId = chainId
      if (!activeChainId) {
        const res = await fetch('/api/patch-chains', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templatePath: templateFile.filePath, pptxFileName: templateFile.fileName })
        })
        if (!res.ok) throw new Error(`Create chain failed (${res.status})`)
        const data = await res.json()
        if (!data.ok) throw new Error(data.error)
        activeChainId = data.chainId
        setChainId(activeChainId)
      }

      const applyRes = await fetch(`/api/patch-chains/${activeChainId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags, jsonData, repeatableSlides })
      })
      if (!applyRes.ok) throw new Error(`Apply failed (${applyRes.status})`)
      const applyResult = await applyRes.json()
      if (!applyResult.ok) throw new Error(applyResult.error)

      triggerDownload(applyResult.downloadUrl)

      const parseRes = await fetch('/api/parse-pptx-from-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: applyResult.nextBasePath })
      })
      if (!parseRes.ok) throw new Error(`Parse failed (${parseRes.status})`)
      const parseResult = await parseRes.json()
      if (!parseResult.ok) throw new Error(parseResult.error)

      setTemplateFile({ filePath: parseResult.filePath, slides: parseResult.slides, fileName: templateFile.fileName })
      setSlides(parseResult.slides)
      setTags([])
      setRepeatableSlides([])
      setRecipe('')
      setJsonInput('')
      setValidation(null)
      setPreviewData([])
      setSelectedPreviewIdx(0)
      setCurrentPatch(null)
      navigateTo('tag')
    } catch (err) {
      setToast({ message: 'Patch failed: ' + err.message, type: 'error' })
    }
  }, [chainId, templateFile, tags, jsonInput, repeatableSlides, navigateTo])

  // ── Generate final file download ───────────────────────────────
  const generateFinalFile = useCallback(async () => {
    try {
      const jsonData = JSON.parse(jsonInput)

      if (chainId) {
        const res = await fetch(`/api/patch-chains/${chainId}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags, jsonData, repeatableSlides })
        })
        if (!res.ok) throw new Error(`Apply failed (${res.status})`)
        const result = await res.json()
        if (!result.ok) throw new Error(result.error)
        triggerDownload(result.downloadUrl)  // was window.location.href — bug fixed
      } else {
        const res = await fetch('/api/generate-pptx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templatePath: templateFile.filePath, tags, jsonData, repeatableSlides })
        })
        if (!res.ok) throw new Error(`Generate failed (${res.status})`)
        const result = await res.json()
        if (!result.ok) throw new Error(result.error || 'Generate failed')
        triggerDownload(result.downloadUrl)  // was window.location.href — bug fixed
      }
    } catch (err) {
      setToast({ message: 'Download failed: ' + err.message, type: 'error' })
    }
  }, [chainId, templateFile, tags, jsonInput, repeatableSlides])

  // ── Step routing ───────────────────────────────────────────────
  const sharedProps = { step, canNavigateTo, navigateTo, stepAnimClass }

  if (step === 'upload') {
    return (
      <>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <UploadStep
          {...sharedProps}
          templateFile={templateFile}
          handleFileUpload={handleFileUpload}
        />
      </>
    )
  }

  if (step === 'tag') {
    return (
      <>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <TagStep
          {...sharedProps}
          slides={slides}
          tags={tags}
          setTags={setTags}
          repeatableSlides={repeatableSlides}
          setRepeatableSlides={setRepeatableSlides}
          patches={patches}
          currentPatch={currentPatch}
          patchName={patchName}
          setPatchName={setPatchName}
          globalPrompt={globalPrompt}
          setGlobalPrompt={setGlobalPrompt}
          triggerSave={triggerSave}
          onApplyPatch={handleApplyPatch}
          onDeletePatch={handleDeletePatch}
          onGenerateRecipe={handleGenerateRecipe}
        />
      </>
    )
  }

  if (step === 'recipe') {
    return (
      <>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <RecipeStep
          {...sharedProps}
          recipe={recipe}
          jsonInput={jsonInput}
          setJsonInput={setJsonInput}
          validation={validation}
          setValidation={setValidation}
          tags={tags}
          repeatableSlides={repeatableSlides}
          generatePreview={generatePreview}
          setToast={setToast}
        />
      </>
    )
  }

  if (step === 'preview') {
    return (
      <>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <PreviewStep
          {...sharedProps}
          previewData={previewData}
          selectedPreviewIdx={selectedPreviewIdx}
          setSelectedPreviewIdx={setSelectedPreviewIdx}
          applyPatchAndContinue={applyPatchAndContinue}
          generateFinalFile={generateFinalFile}
        />
      </>
    )
  }

  return null
}
