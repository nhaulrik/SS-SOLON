import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function debugLog(msg) {
  const logPath = path.join(__dirname, '..', 'debug-parser.log');
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
}

const EMU_PER_INCH = 914400;

const SCHEME_COLORS = {
  dk1: '#000000', dk2: '#44546A',
  lt1: '#FFFFFF', lt2: '#E7E6E6',
  accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A9D18E',
  accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47',
  tx1: '#000000', tx2: '#44546A',
  bg1: '#FFFFFF', bg2: '#E7E6E6',
  hlink: '#0563C1', folHlink: '#954F72'
};

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
  
  let slideWidth = 10 * EMU_PER_INCH;
  let slideHeight = 5.625 * EMU_PER_INCH;
  
  const contentTypesEntry = zip.getEntry('[Content_Types].xml');
  if (contentTypesEntry) {
    const contentTypesXml = contentTypesEntry.getData().toString('utf8');
    const sldSzMatch = contentTypesXml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
    if (sldSzMatch) {
      slideWidth = parseInt(sldSzMatch[1]);
      slideHeight = parseInt(sldSzMatch[2]);
    }
  }
  
  const presEntry = zip.getEntry('ppt/presentation.xml');
  if (presEntry) {
    const presXml = presEntry.getData().toString('utf8');
    const sldSzPresMatch = presXml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
    if (sldSzPresMatch) {
      const presWidth = parseInt(sldSzPresMatch[1]);
      const presHeight = parseInt(sldSzPresMatch[2]);
      if (presWidth !== slideWidth || presHeight !== slideHeight) {
        slideWidth = presWidth;
        slideHeight = presHeight;
      }
    }
  }
  
  const firstSlideEntry = zip.getEntry('ppt/slides/slide1.xml');
  if (firstSlideEntry) {
    const slideXml = firstSlideEntry.getData().toString('utf8');
    const slideSldSzMatch = slideXml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
    if (slideSldSzMatch) {
      const sldWidth = parseInt(slideSldSzMatch[1]);
      const sldHeight = parseInt(slideSldSzMatch[2]);
      if (sldWidth > 0 && sldHeight > 0) {
        slideWidth = sldWidth;
        slideHeight = sldHeight;
      }
    }
  }
  
  debugLog(`parseSlides: final dimensions ${slideWidth/EMU_PER_INCH}" x ${slideHeight/EMU_PER_INCH}"`);
  
  for (const entry of slideEntries.sort(slideNumComparator)) {
    const content = entry.getData().toString('utf8');
    const parsed = extractSlideElements(content, slideNumFrom(entry), slideWidth, slideHeight, zip);
    parsed.width = slideWidth / EMU_PER_INCH;
    parsed.height = slideHeight / EMU_PER_INCH;
    slides.push(parsed);
  }
  return slides;
}

