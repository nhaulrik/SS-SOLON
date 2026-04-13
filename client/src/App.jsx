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
  const [propagations,     setPropagations]     = useState([])

  // ── Patch persistence ──────────────────────────────────────────
  const [patches,      setPatches]      = useState([])
  const [currentPatch, setCurrentPatch] = useState(null)
  const [patchName,    setPatchName]    = useState('')
  const [globalPrompt, setGlobalPrompt] = useState('')
  const lastSavedPatchRef = useRef(null)
  const saveTimeoutRef    = useRef(null)

  // ── Chain state ────────────────────────────────────────────────
  const [chainId,             setChainId]             = useState(null)
  const [chainRounds,         setChainRounds]         = useState([])
  const [currentRoundId,      setCurrentRoundId]      = useState(null)
  const [restoredBaseRoundId, setRestoredBaseRoundId] = useState(null)

  // ── Recipe / generation ────────────────────────────────────────
  const [recipe,             setRecipe]             = useState('')
  const [jsonInput,          setJsonInput]          = useState('')
  const [validation,         setValidation]         = useState(null)
  const [previewData,        setPreviewData]        = useState([])
  const [selectedPreviewIdx, setSelectedPreviewIdx] = useState(0)
  const [tagPreviewIdx,      setTagPreviewIdx]      = useState(0)

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

  // chainRounds is managed purely via local state updates (no server sync needed —
  // chainId is not persisted across page reloads, so there is no catch-up scenario).

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

  const triggerSave = useCallback((newTags, newRepeatableSlides, newGlobalPrompt, newPropagations) => {
    if (!currentPatch) return

    const promptToSave      = newGlobalPrompt  !== undefined ? newGlobalPrompt  : globalPrompt
    const propagationsToSave = newPropagations !== undefined ? newPropagations  : propagations

    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      const snapshot = JSON.stringify({ tags: newTags, repeatableSlides: newRepeatableSlides, globalPrompt: promptToSave, propagations: propagationsToSave })
      if (snapshot === lastSavedPatchRef.current) return

      lastSavedPatchRef.current = snapshot
      const updated = patches.map(p =>
        p.id === currentPatch
          ? { ...p, tags: newTags, repeatableSlides: newRepeatableSlides, globalPrompt: promptToSave, propagations: propagationsToSave, updatedAt: new Date().toISOString() }
          : p
      )
      setPatches(updated)
      const patchToSave = updated.find(p => p.id === currentPatch)
      if (patchToSave) savePatchToServer(patchToSave)
    }, 1000)
  }, [currentPatch, patches, globalPrompt, propagations, savePatchToServer])

  // ── Auto-load / create patch when entering Tag step ───────────
  useEffect(() => {
    if (step !== 'tag' || slides.length === 0) return
    if (chainId) return  // inside a chain — preserve existing state

    const existing = patches.find(p => p.pptxFile === templateFile?.fileName)
    if (existing) {
      const merged = mergeTagsWithSlides(existing.tags || [], slides)
      setTags(merged)
      setRepeatableSlides(existing.repeatableSlides || [])
      setPropagations(existing.propagations || [])
      setCurrentPatch(existing.id)
      setPatchName(existing.name)
      setGlobalPrompt(existing.globalPrompt || '')
      lastSavedPatchRef.current = JSON.stringify({ tags: merged, repeatableSlides: existing.repeatableSlides || [], globalPrompt: existing.globalPrompt || '', propagations: existing.propagations || [] })
      return
    }

    // Don't auto-tag - only create patch skeleton, user adds tags manually
    const autoPatchName = templateFile?.fileName
      ? templateFile.fileName.replace('.pptx', '') + '_auto'
      : 'auto_patch'
    const newPatch = {
      id: Date.now(),
      name: autoPatchName,
      pptxFile: templateFile?.fileName || '',
      createdAt: new Date().toISOString(),
      tags: [],
      repeatableSlides: [],
      globalPrompt: '',
      propagations: []
    }
    setPatches(prev => [...prev, newPatch])
    setCurrentPatch(newPatch.id)
    setPatchName(autoPatchName)
    setPropagations([])
    savePatchToServer(newPatch)
    lastSavedPatchRef.current = JSON.stringify({ tags: [], repeatableSlides: [], globalPrompt: '', propagations: [] })
  }, [step, slides, templateFile, patches, chainId, savePatchToServer])

  // ── Auto-match patch when a PPTX is loaded ────────────────────
  useEffect(() => {
    if (!templateFile?.fileName || patches.length === 0 || slides.length === 0) return
    if (chainId) return  // Don't auto-load patch when in chain mode

    const match = patches.find(p => p.pptxFile === templateFile.fileName)
    if (!match) return

    const merged = mergeTagsWithSlides(match.tags || [], slides)
    setTags(merged)
    setRepeatableSlides(match.repeatableSlides || [])
    setPropagations(match.propagations || [])
    setCurrentPatch(match.id)
    setPatchName(match.name)
    setGlobalPrompt(match.globalPrompt || '')
    lastSavedPatchRef.current = JSON.stringify({ tags: merged, repeatableSlides: match.repeatableSlides || [], globalPrompt: match.globalPrompt || '', propagations: match.propagations || [] })
  }, [templateFile, patches, slides, chainId])

  // ── Apply a saved patch ────────────────────────────────────────
  const handleApplyPatch = useCallback((patchId) => {
    const patch = patches.find(p => p.id === patchId)
    if (!patch || slides.length === 0) return

    const merged = mergeTagsWithSlides(patch.tags || [], slides)
    setTags(merged)
    setRepeatableSlides(patch.repeatableSlides || [])
    setPropagations(patch.propagations || [])
    setCurrentPatch(patch.id)
    setPatchName(patch.name)
    setGlobalPrompt(patch.globalPrompt || '')
    lastSavedPatchRef.current = JSON.stringify({ tags: merged, repeatableSlides: patch.repeatableSlides || [], globalPrompt: patch.globalPrompt || '', propagations: patch.propagations || [] })
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
    setPropagations([])
  }, [currentPatch])

  // ── Propagation config ─────────────────────────────────────────
  const handleSavePropagation = useCallback((key, config) => {
    setPropagations(prev => {
      const next = config
        ? [...prev.filter(p => p.key !== key), { key, ...config }]
        : prev.filter(p => p.key !== key)

      // maxChars is a field-level constraint — sync it across all tags sharing
      // this key whenever propagation is configured, regardless of mode.
      const tagsWithKey = tags.filter(t => t.key === key)
      const sourceTag = tagsWithKey.find(t => t.maxChars != null) ?? tagsWithKey[0]

      if (config?.mode === 'non-unique') {
        // Non-unique: sync both hint and maxChars (one value for all slides)
        if (sourceTag) {
          const newTags = tags.map(tag =>
            tag.key === key
              ? { ...tag, hint: sourceTag.hint, maxChars: sourceTag.maxChars }
              : tag
          )
          setTags(newTags)
          triggerSave(newTags, repeatableSlides, undefined, next)
          return next
        }
      }

      if (config?.mode === 'unique') {
        // Unique: hints stay slide-specific, but maxChars is still a shared constraint
        if (sourceTag?.maxChars != null) {
          const newTags = tags.map(tag =>
            tag.key === key
              ? { ...tag, maxChars: sourceTag.maxChars }
              : tag
          )
          setTags(newTags)
          triggerSave(newTags, repeatableSlides, undefined, next)
          return next
        }
      }

      triggerSave(tags, repeatableSlides, undefined, next)
      return next
    })
  }, [tags, repeatableSlides, triggerSave])

  // ── Merge elements from other slides into one shared key ───────
  // targetElementIds: elementIds of tags on other slides to rename to sourceTag.key
  const handleMergeKey = useCallback((sourceTag, targetElementIds) => {
    const newTags = tags.map(tag =>
      targetElementIds.includes(tag.elementId)
        ? { ...tag, key: sourceTag.key, maxChars: sourceTag.maxChars }
        : tag
    )
    setTags(newTags)
    triggerSave(newTags, repeatableSlides, undefined, propagations)
  }, [tags, repeatableSlides, propagations, triggerSave])

  // ── Rename a key across all slides ────────────────────────────
  const handleRenameKeyAllSlides = useCallback((oldKey, newKey) => {
    const newTags = tags.map(tag => tag.key === oldKey ? { ...tag, key: newKey } : tag)
    const newPropagations = propagations
      .map(p => p.key      === oldKey ? { ...p, key:       newKey } : p)
      .map(p => p.linkedKey === oldKey ? { ...p, linkedKey: newKey } : p)
    setTags(newTags)
    setPropagations(newPropagations)
    triggerSave(newTags, repeatableSlides, undefined, newPropagations)
  }, [tags, propagations, repeatableSlides, triggerSave])

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
        body: JSON.stringify({ tags, repeatableSlides, globalPrompt, propagations })
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const result = await res.json()
      setRecipe(result.recipe)
      navigateTo('recipe')
    } catch (err) {
      setToast({ message: 'Failed to generate recipe: ' + err.message, type: 'error' })
    }
  }, [tags, repeatableSlides, globalPrompt, propagations, navigateTo])

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

  // ── Apply patch round and return to Tag step (UC1-UC10) ────────
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
        body: JSON.stringify({
          tags,
          jsonData,
          repeatableSlides,
          propagations,
          baseRoundId: restoredBaseRoundId  // null = use last applied (default)
        })
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


      // UC2, UC3, UC4, UC8: Preserve tags (merged with new slides) and propagations.
      // Keys and hints are preserved; autoGenerate is reset to false so the next
      // iteration starts with AI off - the user opts back in deliberately.
      //
      // For cloned (repeatable) slides, use shapeName-based matching to carry keys
      // forward. Cloned slides are literal XML copies so shapeNames are stable across
      // the copy. The output PPTX renumbers slides positionally (slide3.xml, slide4.xml)
      // so element IDs shift, but shapeNames do not.

      // Enrich tags that lack shapeName by looking up the element in the current slides.
      // This handles tags saved before shapeName was added to the data model.
      const elemById = {}
      slides.forEach(s => s.elements.forEach(e => { elemById[e.id] = e }))
      const enrichedTags = tags.map(t =>
        t.shapeName ? t : { ...t, shapeName: elemById[t.elementId]?.shapeName ?? null }
      )

      // Build (slideIndex:shapeName:elementIndex) -> tag map.
      // Key includes the element's positional index within its slide so that slides
      // with multiple shapes sharing the same shapeName are disambiguated correctly.
      const byShapeKey = {}
      enrichedTags.forEach(t => {
        if (!t.shapeName) return
        const slideElems = (slides.find(s => s.index === t.slideIndex)?.elements || [])
        const elemIdx   = slideElems.findIndex(e => e.id === t.elementId)
        const key       = t.slideIndex + ':' + t.shapeName + ':' + elemIdx
        byShapeKey[key] = t
      })

      // Build output slideNumber -> templateSlideIndex map (clones only)
      const cloneMap = {}
      ;(applyResult.previewData || []).forEach(p => {
        if (p.templateSlideIndex && p.instanceIndex !== null) cloneMap[p.slideNumber] = p.templateSlideIndex
      })

      // Synthesise tags for cloned slides by (shapeName + position index) match.
      // Using the element's index within the slide ensures shapes that share a
      // shapeName (non-unique names in PPTX) are matched to the correct source tag.
      const synthetic = []
      const covered   = new Set()
      parseResult.slides.forEach(slide => {
        const tplIdx = cloneMap[slide.index]
        if (!tplIdx) return
        slide.elements.forEach((elem, elemIdx) => {
          if (covered.has(elem.id)) return
          if (!elem.shapeName) return
          const shapeKey = tplIdx + ':' + elem.shapeName + ':' + elemIdx
          const src = byShapeKey[shapeKey]
          if (!src) return
          synthetic.push({ ...src, elementId: elem.id, slideIndex: slide.index, autoGenerate: false })
          covered.add(elem.id)
        })
      })

      // Standard merge for static slides and elements not covered by shapeName match
      const mergedTags = mergeTagsWithSlides(enrichedTags, parseResult.slides)
        .map(t => ({ ...t, autoGenerate: false }))
      const filteredMerged = mergedTags.filter(t => !covered.has(t.elementId))

      const correctedTags = [...filteredMerged, ...synthetic]

      setTemplateFile({ filePath: parseResult.filePath, slides: parseResult.slides, fileName: templateFile.fileName })
      setSlides(parseResult.slides)
      setTags(correctedTags)                        // preserved + merged, IDs translated (UC2/UC3/UC4)
      setRepeatableSlides([])                      // reset (UC5)
      // propagations preserved — not reset (UC8)
      setRecipe('')
      setJsonInput('')
      setValidation(null)
      setPreviewData(applyResult.previewData)      // set from apply response (UC6)
      setTagPreviewIdx(0)
      setRestoredBaseRoundId(null)

      // Update chain rounds list
      setChainRounds(prev => {
        const without = prev.filter(r => r.id !== applyResult.round.id)
        return [...without, applyResult.round]
      })
      setCurrentRoundId(applyResult.roundId)

      navigateTo('tag')
    } catch (err) {
      setToast({ message: 'Patch failed: ' + err.message, type: 'error' })
    }
  }, [chainId, templateFile, tags, jsonInput, repeatableSlides, propagations, restoredBaseRoundId, navigateTo])

  // ── Restore state from a previous patch round (UC11) ──────────
  const handleRestoreRound = useCallback(async (roundId) => {
    if (!chainId) return
    try {
      const res = await fetch(`/api/patch-chains/${chainId}/patches/${roundId}`)
      if (!res.ok) throw new Error(`Fetch round failed (${res.status})`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)

      const { round, slides: roundSlides, filePath } = data
      const mergedTags = mergeTagsWithSlides(round.tags || [], roundSlides)

      setTemplateFile(prev => ({ ...prev, filePath, slides: roundSlides }))
      setSlides(roundSlides)
      setTags(mergedTags)
      setPropagations(round.propagations || [])
      setRepeatableSlides([])
      setRecipe('')
      setJsonInput('')
      setValidation(null)
      setRestoredBaseRoundId(roundId)
      setCurrentRoundId(roundId)

      // Build pseudo-previewData from the round's slides for display (UC6)
      const restoredPreview = roundSlides.map((s, idx) => ({
        slideNumber:   idx + 1,
        instanceIndex: null,
        content:       null,
        elements:      s.elements,
        background:    s.background,
        sampleText:    []
      }))
      setPreviewData(restoredPreview)
      setTagPreviewIdx(0)

      setToast({ message: `Restored to "${round.name}"`, type: 'success' })
    } catch (err) {
      setToast({ message: 'Restore failed: ' + err.message, type: 'error' })
    }
  }, [chainId])

  // ── Rename a chain round (UC14) ────────────────────────────────
  const handleRenameRound = useCallback(async (roundId, name) => {
    if (!chainId) return
    try {
      const res = await fetch(`/api/patch-chains/${chainId}/patches/${roundId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      if (!res.ok) throw new Error('Rename failed')
      setChainRounds(prev => prev.map(r => r.id === roundId ? { ...r, name } : r))
    } catch { /* best-effort */ }
  }, [chainId])

  // ── Generate final file download ───────────────────────────────
  const generateFinalFile = useCallback(async () => {
    try {
      const jsonData = JSON.parse(jsonInput)

      if (chainId) {
        const res = await fetch(`/api/patch-chains/${chainId}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags, jsonData, repeatableSlides, propagations })
        })
        if (!res.ok) throw new Error(`Apply failed (${res.status})`)
        const result = await res.json()
        if (!result.ok) throw new Error(result.error)
        triggerDownload(result.downloadUrl)
      } else {
        const res = await fetch('/api/generate-pptx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templatePath: templateFile.filePath, tags, jsonData, repeatableSlides })
        })
        if (!res.ok) throw new Error(`Generate failed (${res.status})`)
        const result = await res.json()
        if (!result.ok) throw new Error(result.error || 'Generate failed')
        triggerDownload(result.downloadUrl)
      }
    } catch (err) {
      setToast({ message: 'Download failed: ' + err.message, type: 'error' })
    }
  }, [chainId, templateFile, tags, jsonInput, repeatableSlides, propagations])

  // ── Step routing ───────────────────────────────────────────────
  // Debug context -- serialisable snapshot of meaningful app state for sharing
  const debugContext = {
    timestamp:        new Date().toISOString(),
    step,
    currentPatch,
    patchName,
    chainId,
    currentRoundId,
    restoredBaseRoundId,
    globalPrompt:     globalPrompt || null,
    // Slides: metadata only (no XML content)
    slides: slides.map(s => ({ index: s.index, width: s.width, height: s.height, elementCount: s.elements?.length ?? 0 })),
    tags,
    repeatableSlides,
    propagations,
    validation,
    // Recipe and JSON truncated to avoid overwhelming output
    recipe:           recipe   ? recipe.substring(0, 2000)   + (recipe.length   > 2000 ? '...[truncated]' : '') : null,
    jsonInput:        jsonInput ? jsonInput.substring(0, 2000) + (jsonInput.length > 2000 ? '...[truncated]' : '') : null,
    chainRounds:      chainRounds.map(r => ({ id: r.id, name: r.name, status: r.status, appliedAt: r.appliedAt, outputFile: r.outputFile })),
    previewDataCount: previewData?.length ?? 0,
  }

  const sharedProps = { step, canNavigateTo, navigateTo, stepAnimClass, debugContext }

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
          propagations={propagations}
          onSavePropagation={handleSavePropagation}
          onRenameKeyAllSlides={handleRenameKeyAllSlides}
          onMergeKey={handleMergeKey}
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
          setToast={setToast}
          chainId={chainId}
          chainRounds={chainRounds}
          currentRoundId={currentRoundId}
          onRestoreRound={handleRestoreRound}
          onRenameRound={handleRenameRound}
          previewData={previewData}
          tagPreviewIdx={tagPreviewIdx}
          setTagPreviewIdx={setTagPreviewIdx}
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
          propagations={propagations}
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
