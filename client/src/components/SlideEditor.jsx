import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorView, lineNumbers, keymap, highlightActiveLine, drawSelection, dropCursor } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { html as htmlLang } from '@codemirror/lang-html'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { appTheme } from './editorTheme'
import styles from './SlideEditor.module.css'

// ── CodeMirror extensions ─────────────────────────────────────────────────────

function buildExtensions() {
  return [
    lineNumbers(),
    foldGutter(),
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    htmlLang({ matchClosingTags: true, autoCloseTags: true }),
    autocompletion(),
    keymap.of([
      ...defaultKeymap, ...historyKeymap, ...foldKeymap,
      ...searchKeymap, ...completionKeymap, indentWithTab,
    ]),
    appTheme,
    EditorView.lineWrapping,
  ]
}

// ── Preview srcDoc builder ────────────────────────────────────────────────────

function buildPreviewSrcDoc(html, scale) {
  if (!html) return ''
  const s = typeof scale === 'number' && scale > 0 ? scale : 1

   const injection = `<style>
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#0a0f1a;display:block}
#solon-slide-shell{position:absolute;top:0;left:0;width:1280px;height:720px;transform-origin:top left;transform:scale(${s});overflow:hidden}
</style>
<script>
(function(){
function getSelectorPath(el){
  var parts=[],node=el;
  while(node&&node!==document.body){
    var sel=node.tagName.toLowerCase();
    if(node.id){sel+='#'+node.id;parts.unshift(sel);break}
    var sibs=Array.from(node.parentNode&&node.parentNode.children||[]).filter(function(s){return s.tagName===node.tagName});
    if(sibs.length>1)sel+=':nth-of-type('+(sibs.indexOf(node)+1)+')';
    parts.unshift(sel);
    if(sel.startsWith('section'))break;
    node=node.parentNode;
  }
  return parts.join(' > ');
}
function isEditable(el){
  if(!el)return false;
  var tag=el.tagName&&el.tagName.toLowerCase();
  if(['html','body','section','div','main','article','aside','nav','header','footer'].indexOf(tag)>=0){
    for(var i=0;i<el.childNodes.length;i++){var n=el.childNodes[i];if(n.nodeType===3&&n.textContent.trim())return true}
    return false;
  }
  return['p','h1','h2','h3','h4','h5','h6','span','li','td','th'].indexOf(tag)>=0;
}
function makeEditable(el){
  if(!isEditable(el))return;
  el.addEventListener('mouseenter',function(){el.style.outline='2px solid rgba(59,130,246,0.5)';el.style.cursor='text';el.style.backgroundColor='rgba(59,130,246,0.05)'});
  el.addEventListener('mouseleave',function(){if(el.contentEditable!=='true'){el.style.outline='none';el.style.backgroundColor=''}});
  el.addEventListener('click',function(e){e.stopPropagation();el.contentEditable='true';el.focus();var r=document.createRange();r.selectNodeContents(el);var s=window.getSelection();s.removeAllRanges();s.addRange(r)});
  el.addEventListener('blur',function(){el.contentEditable='false';el.style.outline='none';el.style.backgroundColor='';window.parent.postMessage({type:'solon-edit',selector:getSelectorPath(el),newText:el.innerText},'*')});
  el.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();el.blur()}});
}
function initEditable(){
  document.querySelectorAll('*').forEach(makeEditable);
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initEditable);
}else{
  initEditable();
}
})();
</script>`

  let result = html
  if (!result.includes('id="solon-slide-shell"')) {
    result = result.replace(/(<section[\s>])/i, '<div id="solon-slide-shell">$1')
    result = result.replace(/<\/section>/, '</section></div>')
  }
  return result.includes('</head>')
    ? result.replace('</head>', injection + '</head>')
    : injection + result
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

function groupByFlow(exports) {
  const map = {}
  for (const exp of (exports || [])) {
    if (!map[exp.flowId]) {
      map[exp.flowId] = { flowId: exp.flowId, flowName: exp.flowName, exports: [] }
    }
    map[exp.flowId].exports.push({
      exportId:     exp.exportId,
      exportNumber: exp.exportNumber,
      slideCount:   exp.slideCount,
      createdAt:    exp.createdAt,
      slides:       null,
    })
  }
  const flows = Object.values(map)
  for (const f of flows) f.exports.sort((a, b) => b.exportNumber - a.exportNumber)
  return flows
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SlideEditor({ projectName, initialExports, setToast }) {
  // ── Tree state ───────────────────────────────────────────────────────────────
  const [flows,           setFlows]           = useState(() => groupByFlow(initialExports))
  const [expandedExports, setExpandedExports] = useState(new Set())
  const [loadingExports,  setLoadingExports]  = useState(new Set())
  const [selectedKey,     setSelectedKey]     = useState(null)
  const [checkedSlides,   setCheckedSlides]   = useState(new Set())
  const [dirtySlides,     setDirtySlides]     = useState({})

  // ── Search ───────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')

  const filteredFlows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return flows
    return flows
      .map(flow => {
        const flowMatches = flow.flowName.toLowerCase().includes(q)
        const filteredExports = flow.exports
          .map(exp => {
            const expMatches = flowMatches || String(exp.exportNumber).includes(q)
            if (!exp.slides) return expMatches ? exp : null
            const filteredSlides = exp.slides.filter(slide =>
              expMatches ||
              (slide.title || slide.file).toLowerCase().includes(q)
            )
            if (expMatches || filteredSlides.length > 0) {
              return { ...exp, slides: expMatches ? exp.slides : filteredSlides }
            }
            return null
          })
          .filter(Boolean)
        if (flowMatches || filteredExports.length > 0) {
          return { ...flow, exports: filteredExports }
        }
        return null
      })
      .filter(Boolean)
  }, [flows, searchQuery])

  // ── Editor / preview state ───────────────────────────────────────────────────
  const [loadingSlide,  setLoadingSlide]  = useState(false)
  const [previewSrcDoc, setPreviewSrcDoc] = useState('')
  const [previewScale,  setPreviewScale]  = useState(1)
  const [saving,        setSaving]        = useState(false)
  const [forking,       setForking]       = useState(false)

  // ── Split pane ───────────────────────────────────────────────────────────────
  const [splitPct,        setSplitPct]        = useState(50)
  const dragging          = useRef(false)
  const splitContainerRef = useRef(null)

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const editorHostRef   = useRef(null)
  const editorViewRef   = useRef(null)
  const iframeRef       = useRef(null)
  const previewTimerRef = useRef(null)
  const currentHtmlRef  = useRef('')
  const selectedKeyRef  = useRef(null)
  const previewScaleRef = useRef(1)
  const isLoadingRef    = useRef(false)

  // ── Slide row refs (for scroll-to-active) ────────────────────────────────────
  const slideRowRefs = useRef({})

  const scrollToActive = useCallback(() => {
    if (!selectedKey) return
    const el = slideRowRefs.current[selectedKey]
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedKey])

  useEffect(() => { selectedKeyRef.current = selectedKey },   [selectedKey])
  useEffect(() => { previewScaleRef.current = previewScale }, [previewScale])

  // ── Preview wrapper (ResizeObserver) ─────────────────────────────────────────
  const roRef = useRef(null)
  const previewWrapperRef = useCallback((el) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null }
    if (!el) return
    const measure = () => {
      const { width } = el.getBoundingClientRect()
      if (width > 0) setPreviewScale(width / 1280)
    }
    measure()
    roRef.current = new ResizeObserver(measure)
    roRef.current.observe(el)
  }, [])

  useEffect(() => {
    if (currentHtmlRef.current) {
      setPreviewSrcDoc(buildPreviewSrcDoc(currentHtmlRef.current, previewScale))
    }
  }, [previewScale])

  // ── Mount CodeMirror (once) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!editorHostRef.current || editorViewRef.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          ...buildExtensions(),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            const html = update.state.doc.toString()
            currentHtmlRef.current = html
            const key = selectedKeyRef.current
            if (key && !isLoadingRef.current) setDirtySlides(prev => ({ ...prev, [key]: html }))
            clearTimeout(previewTimerRef.current)
            previewTimerRef.current = setTimeout(() => {
              setPreviewSrcDoc(buildPreviewSrcDoc(html, previewScaleRef.current))
            }, 200)
          }),
        ],
      }),
      parent: editorHostRef.current,
    })
    editorViewRef.current = view
    return () => { view.destroy(); editorViewRef.current = null }
  }, [])

  // ── postMessage: preview inline edit → patch editor ─────────────────────────
  useEffect(() => {
    const handle = (event) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'solon-edit') return
      const { selector, newText } = event.data
      if (!selector || newText === undefined) return
      const current = currentHtmlRef.current
      if (!current) return
      try {
        const doc = new DOMParser().parseFromString(current, 'text/html')
        const el  = doc.querySelector(selector)
        if (!el) return
        el.textContent = newText
        const updated = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: updated },
          })
        }
        currentHtmlRef.current = updated
        const key = selectedKeyRef.current
        if (key) setDirtySlides(prev => ({ ...prev, [key]: updated }))
      } catch {}
    }
    window.addEventListener('message', handle)
    return () => window.removeEventListener('message', handle)
  }, [])

  // ── Auto-expand first export on mount ────────────────────────────────────────
  useEffect(() => {
    if (flows.length > 0 && flows[0].exports.length > 0) {
      const { flowId }   = flows[0]
      const { exportId } = flows[0].exports[0]
      setExpandedExports(new Set([`${flowId}::${exportId}`]))
      loadExportSlides(flowId, exportId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Tree data loading ────────────────────────────────────────────────────────

  const loadExportSlides = useCallback(async (flowId, exportId) => {
    const key = `${flowId}::${exportId}`
    setLoadingExports(prev => new Set([...prev, key]))
    try {
      const res  = await fetch(`/api/projects/${projectName}/flows/${flowId}/exports/${exportId}`)
      if (!res.ok) return
      const data = await res.json()
      const slides = data.export?.content?.slides || []
      setFlows(prev => prev.map(f =>
        f.flowId !== flowId ? f : {
          ...f,
          exports: f.exports.map(e =>
            e.exportId !== exportId ? e : { ...e, slides }
          ),
        }
      ))
    } catch {}
    finally {
      setLoadingExports(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }, [projectName])

  const toggleExport = useCallback((flowId, exportId) => {
    const key = `${flowId}::${exportId}`
    setExpandedExports(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        loadExportSlides(flowId, exportId)
      }
      return next
    })
  }, [loadExportSlides])

  const toggleSlideCheck = useCallback((key, e) => {
    e.stopPropagation()
    setCheckedSlides(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const selectAllVisible = useCallback(() => {
    const keys = new Set()
    for (const flow of filteredFlows) {
      for (const exp of flow.exports) {
        if (!exp.slides) continue
        for (const slide of exp.slides) {
          keys.add(`${flow.flowId}::${exp.exportId}::${slide.file}`)
        }
      }
    }
    setCheckedSlides(keys)
  }, [filteredFlows])

  // ── Slide open ───────────────────────────────────────────────────────────────

  const loadIntoEditor = useCallback((html) => {
    currentHtmlRef.current = html
    if (editorViewRef.current) {
      isLoadingRef.current = true
      editorViewRef.current.dispatch({
        changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: html },
      })
      isLoadingRef.current = false
    }
    setPreviewSrcDoc(buildPreviewSrcDoc(html, previewScaleRef.current))
  }, [])

  const openSlide = useCallback(async (flowId, exportId, slideFile) => {
    const key = `${flowId}::${exportId}::${slideFile}`
    setSelectedKey(key)
    selectedKeyRef.current = key
    // Auto-expand the parent export when a slide is opened
    const expKey = `${flowId}::${exportId}`
    setExpandedExports(prev => prev.has(expKey) ? prev : new Set([...prev, expKey]))

    if (dirtySlides[key]) { loadIntoEditor(dirtySlides[key]); return }

    setLoadingSlide(true)
    try {
      const res = await fetch(
        `/api/projects/${projectName}/flows/${flowId}/exports/${exportId}/slides/${slideFile}`,
        { headers: { Accept: 'text/html' } }
      )
      if (!res.ok) return
      loadIntoEditor(await res.text())
    } finally {
      setLoadingSlide(false)
    }
  }, [dirtySlides, projectName, loadIntoEditor])

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!selectedKey || saving) return
    const [flowId, exportId, slideFile] = selectedKey.split('::')
    const html = dirtySlides[selectedKey] || currentHtmlRef.current
    if (!html) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/projects/${projectName}/flows/${flowId}/exports/${exportId}/slides/${slideFile}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }) }
      )
      if (res.ok) {
        setDirtySlides(prev => { const n = { ...prev }; delete n[selectedKey]; return n })
        setToast?.({ type: 'success', message: 'Slide saved.' })
      } else {
        setToast?.({ type: 'error', message: 'Save failed.' })
      }
    } catch { setToast?.({ type: 'error', message: 'Save failed.' }) }
    finally  { setSaving(false) }
  }, [selectedKey, saving, dirtySlides, projectName, setToast])

  // ── Fork (New Export from selection) ────────────────────────────────────────

  const handleFork = useCallback(async () => {
    if (checkedSlides.size === 0 || forking) return
    const bySource = {}
    for (const key of checkedSlides) {
      const [flowId, exportId, slideFile] = key.split('::')
      const src = `${flowId}::${exportId}`
      if (!bySource[src]) bySource[src] = { flowId, exportId, slides: [], overrides: {} }
      bySource[src].slides.push(slideFile)
      if (dirtySlides[key]) bySource[src].overrides[slideFile] = dirtySlides[key]
    }
    setForking(true)
    try {
      for (const { flowId, exportId, slides, overrides } of Object.values(bySource)) {
        const res = await fetch(
          `/api/projects/${projectName}/flows/${flowId}/exports/${exportId}/fork`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slides, overrides }) }
        )
        if (!res.ok) continue
        const data = await res.json()
        const newExp = {
          exportId:     data.exportId,
          exportNumber: data.exportNumber,
          slideCount:   data.slideCount,
          createdAt:    new Date().toISOString(),
          slides:       null,
        }
        setFlows(prev => prev.map(f =>
          f.flowId !== flowId ? f : { ...f, exports: [newExp, ...f.exports] }
        ))
        const expKey = `${flowId}::${data.exportId}`
        setExpandedExports(prev => new Set([...prev, expKey]))
        loadExportSlides(flowId, data.exportId)
      }
      setCheckedSlides(new Set())
      setToast?.({ type: 'success', message: 'New export created.' })
    } catch { setToast?.({ type: 'error', message: 'Export failed.' }) }
    finally  { setForking(false) }
   }, [checkedSlides, forking, dirtySlides, projectName, setToast, loadExportSlides])

   // ── Delete ───────────────────────────────────────────────────────────────────

   const handleDeleteExport = useCallback(async (flowId, exportId) => {
     const flow = flows.find(f => f.flowId === flowId)
     const exp = flow?.exports.find(e => e.exportId === exportId)
     if (!exp) return

     const confirmed = window.confirm(
       `Delete Export #${exp.exportNumber}?\n\nThis will remove all ${exp.slideCount} slide(s). This action cannot be undone.`
     )
     if (!confirmed) return

     try {
       const res = await fetch(
         `/api/projects/${projectName}/flows/${flowId}/exports/${exportId}`,
         { method: 'DELETE' }
       )
       if (!res.ok) throw new Error('Failed to delete export')

       // Clear selection if deleted export is open
       const [selFlowId, selExportId] = selectedKey?.split('::') ?? []
       if (selFlowId === flowId && selExportId === exportId) {
         setSelectedKey(null)
       }

       // Remove from flows
       setFlows(prev => prev.map(f =>
         f.flowId !== flowId ? f : {
           ...f,
           exports: f.exports.filter(e => e.exportId !== exportId),
         }
       ))

       setToast?.({ type: 'success', message: `Export #${exp.exportNumber} deleted` })
     } catch (err) {
       setToast?.({ type: 'error', message: err.message })
     }
   }, [flows, selectedKey, projectName, setToast])

   const handleDeleteSlide = useCallback(async (flowId, exportId, slideFile) => {
     const flow = flows.find(f => f.flowId === flowId)
     const exp = flow?.exports.find(e => e.exportId === exportId)
     const slide = exp?.slides?.find(s => s.file === slideFile)
     if (!slide) return

     const confirmed = window.confirm(
       `Delete slide "${slide.title || slideFile}"?\n\nThis action cannot be undone.`
     )
     if (!confirmed) return

     try {
       const res = await fetch(
         `/api/projects/${projectName}/flows/${flowId}/exports/${exportId}/slides/${slideFile}`,
         { method: 'DELETE' }
       )
       if (!res.ok) throw new Error('Failed to delete slide')

       // Clear selection if deleted slide is open
       const slideKey = `${flowId}::${exportId}::${slideFile}`
       if (selectedKey === slideKey) {
         setSelectedKey(null)
       }

       // Remove from flows
       setFlows(prev => prev.map(f =>
         f.flowId !== flowId ? f : {
           ...f,
           exports: f.exports.map(e =>
             e.exportId !== exportId ? e : {
               ...e,
               slides: e.slides.filter(s => s.file !== slideFile),
               slideCount: (e.slideCount || 0) - 1,
             }
           ),
         }
       ))

       // Remove from dirty slides if present
       setDirtySlides(prev => {
         const next = { ...prev }
         delete next[slideKey]
         return next
       })

       // Remove from checked slides if present
       setCheckedSlides(prev => {
         const next = new Set(prev)
         next.delete(slideKey)
         return next
       })

       setToast?.({ type: 'success', message: 'Slide deleted' })
     } catch (err) {
       setToast?.({ type: 'error', message: err.message })
     }
   }, [flows, selectedKey, projectName, setToast])

   // ── Split divider drag ───────────────────────────────────────────────────────

  const onDividerMouseDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    const onMove = (ev) => {
      if (!dragging.current || !splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      setSplitPct(Math.min(75, Math.max(25, ((ev.clientX - rect.left) / rect.width) * 100)))
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',  onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',  onUp)
  }, [])

  // ── Derived ──────────────────────────────────────────────────────────────────

  const isDirty      = selectedKey ? !!dirtySlides[selectedKey] : false
  const selParts     = selectedKey?.split('::') ?? null
  const selFlowName  = selParts ? (flows.find(f => f.flowId === selParts[0])?.flowName ?? selParts[0]) : null
  const selExportNum = selParts?.[1]?.replace('export-', '') ?? null
  const selSlideFile = selParts?.[2] ?? null

  // ── Match highlighter ────────────────────────────────────────────────────────
  const highlightMatch = useCallback((text, query) => {
    if (!query.trim()) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase().trim())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className={styles.matchHighlight}>{text.slice(idx, idx + query.trim().length)}</mark>
        {text.slice(idx + query.trim().length)}
      </>
    )
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={styles.editor}>

      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          {selectedKey ? (
            <span className={styles.breadcrumb}>
              <span className={styles.bcFlow}>{selFlowName}</span>
              <span className={styles.bcSep}>/</span>
              <span className={styles.bcExport}>Export #{selExportNum}</span>
              <span className={styles.bcSep}>/</span>
              <span className={styles.bcSlide}>{selSlideFile}</span>
              {isDirty && <span className={styles.dirtyBadge}>● unsaved</span>}
            </span>
          ) : (
            <span className={styles.noSelection}>Select a slide from the tree to edit</span>
          )}
        </div>
        <div className={styles.topBarRight}>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!selectedKey || !isDirty || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>

        {/* Tree panel */}
        <div className={styles.treePanel}>

          {/* Search bar */}
          <div className={styles.treeSearch}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search slides…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search slides"
            />
            {searchQuery && (
              <button
                className={styles.searchClear}
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >✕</button>
            )}
          </div>

          {/* Toolbar */}
          <div className={styles.treeToolbar}>
            <button
              className={styles.toolbarBtn}
              onClick={() => {
                const keys = new Set()
                flows.forEach(f => f.exports.forEach(e => {
                  const k = `${f.flowId}::${e.exportId}`
                  keys.add(k)
                  if (!e.slides) loadExportSlides(f.flowId, e.exportId)
                }))
                setExpandedExports(keys)
              }}
              title="Expand all exports"
            >⊞ All</button>
            <button
              className={styles.toolbarBtn}
              onClick={() => setExpandedExports(new Set())}
              title="Collapse all exports"
            >⊟ None</button>
            <button
              className={styles.toolbarBtn}
              onClick={selectAllVisible}
              title="Select all visible slides"
            >☑ Select</button>
            {checkedSlides.size > 0 && (
              <button
                className={styles.toolbarBtn}
                onClick={() => setCheckedSlides(new Set())}
                title="Clear selection"
              >☐ Clear</button>
            )}
            {selectedKey && (
              <button
                className={`${styles.toolbarBtn} ${styles.toolbarBtnJump}`}
                onClick={scrollToActive}
                title="Scroll to active slide"
              >⊙ Jump</button>
            )}
          </div>

          <div className={styles.treeScroll}>
            {filteredFlows.length === 0 ? (
              searchQuery ? (
                <p className={styles.noResults}>No slides match "<strong>{searchQuery}</strong>"</p>
              ) : (
                <p className={styles.treeEmpty}>No exports available. Generate slides in a flow first.</p>
              )
            ) : filteredFlows.map(flow => (
              <div key={flow.flowId} className={styles.flowGroup}>
                <div className={styles.flowLabel}>{highlightMatch(flow.flowName, searchQuery)}</div>

                {flow.exports.map(exp => {
                  const expKey   = `${flow.flowId}::${exp.exportId}`
                  const expanded = expandedExports.has(expKey)
                  const loading  = loadingExports.has(expKey)
                  return (
                    <div key={exp.exportId} className={styles.exportGroup}>
                       <div className={styles.exportHeader}>
                         <button
                           className={styles.exportToggle}
                           onClick={() => toggleExport(flow.flowId, exp.exportId)}
                           aria-expanded={expanded}
                           aria-label={`${expanded ? 'Collapse' : 'Expand'} Export #${exp.exportNumber}, ${exp.slideCount} ${exp.slideCount === 1 ? 'slide' : 'slides'}`}
                         >
                           <span className={styles.toggleIcon}>{expanded ? '▾' : '▸'}</span>
                           <span className={styles.exportName}>Export #{exp.exportNumber}</span>
                           <span className={styles.exportMeta}>
                             {exp.slideCount} {exp.slideCount === 1 ? 'slide' : 'slides'}
                             {exp.createdAt ? ` · ${new Date(exp.createdAt).toLocaleDateString()}` : ''}
                           </span>
                         </button>
                         <button
                           className={styles.deleteExportBtn}
                           onClick={(e) => {
                             e.stopPropagation()
                             handleDeleteExport(flow.flowId, exp.exportId)
                           }}
                           title="Delete export"
                           aria-label="Delete export"
                         >×</button>
                       </div>

                      {expanded && (
                        <div className={styles.slideList}>
                          {loading ? (
                            <>
                              <div className={styles.skeleton} />
                              <div className={styles.skeleton} />
                              <div className={styles.skeleton} />
                            </>
                          ) : !exp.slides ? (
                            <div className={styles.slidePlaceholder}>—</div>
                          ) : exp.slides.length === 0 ? (
                            <div className={styles.slidePlaceholder}>No slides</div>
                          ) : exp.slides.map(slide => {
                            const slideKey = `${flow.flowId}::${exp.exportId}::${slide.file}`
                            const isActive  = selectedKey === slideKey
                            const isChecked = checkedSlides.has(slideKey)
                            const isDirtyS  = !!dirtySlides[slideKey]
                            return (
                              <div
                                key={slide.file}
                                ref={el => { if (el) slideRowRefs.current[slideKey] = el; else delete slideRowRefs.current[slideKey] }}
                                className={`${styles.slideRow}${isActive ? ` ${styles.slideRowActive}` : ''}`}
                              >
                                <label className={styles.checkWrap}>
                                  <input
                                    type="checkbox"
                                    className={styles.slideCheck}
                                    checked={isChecked}
                                    onChange={(e) => toggleSlideCheck(slideKey, e)}
                                    aria-label={`Select ${slide.title || slide.file}`}
                                  />
                                </label>
                                <button
                                  className={styles.slideOpenBtn}
                                  onClick={() => openSlide(flow.flowId, exp.exportId, slide.file)}
                                  title="Open slide"
                                >▷</button>
                                <input
                                  key={slide.title || slide.file}
                                  type="text"
                                  className={`${styles.slideTitleInput}${isActive ? ` ${styles.slideTitleInputActive}` : ''}`}
                                  defaultValue={slide.title || slide.file}
                                  onBlur={async (e) => {
                                    const newTitle = e.target.value.trim()
                                    const original = slide.title || slide.file
                                    if (!newTitle || newTitle === original) return
                                    setFlows(prev => prev.map(f =>
                                      f.flowId !== flow.flowId ? f : {
                                        ...f,
                                        exports: f.exports.map(ex =>
                                          ex.exportId !== exp.exportId ? ex : {
                                            ...ex,
                                            slides: ex.slides.map(s =>
                                              s.file === slide.file ? { ...s, title: newTitle } : s
                                            ),
                                          }
                                        ),
                                      }
                                    ))
                                    try {
                                      await fetch(
                                        `/api/projects/${projectName}/flows/${flow.flowId}/exports/${exp.exportId}/slides/${encodeURIComponent(slide.file)}/title`,
                                        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle }) }
                                      )
                                    } catch {}
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.target.blur()
                                    if (e.key === 'Escape') {
                                      e.target.value = slide.title || slide.file
                                      e.target.blur()
                                    }
                                  }}
                                />
                                 {isDirtyS && (
                                   <span
                                     className={styles.slideDot}
                                     role="img"
                                     aria-label="Unsaved changes"
                                     title="Unsaved changes"
                                   >●</span>
                                 )}
                                 <button
                                   className={styles.deleteSlideBtn}
                                   onClick={(e) => {
                                     e.stopPropagation()
                                     handleDeleteSlide(flow.flowId, exp.exportId, slide.file)
                                   }}
                                   title="Delete slide"
                                   aria-label="Delete slide"
                                 >×</button>
                               </div>
                             )
                           })}
                         </div>
                       )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {checkedSlides.size > 0 && (
            <div className={styles.treeFooter}>
              <span className={styles.selCount}>
                {checkedSlides.size} slide{checkedSlides.size !== 1 ? 's' : ''} selected
              </span>
              <button className={styles.forkBtn} onClick={handleFork} disabled={forking}>
                {forking ? 'Creating…' : '+ New Export'}
              </button>
            </div>
          )}
        </div>

        {/* Editor + Preview */}
        <div className={styles.splitArea} ref={splitContainerRef}>

          <div className={styles.editorPane} style={{ width: `${splitPct}%` }}>
            <div className={styles.paneLabel}>HTML source</div>
            {!selectedKey && !loadingSlide && <div className={styles.paneEmpty}>Select a slide to edit</div>}
            {loadingSlide && <div className={styles.paneEmpty}>Loading…</div>}
            <div
              ref={editorHostRef}
              className={styles.cmHost}
              style={{ visibility: selectedKey && !loadingSlide ? 'visible' : 'hidden' }}
            />
          </div>

          <div className={styles.divider} onMouseDown={onDividerMouseDown}>
            <div className={styles.dividerHandle} />
          </div>

          <div className={styles.previewPane} style={{ width: `${100 - splitPct}%` }}>
            <div className={styles.paneLabel}>Preview · click to edit text</div>
            <div className={styles.previewWrapper} ref={previewWrapperRef}>
              <iframe
                ref={iframeRef}
                className={styles.previewFrame}
                srcDoc={previewSrcDoc}
                title="Slide preview"
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