function extractChartData(zip, chartRId, slideIndex) {
  const chartData = { categories: [], series: [] };
  
  // Resolve the chart file via the slide's relationship file
  let chartEntry = null;
  if (chartRId && slideIndex) {
    const relsPath = `ppt/slides/_rels/slide${slideIndex}.xml.rels`;
    const relsEntry = zip.getEntry(relsPath);
    if (relsEntry) {
      const relsXml = relsEntry.getData().toString('utf8');
      const relPattern = new RegExp(`Id="${chartRId}"[^>]*Target="([^"]+)"`);
      const relMatch = relsXml.match(relPattern);
      if (relMatch) {
        // Target is relative to ppt/slides/, resolve to ppt/charts/...
        let target = relMatch[1];
        if (target.startsWith('../')) target = 'ppt/' + target.slice(3);
        chartEntry = zip.getEntry(target);
        debugLog(`extractChartData: resolved chart rId=${chartRId} to ${target}, found=${!!chartEntry}`);
      }
    }
  }
  
  // Fallback: try chart1.xml
  if (!chartEntry) {
    chartEntry = zip.getEntry('ppt/charts/chart1.xml');
    debugLog(`extractChartData: fallback to chart1.xml, found=${!!chartEntry}`);
  }
  
  if (!chartEntry) {
    debugLog('extractChartData: no chart xml found');
    return chartData;
  }
  
  const chartXml = chartEntry.getData().toString('utf8');
  
  const titleMatch = chartXml.match(/<c:title>[\s\S]*?<c:tx>[\s\S]*?<a:t>([^<]+)<\/a:t>/);
  if (titleMatch) chartData.title = titleMatch[1];
  
  // Find category labels from cat section
  const catMatch = chartXml.match(/<c:cat>[\s\S]*?<\/c:cat>/);
  if (catMatch) {
    const strRefMatch = catMatch[0].match(/<c:strRef>[\s\S]*?<\/c:strRef>/);
    if (strRefMatch) {
      const strCacheMatch = strRefMatch[0].match(/<c:strCache>[\s\S]*?<\/c:strCache>/);
      if (strCacheMatch) {
        const ptMatches = strCacheMatch[0].match(/<c:pt[^>]*><c:v>([^<]+)<\/c:v>/g);
        if (ptMatches) {
          chartData.categories = ptMatches.map(m => m.match(/<c:v>([^<]+)<\/c:v>/)[1]);
        }
      }
    }
  }
  
  // Find values from series/val section
  const serMatch = chartXml.match(/<c:ser>[\s\S]*?<\/c:ser>/);
  if (serMatch) {
    const valMatch = serMatch[0].match(/<c:val>[\s\S]*?<\/c:val>/);
    if (valMatch) {
      const numCacheMatch = valMatch[0].match(/<c:numCache>[\s\S]*?<\/c:numCache>/);
      if (numCacheMatch) {
        const ptMatches = numCacheMatch[0].match(/<c:pt[^>]*><c:v>([^<]+)<\/c:v>/g);
        if (ptMatches) {
          chartData.values = ptMatches.map(m => parseFloat(m.match(/<c:v>([^<]+)<\/c:v>/)[1]));
        }
      }
    }
  }
  
  debugLog(`extractChartData: found ${chartData.categories.length} categories, ${chartData.values?.length || 0} values`);
  return chartData;
}

