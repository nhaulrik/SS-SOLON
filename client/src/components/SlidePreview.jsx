/**
 * Renders a faithful proportional preview of a single slide.
 * Bounds from the parser are already normalized to [0,1] fractions
 * of the slide dimensions, so we multiply by 100 for percentages.
 *
 * Structure:
 *   .slide-preview-canvas   — sets aspect-ratio + container-type (width query)
 *     .slide-preview-stage  — position:relative, 100%×100%, clips children
 *       <elements>          — position:absolute, % coords
 */
/**
 * overlay — optional React node rendered on top of the stage (e.g. click targets in TagStep)
 */
export default function SlidePreview({ slide, size = 'normal', overlay = null }) {
  const { elements, background, width: slideW, height: slideH } = slide

  if (!elements || elements.length === 0) {
    return <div className="preview-empty">{size === 'small' ? '—' : 'No elements'}</div>
  }

  // Use actual slide aspect ratio (inches). Defaults to 16:9 widescreen.
  const aspectW = slideW || 10
  const aspectH = slideH || 5.625

  // Font scaling: cqw units relative to container width.
  // A slide that is W inches wide at 72pt/in has W*72 points across.
  // container width = 100cqw, so 1pt = 100/(W*72) cqw.
  const ptToCqw = 100 / (aspectW * 72)

  return (
    <div
      className="slide-preview-canvas"
      style={{ aspectRatio: `${aspectW} / ${aspectH}` }}
    >
      {/* Stage: fills the canvas, clips overflowing elements, provides % coordinate space */}
      <div
        className="slide-preview-stage"
        style={{ background: background || '#ffffff' }}
      >
        {elements.map((el, idx) => {
          // Bounds are already 0–1 fractions; convert to percentages
          const left   = el.bounds.x * 100
          const top    = el.bounds.y * 100
          const width  = el.bounds.w * 100
          const height = el.bounds.h * 100

          const posStyle = {
            position:  'absolute',
            left:      `${left}%`,
            top:       `${top}%`,
            width:     `${width}%`,
            height:    `${height}%`,
            overflow:  'hidden',
            boxSizing: 'border-box',
          }

          // ── Image placeholder ────────────────────────────────────────
          if (el.type === 'image') {
            return (
              <div key={idx} style={{
                ...posStyle,
                background:      el.shapeFill || '#d0d0d0',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
              }}>
                <svg viewBox="0 0 24 24" width="40%" height="40%" fill="none" stroke="#aaa" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </div>
            )
          }

          // ── Rect (no text) ───────────────────────────────────────────
          if (el.type === 'rect') {
            const borderStyle = el.shapeBorder
              ? `${Math.max(1, el.shapeBorder.widthPt * 0.5)}px solid ${el.shapeBorder.color}`
              : undefined
            return (
              <div key={idx} style={{
                ...posStyle,
                background: el.shapeGradient || el.shapeFill || 'transparent',
                border:     borderStyle,
                boxSizing:  'border-box',
              }} />
            )
          }

          // ── Chart ────────────────────────────────────────────────────
          if (el.type === 'chart') {
            const { chartData } = el
            const cats    = chartData?.categories || []
            const vals    = chartData?.values     || []
            const maxVal  = vals.length > 0 ? Math.max(...vals) : 1
            const colors  = ['#4472C4','#ED7D31','#A9D18E','#FFC000','#5B9BD5','#70AD47']

            return (
              <div key={idx} style={{
                ...posStyle,
                backgroundColor: '#fafafa',
                border:          '1px solid #ddd',
                display:         'flex',
                flexDirection:   'column',
                padding:         '3% 3% 4% 3%',
                gap:             '4%',
              }}>
                {chartData?.title && (
                  <div style={{
                    fontSize:     `${11 * ptToCqw}cqw`,
                    fontWeight:   'bold',
                    color:        '#333',
                    textAlign:    'center',
                    flexShrink:   0,
                    lineHeight:   1.2,
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                  }}>
                    {chartData.title}
                  </div>
                )}

                {cats.length > 0 ? (
                  <div style={{
                    flex:        1,
                    display:     'flex',
                    alignItems:  'flex-end',
                    gap:         `${Math.max(1, Math.floor(60 / cats.length))}%`,
                    overflow:    'hidden',
                  }}>
                    {cats.slice(0, 8).map((cat, i) => {
                      const barH = maxVal > 0 ? ((vals[i] || 0) / maxVal) * 100 : 30
                      return (
                        <div key={i} style={{
                          flex:           1,
                          display:        'flex',
                          flexDirection:  'column',
                          alignItems:     'center',
                          height:         '100%',
                          justifyContent: 'flex-end',
                          overflow:       'hidden',
                        }}>
                          <div style={{
                            width:           '100%',
                            height:          `${barH}%`,
                            backgroundColor: colors[i % colors.length],
                            borderRadius:    '1px 1px 0 0',
                            minHeight:       '2px',
                          }} />
                          <div style={{
                            fontSize:     `${7 * ptToCqw}cqw`,
                            color:        '#555',
                            textAlign:    'center',
                            marginTop:    '2px',
                            overflow:     'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace:   'nowrap',
                            width:        '100%',
                          }}>
                            {cat}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{
                    flex:           1,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    color:          '#aaa',
                    fontSize:       `${9 * ptToCqw}cqw`,
                  }}>
                    Chart
                  </div>
                )}
              </div>
            )
          }

          // ── Text element ─────────────────────────────────────────────
          const vAlign =
            el.verticalAlign === 't' ? 'flex-start' :
            el.verticalAlign === 'b' ? 'flex-end'   : 'center'

          const hAlign =
            el.textAlign === 'ctr' || el.textAlign === 'center' ? 'center'   :
            el.textAlign === 'r'   || el.textAlign === 'right'  ? 'flex-end' : 'flex-start'

          const textAlignCss =
            el.textAlign === 'ctr' || el.textAlign === 'center' ? 'center' :
            el.textAlign === 'r'   || el.textAlign === 'right'  ? 'right'  : 'left'

          const borderStyle = el.shapeBorder
            ? `${Math.max(1, el.shapeBorder.widthPt * 0.5)}px solid ${el.shapeBorder.color}`
            : undefined

          const fs = el.fontSize || 12

          return (
            <div key={idx} title={el.shapeName} style={{
              ...posStyle,
              padding:        size === 'small' ? '0.5%' : '1%',
              fontSize:       `${fs * ptToCqw}cqw`,
              fontWeight:     el.fontBold      ? 'bold'   : 'normal',
              fontStyle:      el.fontItalic    ? 'italic' : 'normal',
              textDecoration: el.fontUnderline ? 'underline' : 'none',
              fontFamily:     el.fontFamily    ? `"${el.fontFamily}", sans-serif` : 'inherit',
              color:          el.fontColor     || '#333333',
              background:     el.shapeGradient || el.shapeFill || 'transparent',
              border:         borderStyle,
              display:        'flex',
              alignItems:     vAlign,
              justifyContent: hAlign,
              wordBreak:      'break-word',
              lineHeight:     1.2,
              textAlign:      textAlignCss,
              whiteSpace:     'pre-wrap',
            }}>
              {el.text}
            </div>
          )
        })}
      </div>
      {/* Overlay sits on top of the stage, same coordinate space (position:absolute) */}
      {overlay}
    </div>
  )
}
