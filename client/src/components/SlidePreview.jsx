const SLIDE_WIDTH  = 10      // inches
const SLIDE_HEIGHT = 5.625  // inches

/**
 * Renders a faithful proportional preview of a single slide.
 * Used in both the Tag step (full size) and the Preview step (thumbnails).
 *
 * size: 'normal' | 'small'
 */
export default function SlidePreview({ slide, size = 'normal' }) {
  const { elements, background } = slide

  if (!elements || elements.length === 0) {
    return <div className="preview-empty">{size === 'small' ? '—' : 'No elements'}</div>
  }

  // cqw-based font sizing: fontPt / 7.2 gives the correct proportional size
  // at any canvas width (1cqw = 0.1" = 7.2pt of slide width).
  // Thumbnails halve it so text doesn't bleed into neighbours.
  const fontScale = size === 'small' ? 14.4 : 7.2

  return (
    <div className="slide-preview-canvas" style={{ background: background || '#ffffff' }}>
      {elements.map((el, idx) => {
        const left   = (el.bounds.x / SLIDE_WIDTH)  * 100
        const top    = (el.bounds.y / SLIDE_HEIGHT) * 100
        const width  = (el.bounds.w / SLIDE_WIDTH)  * 100
        const height = (el.bounds.h / SLIDE_HEIGHT) * 100

        const posStyle = {
          position: 'absolute',
          left:     `${left}%`,
          top:      `${top}%`,
          width:    `${width}%`,
          height:   `${height}%`,
          overflow: 'hidden'
        }

        if (el.type === 'rect') {
          const borderShadow = el.shapeBorder
            ? `inset 0 0 0 ${Math.max(1, Math.round(el.shapeBorder.widthPt * 0.8))}px ${el.shapeBorder.color}`
            : undefined
          return (
            <div key={idx} style={{
              ...posStyle,
              backgroundColor: el.shapeFill || 'transparent',
              boxShadow: borderShadow
            }} />
          )
        }

        const vAlign =
          el.verticalAlign === 't' ? 'flex-start' :
          el.verticalAlign === 'b' ? 'flex-end'   : 'center'

        const hAlign =
          el.textAlign === 'ctr' || el.textAlign === 'center' ? 'center' :
          el.textAlign === 'r'   || el.textAlign === 'right'  ? 'flex-end' : 'flex-start'

        const borderShadow = el.shapeBorder
          ? `inset 0 0 0 ${Math.max(1, Math.round(el.shapeBorder.widthPt * 0.8))}px ${el.shapeBorder.color}`
          : undefined

        return (
          <div key={idx} title={el.shapeName} style={{
            ...posStyle,
            padding:         size === 'small' ? '1px' : '3px',
            fontSize:        `${(el.fontSize || 12) / fontScale}cqw`,
            fontWeight:      el.fontBold      ? 'bold'      : 'normal',
            fontStyle:       el.fontItalic    ? 'italic'    : 'normal',
            textDecoration:  el.fontUnderline ? 'underline' : 'none',
            fontFamily:      el.fontFamily    ? `"${el.fontFamily}", sans-serif` : 'inherit',
            color:           el.fontColor     || '#333333',
            backgroundColor: el.shapeFill    || 'transparent',
            boxShadow:       borderShadow,
            display:         'flex',
            alignItems:      vAlign,
            justifyContent:  hAlign,
            wordBreak:       'break-word',
            lineHeight:      1.2,
            textAlign:       el.textAlign === 'ctr' ? 'center' : el.textAlign === 'r' ? 'right' : 'left',
            whiteSpace:      'pre-wrap'
          }}>
            {el.text}
          </div>
        )
      })}
    </div>
  )
}
