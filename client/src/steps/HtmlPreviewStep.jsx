/**
 * HtmlPreviewStep — Stage 3 of the HTML Visual Flow.
 *
 * Shows a live preview of the patched HTML output with inline text editing.
 * Users can click on text elements to edit them directly in the preview.
 */

import { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import AppHeader   from '../components/AppHeader.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'

export default function HtmlPreviewStep({
   projectName,
   applied,      // { outputFile, previewHtml, roundId, slideCount }
   flowId,
   step,
   canNavigateTo,
   navigateTo,
   onBack,
   onNext,
   onPreviewHtmlChange,
   setToast,
   debugContext,
   repeatableSlides = [],
 }) {
   const { previewHtml, slideCount = 1, roundId } = applied
  const isMultiSlide = slideCount > 1

   // Local copy of the preview HTML — initialized from prop, updated after each backend save.
   // We intentionally do NOT sync srcDoc back from the prop on every render so that inline
   // edits (contentEditable inside the iframe) are never erased by a React re-render.
   // When a new apply round arrives (roundId changes) we do reset to the fresh HTML.
   const [srcDoc, setSrcDoc] = useState(previewHtml)
   const prevRoundRef = useRef(roundId)
   useEffect(() => {
     if (roundId !== prevRoundRef.current) {
       setSrcDoc(previewHtml)
       prevRoundRef.current = roundId
     }
   }, [roundId, previewHtml])



  // ── Slide navigation (multi-slide only) ──────────────────────────────────
   const [currentSlide, setCurrentSlide] = useState(1)

   const goToSlide = useCallback((index) => {
     setCurrentSlide(Math.max(1, Math.min(index, slideCount)))
   }, [slideCount])

  // ── Inline text editing state ────────────────────────────────────────────
  const iframeRef = useRef(null)
  const editDebounceRef = useRef(null)

    // Handle postMessage events from the iframe
    useEffect(() => {
      const handleMessage = (event) => {
        // srcDoc iframes have origin 'null', allow that or same-origin
        if (event.origin !== window.location.origin && event.origin !== 'null') return
        if (event.data.type !== 'solon-edit') return

       const { selector, newText } = event.data
       if (!selector || newText === undefined) return

       // Debounce backend save
       // NOTE: Do NOT update previewHtml in React state — the iframe already shows
       // the correct text (user just typed it). Re-setting srcDoc would re-render
       // and lose the edit.
       if (editDebounceRef.current) clearTimeout(editDebounceRef.current)
       editDebounceRef.current = setTimeout(() => {
         savePatchedHtmlToBackend(selector, newText)
       }, 800)
     }

     window.addEventListener('message', handleMessage)
     return () => window.removeEventListener('message', handleMessage)
   }, [])

   const savePatchedHtmlToBackend = async (selector, newText) => {
     try {
       const response = await fetch('/api/html-flow/update-preview-html', {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           projectName,
           flowId,
           roundId,
           selector,
           newText,
         }),
       })
       if (!response.ok) {
         const errBody = await response.text().catch(() => '')
         console.error('[HtmlPreviewStep] Failed to save edited HTML:', response.status, errBody)
         return
       }
       const data = await response.json()
       if (data.previewHtml) {
         // Update App-level state so navigating away and back shows the edited HTML.
         // Do NOT update srcDoc — the iframe already has the correct content.
         onPreviewHtmlChange?.(data.previewHtml)
       }
     } catch (err) {
       console.error('[HtmlPreviewStep] Error saving edited HTML:', err)
     }
   }

   // Extract and show only the current slide
  const getSingleSlideHtml = useCallback(() => {
    if (!srcDoc) return ''

    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(srcDoc, 'text/html')

      // Find slides: try section first, then .slide divs
      let slides = Array.from(doc.querySelectorAll('section'))
      if (slides.length === 0) {
        slides = Array.from(doc.querySelectorAll('.slide'))
      }

      // If still no slides found, try nested divs in shell
      if (slides.length === 0) {
        const shell = doc.querySelector('#solon-slide-shell')
        if (shell) {
          slides = Array.from(shell.children).filter(el => el.tagName === 'SECTION' || el.classList.contains('slide'))
        }
      }

      if (slides.length === 0) {
        console.warn('[HtmlPreviewStep] No slide containers found, returning full preview')
        return srcDoc
      }

      // Extract the current slide
      const slideIdx = Math.max(0, Math.min(currentSlide - 1, slides.length - 1))
      const currentSlide_el = slides[slideIdx]
      if (!currentSlide_el) {
        console.warn('[HtmlPreviewStep] Could not get slide at index', slideIdx)
        return srcDoc
      }

      // Preserve head content for all original styles
      const head = doc.querySelector('head')
      const headContent = head ? head.innerHTML : ''

      return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
${headContent}
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
  }
</style>
</head>
<body>
${currentSlide_el.outerHTML}
</body>
</html>`
    } catch (e) {
      console.error('[HtmlPreviewStep] Error extracting slide:', e)
      return srcDoc
    }
  }, [srcDoc, currentSlide])

  // Inject editing script into iframe after it loads
   const handleIframeLoad = useCallback(() => {
     const iframe = iframeRef.current
     if (!iframe?.contentDocument) return

     const doc = iframe.contentDocument
     const script = doc.createElement('script')
     script.textContent = `
       (function() {
         // Build a CSS selector path to uniquely identify an element.
         // Stop at <section> (or an element with an id) to avoid including
         // the solon-slide-shell wrapper that exists in the preview but not
         // in the raw output file on disk.
         function getSelectorPath(el) {
           const parts = []
           let node = el
           while (node && node !== document.body) {
             let selector = node.tagName.toLowerCase()
             if (node.id) {
               selector += '#' + node.id
               parts.unshift(selector)
               break
             }
             const siblings = Array.from(node.parentNode?.children || []).filter(s => s.tagName === node.tagName)
             if (siblings.length > 1) {
               const idx = siblings.indexOf(node) + 1
               selector += ':nth-of-type(' + idx + ')'
             }
             parts.unshift(selector)
             if (selector.startsWith('section')) break
             node = node.parentNode
           }
           return parts.join(' > ')
         }

         // Find all text-containing leaf elements
         function isEditableElement(el) {
           if (!el) return false
           const tag = el.tagName?.toLowerCase()
           // Structural containers — not editable
           if (['html', 'body', 'section', 'div', 'main', 'article', 'aside', 'nav', 'header', 'footer'].includes(tag)) {
             // Only editable if it has direct text nodes
             for (const node of el.childNodes) {
               if (node.nodeType === 3 && node.textContent.trim()) return true
             }
             return false
           }
           // Text-bearing elements — editable
           if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'li', 'td', 'th'].includes(tag)) {
             return true
           }
           return false
         }

         function makeEditable(el) {
           if (!isEditableElement(el)) return

           // Add hover highlight
           el.addEventListener('mouseenter', () => {
             el.style.outline = '2px solid rgba(59, 130, 246, 0.5)'
             el.style.outlineOffset = '2px'
             el.style.cursor = 'text'
             el.style.backgroundColor = 'rgba(59, 130, 246, 0.05)'
           })

           el.addEventListener('mouseleave', () => {
             if (el.contentEditable !== 'true') {
               el.style.outline = 'none'
               el.style.backgroundColor = ''
             }
           })

           el.addEventListener('click', (e) => {
             e.stopPropagation()
             el.contentEditable = 'true'
             el.focus()
             // Select all text
             const range = document.createRange()
             range.selectNodeContents(el)
             const sel = window.getSelection()
             sel.removeAllRanges()
             sel.addRange(range)
           })

           el.addEventListener('blur', () => {
             el.contentEditable = 'false'
             el.style.outline = 'none'
             el.style.backgroundColor = ''

             // Send selector path + plain text only (no HTML)
             const selector = getSelectorPath(el)
             const newText = el.innerText
             window.parent.postMessage({ type: 'solon-edit', selector, newText }, '*')
           })

           el.addEventListener('keydown', (e) => {
             if (e.key === 'Enter' && !e.shiftKey) {
               e.preventDefault()
               el.blur()
             }
           })
         }

         // Make all editable elements interactive
         document.querySelectorAll('*').forEach(el => {
           makeEditable(el)
         })
       })()
     `
     doc.head.appendChild(script)
   }, [])



  return (
    <div className="app">
      <AppHeader
        title={projectName}
        subtitle="Content applied — review and download"
        debugContext={debugContext}
      />
      <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} flow="html" />

      <div className="html-preview-step-layout">
         {/* ── Preview ─────────────────────────────────────────────── */}
          <div style={{
            width: '100%',
            height: 'auto',
            minHeight: '400px',
            paddingBottom: '56.25%',
            position: 'relative',
            overflow: 'hidden',
            background: '#f5f5f5',
            marginBottom: '24px',
          }}>
            <iframe
              ref={iframeRef}
              className="html-preview-step-frame"
              srcDoc={getSingleSlideHtml()}
              title="Output preview"
              sandbox="allow-same-origin allow-scripts"
              onLoad={handleIframeLoad}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
              }}
            />
          </div>

        {/* ── Slide navigation (multi-slide only) ─────────────────── */}
        {isMultiSlide && (
          <div className="html-preview-step-nav" data-testid="preview-nav">
            <button
              className="btn btn-secondary html-preview-step-nav-btn"
              onClick={() => goToSlide(currentSlide - 1)}
              disabled={currentSlide <= 1}
              aria-label="Previous slide"
              data-testid="preview-nav-prev"
            >
              <span aria-hidden="true">←</span>
            </button>
            <span className="html-preview-step-nav-counter" data-testid="preview-nav-counter">
              {currentSlide} / {slideCount}
            </span>
            <button
              className="btn btn-secondary html-preview-step-nav-btn"
              onClick={() => goToSlide(currentSlide + 1)}
              disabled={currentSlide >= slideCount}
              aria-label="Next slide"
              data-testid="preview-nav-next"
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────────────── */}
         <div className="html-preview-step-actions">
           <button className="btn btn-link" onClick={onBack}>
             <span aria-hidden="true">←</span> Back to recipe
           </button>
           <button className="btn btn-primary" onClick={onNext}>
             <span aria-hidden="true">→</span> Next
           </button>
          </div>
       </div>
     </div>
   )
}
