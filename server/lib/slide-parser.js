const EMU_PER_INCH = 914400;

// Full Office theme colour palette — used for background and element colour resolution.
const SCHEME_COLORS = {
  dk1: '#000000', dk2: '#44546A',
  lt1: '#FFFFFF', lt2: '#E7E6E6',
  accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A9D18E',
  accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47',
  tx1: '#000000', tx2: '#44546A',
  bg1: '#FFFFFF', bg2: '#E7E6E6',
  hlink: '#0563C1', folHlink: '#954F72'
};

// Slide number helpers — also used by pptx-builder.
export const slideNumFrom = (entry) => parseInt(entry.entryName.match(/slide(\d+)\.xml/)[1]);
export const slideNumComparator = (a, b) => slideNumFrom(a) - slideNumFrom(b);

export function getPresetColor(name) {
  const colors = {
    white: '#FFFFFF', black: '#000000', red: '#FF0000', green: '#00FF00',
    blue: '#0000FF', yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF',
    gray: '#808080'
  };
  return colors[name] || '#FFFFFF';
}

export function parseSlides(zip) {
  const slides = [];
  const slideEntries = zip.getEntries().filter(e => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/));
  for (const entry of slideEntries.sort(slideNumComparator)) {
    const content = entry.getData().toString('utf8');
    slides.push(extractSlideElements(content, slideNumFrom(entry)));
  }
  return slides;
}