export function extractSlideElements(xml, slideIndex, slideWidth = 10 * EMU_PER_INCH, slideHeight = 5.625 * EMU_PER_INCH, zip = null) {
  debugLog(`extractSlideElements called for slide ${slideIndex}, xml length: ${xml?.length || 0}`);
  
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
      }
    }
  }

  const spTreeMatch = xml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/);
  const shapesToCheck = spTreeMatch ? spTreeMatch[1] : xml;
  const shapeMatches = shapesToCheck.match(/<p:sp>([\s\S]*?)<\/p:sp>/g) || [];
  
  debugLog(`Found ${shapeMatches.length} shapes`);
  
  // Check for chart reference anywhere
  const hasChartRef = xml.includes('<c:chart');
  debugLog(`XML contains chart reference: ${hasChartRef}`);

  const resolveColor = (xmlFragment) => {
    const srgb = xmlFragment.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
    if (srgb) return '#' + srgb[1];
    const scheme = xmlFragment.match(/<a:schemeClr val="([^"]+)"/);
    if (scheme) return SCHEME_COLORS[scheme[1]] || '#333333';
    return null;
  };

  for (let i = 0; i < shapeMatches.length; i++) {
    const shapeXml = shapeMatches[i];

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
      // Use -?\d+ to handle negative offsets (elements that bleed off-canvas)
      const offMatch = xfrmContent.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
      const extMatch = xfrmContent.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
      if (offMatch && extMatch) {
        bounds = {
          x: parseInt(offMatch[1]) / slideWidth,
          y: parseInt(offMatch[2]) / slideHeight,
          // Do NOT clamp w/h — thin bars (e.g. w=0.008) must stay thin
          w: parseInt(extMatch[1]) / slideWidth,
          h: parseInt(extMatch[2]) / slideHeight
        };
      }
    }

    let shapeFill = null;
    let shapeGradient = null; // CSS gradient string
    let shapeBorder = null;
    let hasExplicitFill = false; // true when fill is explicitly set (including noFill)
    const spPrMatch2 = shapeXml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/);
    if (spPrMatch2) {
      const spPr = spPrMatch2[1];

      // Solid fill
      const solidFillMatch = spPr.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
      if (solidFillMatch) {
        shapeFill = resolveColor(solidFillMatch[1]);
        hasExplicitFill = true;
      }

      // Gradient fill — convert to CSS linear-gradient
      if (!solidFillMatch) {
        const gradFillMatch = spPr.match(/<a:gradFill>([\s\S]*?)<\/a:gradFill>/);
        if (gradFillMatch) {
          hasExplicitFill = true;
          const gradXml = gradFillMatch[1];
          // Parse gradient stops
          const stopMatches = gradXml.match(/<a:gs[^>]*pos="(\d+)">([\s\S]*?)<\/a:gs>/g) || [];
          const stops = stopMatches.map(stop => {
            const posMatch = stop.match(/pos="(\d+)"/);
            const pct = posMatch ? parseInt(posMatch[1]) / 1000 : 0;
            // Extract color — handle both self-closing and open-tag forms
            const srgbMatch = stop.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
            const schemeMatch = stop.match(/<a:schemeClr val="([^"]+)"/);
            const alphaMatch = stop.match(/<a:alpha val="(\d+)"/);
            const alpha = alphaMatch ? parseInt(alphaMatch[1]) / 100000 : 1;
            let color = '#888888';
            if (srgbMatch) {
              color = '#' + srgbMatch[1];
            } else if (schemeMatch) {
              color = SCHEME_COLORS[schemeMatch[1]] || '#888888';
            }
            // Convert hex + alpha to rgba
            if (alpha < 1) {
              const r = parseInt(color.slice(1,3), 16);
              const g = parseInt(color.slice(3,5), 16);
              const b = parseInt(color.slice(5,7), 16);
              color = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
            }
            return `${color} ${pct.toFixed(1)}%`;
          });
          // Parse gradient angle: OOXML ang is in 60000ths of a degree.
          // OOXML ang=0 means gradient flows left-to-right (east), increases clockwise.
          // CSS angle: 90deg = left-to-right, 180deg = top-to-bottom.
          // Conversion: cssAngle = (ooxmlDeg + 90) % 360
          const linMatch = gradXml.match(/<a:lin\s+ang="(\d+)"/);
          let cssAngle = 180; // default: top to bottom
          if (linMatch) {
            const ooxmlAng = parseInt(linMatch[1]) / 60000; // degrees
            cssAngle = (ooxmlAng + 90) % 360;
          }
          if (stops.length >= 2) {
            shapeGradient = `linear-gradient(${cssAngle}deg, ${stops.join(', ')})`;
          } else if (stops.length === 1) {
            shapeFill = stops[0].split(' ')[0]; // use first stop color as solid
          }
        }
      }

      // noFill — explicit transparent
      if (!solidFillMatch && !spPr.includes('<a:gradFill>') && spPr.includes('<a:noFill')) {
        hasExplicitFill = true;
      }

      // Border — handle both self-closing <a:ln/> and <a:ln ...>...</a:ln>
      const lnMatch = spPr.match(/<a:ln\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:ln>)/);
      if (lnMatch) {
        const lnAttrs = lnMatch[1] || '';
        const lnInner = lnMatch[2] || '';
        const wMatch = lnAttrs.match(/\bw="(\d+)"/);
        const lnWidthPt = wMatch ? parseInt(wMatch[1]) / 12700 : 0;
        const lnSolidMatch = lnInner.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
        if (lnSolidMatch && lnWidthPt > 0) {
          const lnColor = resolveColor(lnSolidMatch[1]);
          if (lnColor) shapeBorder = { color: lnColor, widthPt: lnWidthPt };
        }
      }
    }

    const textMatches = shapeXml.match(/<a:t>([^<]*)<\/a:t>/g);
    const textContent = textMatches
      ? textMatches.map(t => t.replace(/<[^>]+>/g, '')).join(' ')
      : '';
    const hasText = textContent.trim().length > 0;

    if (!hasText) {
      // Skip only if truly invisible: no fill, no gradient, no border
      if (!shapeFill && !shapeGradient && !shapeBorder) continue;
      slide.elements.push({
        type: 'rect',
        id: `slide${slideIndex}-rect${i}`,
        bounds,
        shapeFill,
        shapeGradient,
        shapeBorder
      });
      continue;
    }

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
      shapeGradient,
      shapeBorder,
      maxChars
    });
  }
  
  // Find graphicFrames (charts, etc.)
  const hasGraphicFrame = xml.includes('<p:graphicFrame');
  debugLog(`Found graphicFrame tag: ${hasGraphicFrame}`);
  
  if (hasGraphicFrame) {
    // Find all graphicFrame positions
    const allMatches = [];
    let searchFrom = 0;
    while (true) {
      const idx = xml.indexOf('<p:graphicFrame', searchFrom);
      if (idx === -1) break;
      allMatches.push(idx);
      searchFrom = idx + 1;
    }
    debugLog(`Found ${allMatches.length} graphicFrame positions`);
    
    for (let i = 0; i < allMatches.length; i++) {
      const startIdx = allMatches[i];
      const endTag = '</p:graphicFrame>';
      const endIdx = xml.indexOf(endTag, startIdx);
      if (endIdx === -1) continue;
      
      const gfXml = xml.substring(startIdx, endIdx + endTag.length);
      
      let bounds = { x: 0.1, y: 0.1, w: 0.5, h: 0.3 };
      const xfrmMatch = gfXml.match(/<p:xfrm>([\s\S]*?)<\/p:xfrm>/);
      if (xfrmMatch) {
        const xfrmContent = xfrmMatch[1];
        const offMatch = xfrmContent.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
        const extMatch = xfrmContent.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
        if (offMatch && extMatch) {
          bounds = {
            x: parseInt(offMatch[1]) / slideWidth,
            y: parseInt(offMatch[2]) / slideHeight,
            w: parseInt(extMatch[1]) / slideWidth,
            h: parseInt(extMatch[2]) / slideHeight
          };
        }
      }
      
      let shapeName = 'chart';
      const cNvPrMatch = gfXml.match(/<p:cNvPr\s+id="\d+"\s+name="([^"]+)"/);
      if (cNvPrMatch) shapeName = cNvPrMatch[1];
      
      const chartMatch = gfXml.match(/<c:chart[^>]*r:id="([^"]+)"/);
      debugLog(`GraphicFrame ${i} has chart: ${!!chartMatch}`);
      
      if (chartMatch) {
        const chartRId = chartMatch[1];
        const chartData = zip ? extractChartData(zip, chartRId, slideIndex) : {};
        slide.elements.push({
          type: 'chart',
          id: `slide${slideIndex}-chart${i}`,
          shapeName,
          bounds,
          chartData
        });
        debugLog(`Added chart element to slide ${slideIndex}`);
      }
    }
  }

  // Find p:pic (image) elements
  const hasPic = xml.includes('<p:pic');
  if (hasPic) {
    const allPicMatches = [];
    let searchFrom = 0;
    while (true) {
      const idx = xml.indexOf('<p:pic', searchFrom);
      if (idx === -1) break;
      allPicMatches.push(idx);
      searchFrom = idx + 1;
    }
    debugLog(`Found ${allPicMatches.length} p:pic positions`);

    for (let i = 0; i < allPicMatches.length; i++) {
      const startIdx = allPicMatches[i];
      const endTag = '</p:pic>';
      const endIdx = xml.indexOf(endTag, startIdx);
      if (endIdx === -1) continue;

      const picXml = xml.substring(startIdx, endIdx + endTag.length);

      let bounds = { x: 0, y: 0, w: 0.3, h: 0.3 };
      // p:pic uses p:spPr > a:xfrm for position
      const spPrPicXfrmMatch = picXml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/);
      let xfrmContent = '';
      if (spPrPicXfrmMatch) {
        const axfrmMatch = spPrPicXfrmMatch[1].match(/<a:xfrm>([\s\S]*?)<\/a:xfrm>/);
        if (axfrmMatch) xfrmContent = axfrmMatch[1];
      }
      if (xfrmContent) {
        const offMatch = xfrmContent.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
        const extMatch = xfrmContent.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
        if (offMatch && extMatch) {
          bounds = {
            x: parseInt(offMatch[1]) / slideWidth,
            y: parseInt(offMatch[2]) / slideHeight,
            w: parseInt(extMatch[1]) / slideWidth,
            h: parseInt(extMatch[2]) / slideHeight
          };
        }
      }

      let shapeName = `image_${i}`;
      const cNvPrMatch = picXml.match(/<p:cNvPr\s+id="\d+"\s+name="([^"]+)"/);
      if (cNvPrMatch) shapeName = cNvPrMatch[1];

      // Check for a fill color on the pic shape (rare, but possible)
      let shapeFill = null;
      if (spPrPicXfrmMatch) {
        const solidFillMatch = spPrPicXfrmMatch[1].match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
        if (solidFillMatch) shapeFill = resolveColor(solidFillMatch[1]);
      }

      slide.elements.push({
        type: 'image',
        id: `slide${slideIndex}-pic${i}`,
        shapeName,
        bounds,
        shapeFill
      });
      debugLog(`Added image element to slide ${slideIndex}`);
    }
  }

  debugLog(`Slide ${slideIndex} has ${slide.elements.length} elements`);
  return slide;
}