export function extractSlideElements(xml, slideIndex) {
  if (!xml) return { index: slideIndex, elements: [], background: '#ffffff' };

  const slide = { index: slideIndex, elements: [], background: '#ffffff' };

  const bgMatch = xml.match(/<p:bg>([\s\S]*?)<\/p:bg>/);
  if (bgMatch) {
    const srgbMatch = bgMatch[1].match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
    if (srgbMatch) {
      slide.background = '#' + srgbMatch[1];
    } else {
      const schemeMatch = bgMatch[1].match(/<a:schemeClr val="([^"]+)"/);
      if (schemeMatch) {
        slide.background = SCHEME_COLORS[schemeMatch[1]] || '#FFFFFF';
      } else {
        const prstMatch = bgMatch[1].match(/<a:prstClr val="(\w+)"/);
        if (prstMatch) slide.background = getPresetColor(prstMatch[1]);
      }
    }
  }

  const spTreeMatch = xml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/);
  const shapesToCheck = spTreeMatch ? spTreeMatch[1] : xml;
  const shapeMatches = shapesToCheck.match(/<p:sp>([\s\S]*?)<\/p:sp>/g) || [];

  const resolveColor = (xmlFragment) => {
    const srgb = xmlFragment.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
    if (srgb) return '#' + srgb[1];
    const scheme = xmlFragment.match(/<a:schemeClr val="([^"]+)"/);
    if (scheme) return SCHEME_COLORS[scheme[1]] || '#333333';
    return null;
  };

  for (let i = 0; i < shapeMatches.length; i++) {
    const shapeXml = shapeMatches[i];

    // --- Bounds ---
    let bounds = { x: 0.5, y: 0.5, w: 2, h: 0.5 };
    let xfrmContent = '';

    const xfrmMatch = shapeXml.match(/<p:xfrm>([\s\S]*?)<\/p:xfrm>/);
    if (xfrmMatch) xfrmContent = xfrmMatch[1];

    if (!xfrmContent) {
      const spPrMatch = shapeXml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/);
      if (spPrMatch) {
        const axfrmMatch = spPrMatch[1].match(/<a:xfrm>([\s\S]*?)<\/a:xfrm>/);
        if (axfrmMatch) xfrmContent = axfrmMatch[1];
      }
    }

    if (xfrmContent) {
      const offMatch = xfrmContent.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
      const extMatch = xfrmContent.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
      if (offMatch && extMatch) {
        bounds = {
          x: parseInt(offMatch[1]) / EMU_PER_INCH,
          y: parseInt(offMatch[2]) / EMU_PER_INCH,
          w: Math.max(0.1, parseInt(extMatch[1]) / EMU_PER_INCH),
          h: Math.max(0.1, parseInt(extMatch[2]) / EMU_PER_INCH)
        };
      }
    }

    // --- Shape fill and border ---
    let shapeFill = null;
    let shapeBorder = null;
    const spPrMatch2 = shapeXml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/);
    if (spPrMatch2) {
      const spPr = spPrMatch2[1];
      const solidFillMatch = spPr.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
      if (solidFillMatch) {
        shapeFill = resolveColor(solidFillMatch[1]);
      } else {
        const gradStopMatch = spPr.match(/<a:gs\s+pos="\d+">([\s\S]*?)<\/a:gs>/);
        if (gradStopMatch) shapeFill = resolveColor(gradStopMatch[1]);
      }
      const lnMatch = spPr.match(/<a:ln\b([^>]*)>([\s\S]*?)<\/a:ln>/);
      if (lnMatch) {
        const wMatch = lnMatch[1].match(/\bw="(\d+)"/);
        const lnWidthPt = wMatch ? parseInt(wMatch[1]) / 12700 : 1;
        const lnSolidMatch = lnMatch[2].match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
        if (lnSolidMatch) {
          const lnColor = resolveColor(lnSolidMatch[1]);
          if (lnColor) shapeBorder = { color: lnColor, widthPt: lnWidthPt };
        }
      }
    }

    // --- Text content ---
    const textMatches = shapeXml.match(/<a:t>([^<]*)<\/a:t>/g);
    const textContent = textMatches
      ? textMatches.map(t => t.replace(/<[^>]+>/g, '')).join(' ')
      : '';
    const hasText = textContent.trim().length > 0;

    if (!hasText) {
      if (!shapeFill && !shapeBorder) continue;
      slide.elements.push({ type: 'rect', id: `slide${slideIndex}-rect${i}`, bounds, shapeFill, shapeBorder });
      continue;
    }

    // --- Text shape properties ---
    let shapeName = `text_${i}`;
    const cNvPrMatch = shapeXml.match(/<p:cNvPr\s+id="\d+"\s+name="([^"]+)"/);
    if (cNvPrMatch) shapeName = cNvPrMatch[1];

    let fontSize = 14;
    let fontBold = false;
    let fontItalic = false;
    let fontUnderline = false;
    let fontFamily = null;
    let fontColor = '#333333';
    let textAlign = 'left';
    let verticalAlign = 'ctr';

    const txBodyMatch = shapeXml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/);
    if (txBodyMatch && txBodyMatch[1]) {
      const txBody = txBodyMatch[1];

      const bodyPrMatch = txBody.match(/<a:bodyPr([^>]*)/);
      if (bodyPrMatch) {
        const anchorMatch = bodyPrMatch[1].match(/anchor="(\w+)"/);
        if (anchorMatch) verticalAlign = anchorMatch[1];
      }

      const pPrMatch = txBody.match(/<a:pPr([^>]*)/);
      if (pPrMatch) {
        const algnMatch = pPrMatch[1].match(/algn="(\w+)"/);
        if (algnMatch) textAlign = algnMatch[1];
      }

      const rPrMatch = txBody.match(/<a:rPr([^/]*?)(?:\/>|>([\s\S]*?)<\/a:rPr>)/);
      if (rPrMatch) {
        const attrs = rPrMatch[1];
        const inner = rPrMatch[2] || '';
        const szMatch = attrs.match(/sz="(\d+)"/);
        if (szMatch) fontSize = parseInt(szMatch[1]) / 100;
        if (attrs.includes('b="1"') || attrs.includes('b="true"')) fontBold = true;
        if (attrs.includes('i="1"') || attrs.includes('i="true"')) fontItalic = true;
        const uAttr = attrs.match(/\bu="([^"]+)"/);
        if (uAttr && uAttr[1] !== 'none') fontUnderline = true;
        const latinMatch = inner.match(/<a:latin typeface="([^"]+)"/);
        if (latinMatch && !latinMatch[1].startsWith('+')) fontFamily = latinMatch[1];
        const clr = resolveColor(inner);
        if (clr) fontColor = clr;
      }

      if (fontColor === '#333333') {
        const defRPrMatch = txBody.match(/<a:defRPr([^/]*?)(?:\/>|>([\s\S]*?)<\/a:defRPr>)/);
        if (defRPrMatch) {
          const inner = defRPrMatch[2] || '';
          if (!fontFamily) {
            const latinMatch = inner.match(/<a:latin typeface="([^"]+)"/);
            if (latinMatch && !latinMatch[1].startsWith('+')) fontFamily = latinMatch[1];
          }
          const clr = resolveColor(inner);
          if (clr) fontColor = clr;
        }
      }
    }

    const avgCharWidth  = (fontSize || 12) * 0.55;
    const lineHeight    = (fontSize || 12) * 1.2;
    const pointsPerInch = 72;
    const charsPerLine  = Math.max(1, Math.floor((bounds?.w || 1) * pointsPerInch / avgCharWidth));
    const lines         = Math.max(1, Math.floor((bounds?.h || 0.1) * pointsPerInch / lineHeight));
    const maxChars      = charsPerLine * lines;

    slide.elements.push({
      type: 'text',
      id: `slide${slideIndex}-elem${i}`,
      shapeName,
      text: textContent,
      bounds,
      fontSize,
      fontBold,
      fontItalic,
      fontUnderline,
      fontFamily,
      fontColor,
      textAlign,
      verticalAlign,
      shapeFill,
      shapeBorder,
      maxChars
    });
  }

  return slide;
}
