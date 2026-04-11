import admZip from 'adm-zip';
import fs from 'fs';

const EMU_PER_INCH = 914400;

// Slide number comparator — used in multiple sort() calls.
const slideNumFrom = (entry) => parseInt(entry.entryName.match(/slide(\d+)\.xml/)[1]);
const slideNumComparator = (a, b) => slideNumFrom(a) - slideNumFrom(b);

// Full Office theme colour palette — used for both background and element colour resolution.
const SCHEME_COLORS = {
  dk1: '#000000', dk2: '#44546A',
  lt1: '#FFFFFF', lt2: '#E7E6E6',
  accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A9D18E',
  accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47',
  tx1: '#000000', tx2: '#44546A',
  bg1: '#FFFFFF', bg2: '#E7E6E6',
  hlink: '#0563C1', folHlink: '#954F72'
};

// Strips date/project suffixes from fuzzy key matching (e.g. revenue_2024_solon → revenue).
const stripKeySuffix = (k) => k
  .replace(/_20\d{2}.*$/, '')
  .replace(/_session.*$/, '')
  .replace(/_steerco.*$/, '')
  .replace(/_roadmap.*$/, '')
  .replace(/_product.*$/, '')
  .replace(/_tax.*$/, '')
  .replace(/_solon.*$/, '');

// ========================
// Slide Parsing
// ========================

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
  if (!xml) {
    return { index: slideIndex, elements: [], background: '#ffffff' };
  }

  const slide = {
    index: slideIndex,
    elements: [],
    background: '#ffffff'
  };

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

  const resolveColor = (xml) => {
    const srgb = xml.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
    if (srgb) return '#' + srgb[1];
    const scheme = xml.match(/<a:schemeClr val="([^"]+)"/);
    if (scheme) return SCHEME_COLORS[scheme[1]] || '#333333';
    return null;
  };

  for (let i = 0; i < shapeMatches.length; i++) {
    const shapeXml = shapeMatches[i];

    // --- Extract bounds ---
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

    // --- Extract shape fill and border ---
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

    // --- Determine whether this shape has visible text ---
    const textMatches = shapeXml.match(/<a:t>([^<]*)<\/a:t>/g);
    const textContent = textMatches
      ? textMatches.map(t => t.replace(/<[^>]+>/g, '')).join(' ')
      : '';
    const hasText = textContent.trim().length > 0;

    if (!hasText) {
      if (!shapeFill && !shapeBorder) continue;
      slide.elements.push({
        type: 'rect',
        id: `slide${slideIndex}-rect${i}`,
        bounds,
        shapeFill,
        shapeBorder
      });
      continue;
    }

    // --- Text shape: extract all font/style properties ---
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

    const avgCharWidth = (fontSize || 12) * 0.55;
    const lineHeight = (fontSize || 12) * 1.2;
    const pointsPerInch = 72;

    const charsPerLine = Math.max(1, Math.floor((bounds?.w || 1) * pointsPerInch / avgCharWidth));
    const lines = Math.max(1, Math.floor((bounds?.h || 0.1) * pointsPerInch / lineHeight));
    const maxChars = charsPerLine * lines;

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

export function getPresetColor(name) {
  const colors = {
    white: '#FFFFFF', black: '#000000', red: '#FF0000', green: '#00FF00',
    blue: '#0000FF', yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF',
    gray: '#808080'
  };
  return colors[name] || '#FFFFFF';
}

// ========================
// Placeholder Replacement
// ========================

export function replacePlaceholders(content, jsonData, recordData, tags, slideIndex) {
  const slideTags = tags.filter(t => t.slideIndex === slideIndex);

  const escapeXml = (str) => {
    if (!str) return '';
    return str.replace(/&(?!(amp|lt|gt|apos|quot);)/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
  };

  const contextualEntry = !recordData && Array.isArray(jsonData.contextual)
    ? jsonData.contextual.find(c => c.slide_index === slideIndex)
    : null;

  const findValue = (key) => {
    if (contextualEntry && contextualEntry[key] !== undefined) return contextualEntry[key];

    const source = recordData || jsonData.static || jsonData;
    if (source[key] !== undefined) return source[key];

    const keyBase = stripKeySuffix(key);

    for (const k of Object.keys(source)) {
      if (k.includes(key) || key.includes(k) || stripKeySuffix(k) === keyBase) {
        return source[k];
      }
    }
    return undefined;
  };

  return content.replace(/<a:t>([^<]*)<\/a:t>/g, (match, text) => {
    const tag = slideTags.find(t => text.includes(`{{${t.key}}}`));

    if (tag) {
      if (tag.autoGenerate) {
        const value = findValue(tag.key);
        return `<a:t>${escapeXml(value) || ''}</a:t>`;
      } else {
        return `<a:t>${escapeXml(tag.originalText) || ''}</a:t>`;
      }
    }

    return match;
  });
}

// ========================
// Shared Key Detection
// ========================

export function detectSharedKeys(tags, repeatableSlideIndices = new Set()) {
  const allStaticFields = tags.filter(t => !repeatableSlideIndices.has(t.slideIndex));
  const keyToSlides = {};
  allStaticFields.forEach(t => {
    if (!keyToSlides[t.key]) keyToSlides[t.key] = [];
    if (!keyToSlides[t.key].includes(t.slideIndex)) keyToSlides[t.key].push(t.slideIndex);
  });
  return new Set(
    Object.entries(keyToSlides).filter(([, slides]) => slides.length > 1).map(([k]) => k)
  );
}

// ========================
// Recipe Generation
// ========================

export function buildRecipe(tags, repeatableSlides, globalPrompt) {
  const globalPromptSection = globalPrompt
    ? `GLOBAL GUIDANCE:\n${globalPrompt}\n\n`
    : '';

  const repeatableSlideIndices = new Set((repeatableSlides || []).map(r => r.slideIndex));
  const allStaticFields = tags.filter(t => !repeatableSlideIndices.has(t.slideIndex));

  const sharedKeys = detectSharedKeys(tags, repeatableSlideIndices);

  const staticFields = allStaticFields.filter(t => !sharedKeys.has(t.key));
  const contextualFields = allStaticFields.filter(t => sharedKeys.has(t.key));

  const repeatableFields = (repeatableSlides || []).map(r => ({
    slideIndex: r.slideIndex,
    structureType: r.structureType || `slide_${r.slideIndex}`,
    customPrompt: r.customPrompt || '',
    fields: tags.filter(t => t.slideIndex === r.slideIndex)
  }));

  let recipe = `INSTRUCTIONS:
- Return ONLY valid JSON, no explanations or markdown
- Use EXACT key names as provided - do NOT abbreviate or modify key names

${globalPromptSection}GENERATE THE FOLLOWING DATA:

1. STATIC FIELDS (one value per field):
{
  "static": {
`;

  if (staticFields.length > 0) {
    staticFields.forEach(tag => {
      const hint = tag.hint || `value for ${tag.key}`;
      const maxCharsStr = tag.maxChars ? ` (max ${tag.maxChars} chars)` : '';
      const autoGen = tag.autoGenerate ? ' [AI]' : '';
      recipe += `    "${tag.key}": "${hint}${maxCharsStr}"${autoGen},\n`;
    });
  }

  recipe += `  },\n`;

  if (contextualFields.length > 0) {
    recipe += `\n2. CONTEXTUAL FIELDS (same field type, slide-specific content — generate one value per slide):\n`;
    recipe += `"contextual": [\n`;
    recipe += `  // Each entry: { "slide_index": N, "field_key": "generated value" }\n`;

    const byKey = {};
    contextualFields.forEach(t => {
      if (!byKey[t.key]) byKey[t.key] = [];
      byKey[t.key].push(t);
    });

    Object.entries(byKey).forEach(([key, fieldTags]) => {
      recipe += `\n  // Field: "${key}" — generate a distinct value for each slide below\n`;
      fieldTags
        .filter(t => t.autoGenerate)
        .sort((a, b) => a.slideIndex - b.slideIndex)
        .forEach(tag => {
          const hint = tag.hint || `value for ${key} on slide ${tag.slideIndex}`;
          const maxCharsStr = tag.maxChars ? ` (max ${tag.maxChars} chars)` : '';
          recipe += `  { "slide_index": ${tag.slideIndex}, "${key}": "Slide ${tag.slideIndex} context: ${hint}${maxCharsStr}" },\n`;
        });
    });

    recipe += `]\n`;
  }

  const slidesSection = contextualFields.length > 0 ? '\n3.' : '\n2.';
  if (repeatableFields.length > 0) {
    recipe += `${slidesSection} REPEATABLE SLIDES (generate an array of instances for each slide type):\n`;
    recipe += `"slides": {\n`;

    repeatableFields.forEach((rf, idx) => {
      const dataKey = rf.structureType;
      const isLast = idx === repeatableFields.length - 1;
      const slideGenerateFields = rf.fields.filter(t => t.autoGenerate);

      recipe += `  "${dataKey}": [\n`;
      recipe += `    // CUSTOM PROMPT: ${rf.customPrompt || 'instances of this slide type'}\n`;
      recipe += `    {\n`;
      recipe += `      "structure_type": "${rf.structureType}",\n`;

      slideGenerateFields.forEach(tag => {
        const hint = tag.hint || `value for ${tag.key}`;
        recipe += `      "${tag.key}": "${hint}"${tag.maxChars ? ` (max ${tag.maxChars} chars)` : ''},\n`;
      });

      recipe += `    }\n`;
      recipe += `  ]${isLast ? '' : ','}\n`;
    });

    recipe += `}\n`;
  } else {
    recipe += `\n`;
  }

  recipe += `\nIMPORTANT:\n- static: one value per key\n- contextual: one array entry per slide, each with "slide_index" and the field value\n- slides: array of instances, each with "structure_type" field`;

  return recipe;
}

// ========================
// JSON Validation
// ========================

export function validateJsonData(jsonString, tags, repeatableSlides) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (e) {
    return {
      valid: false,
      error: 'Invalid JSON syntax',
      foundFields: [],
      missingFields: tags.map(t => t.key)
    };
  }

  const foundFields = [];
  const missingFields = [];

  const generateOnlyTags = tags.filter(t => t.autoGenerate);
  const repeatableSet = new Set((repeatableSlides || []).map(r => r.slideIndex));

  const allStaticTags = generateOnlyTags.filter(t => !repeatableSet.has(t.slideIndex));
  const sharedKeys = detectSharedKeys(generateOnlyTags, repeatableSet);

  const staticData = data.static || data;
  const staticTags = allStaticTags.filter(t => !sharedKeys.has(t.key));
  staticTags.forEach(tag => {
    if (staticData[tag.key] !== undefined) {
      foundFields.push(tag.key);
    } else {
      missingFields.push(tag.key);
    }
  });

  const contextualData = data.contextual || [];
  const contextualTags = allStaticTags.filter(t => sharedKeys.has(t.key));
  contextualTags.forEach(tag => {
    const entry = contextualData.find(c => c.slide_index === tag.slideIndex);
    if (entry && entry[tag.key] !== undefined) {
      foundFields.push(`${tag.key} (slide ${tag.slideIndex})`);
    } else {
      missingFields.push(`${tag.key} (slide ${tag.slideIndex})`);
    }
  });

  const slidesData = data.slides || {};
  (repeatableSlides || []).forEach(repeatable => {
    const dataKey = repeatable.structureType || `slide_${repeatable.slideIndex}`;
    const instances = slidesData[dataKey];

    if (!Array.isArray(instances) || instances.length === 0) {
      missingFields.push(`${dataKey} (no instances)`);
      return;
    }

    instances.forEach((instance, idx) => {
      if (!instance.structure_type) {
        missingFields.push(`structure_type (${dataKey} instance ${idx + 1})`);
      }

      const slideTags = generateOnlyTags.filter(t => t.slideIndex === repeatable.slideIndex);
      slideTags.forEach(tag => {
        if (instance[tag.key] !== undefined) {
          foundFields.push(`${tag.key} (${dataKey} instance ${idx + 1})`);
        } else {
          missingFields.push(`${tag.key} (${dataKey} instance ${idx + 1})`);
        }
      });
    });
  });

  const instanceCount = Object.values(slidesData).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0
  );

  return {
    valid: missingFields.length === 0,
    error: null,
    foundFields,
    missingFields,
    instanceCount
  };
}

// ========================
// PPTX Generation
// ========================

export function buildPptxZip(templatePath, tags, jsonData, repeatableSlides) {
  const buffer = fs.readFileSync(templatePath);
  const zip = new admZip(buffer);

  const sortedEntries = zip.getEntries()
    .filter(e => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort(slideNumComparator);

  const baseContent = {};
  for (const entry of sortedEntries) {
    let content = entry.getData().toString('utf8');
    const slideNum = parseInt(entry.entryName.match(/slide(\d+)\.xml/)[1]);
    const slideTags = tags.filter(t => t.slideIndex === slideNum);
    slideTags.forEach(tag => {
      if (tag.originalText) {
        const escaped = tag.originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`<a:t>(${escaped})</a:t>`, 'g');
        content = content.replace(regex, `<a:t>{{${tag.key}}}</a:t>`);
      }
    });
    baseContent[slideNum] = content;
  }

  const generatedSlides = [];
  const slidesData = jsonData.slides || {};

  const structureTypeToTemplate = {};
  (repeatableSlides || []).forEach(r => {
    const st = r.structureType || `slide_${r.slideIndex}`;
    structureTypeToTemplate[st] = {
      slideIndex: r.slideIndex,
      content: baseContent[r.slideIndex]
    };
  });

  Object.entries(slidesData).forEach(([dataKey, instances]) => {
    if (!Array.isArray(instances) || instances.length === 0) return;
    instances.forEach((instance, instanceIdx) => {
      const st = instance.structure_type;
      const template = structureTypeToTemplate[st];
      if (template) {
        const slideContent = replacePlaceholders(template.content, jsonData, instance, tags, template.slideIndex);
        generatedSlides.push({
          slideIndex: template.slideIndex,
          instanceIndex: instanceIdx + 1,
          structureType: st,
          instanceData: instance,
          content: slideContent
        });
      }
    });
  });

  const repeatableSet = new Set((repeatableSlides || []).map(r => r.slideIndex));
  const staticData = jsonData.static || jsonData;
  for (let slideNum = 1; slideNum <= sortedEntries.length; slideNum++) {
    if (!repeatableSet.has(slideNum)) {
      const slideContent = replacePlaceholders(baseContent[slideNum], staticData, null, tags, slideNum);
      generatedSlides.push({ slideIndex: slideNum, instanceIndex: null, content: slideContent });
    }
  }

  // Interleave repeatable slides by parent-child relationship
  const staticSlides = generatedSlides.filter(g => g.instanceIndex === null);
  const repeatableSlidesList = generatedSlides.filter(g => g.instanceIndex !== null);

  const tierOrder = [...new Set(
    (repeatableSlides || [])
      .slice()
      .sort((a, b) => a.slideIndex - b.slideIndex)
      .map(r => r.structureType || `slide_${r.slideIndex}`)
  )];

  const stringValues = (instance) => new Set(
    Object.values(instance).filter(v => typeof v === 'string' && v.trim() !== '')
  );

  const tierBuckets = tierOrder.map(st => repeatableSlidesList.filter(s => s.structureType === st));
  const sortedRepeatable = [];
  const placed = new Set();

  if (tierBuckets.length <= 1) {
    sortedRepeatable.push(...(tierBuckets[0] || []));
  } else {
    const parentBucket = tierBuckets[0];
    const childBuckets = tierBuckets.slice(1);
    parentBucket.forEach(parent => {
      sortedRepeatable.push(parent);
      placed.add(parent);
      const parentValues = stringValues(parent.instanceData);
      childBuckets.forEach(childBucket => {
        childBucket.forEach(child => {
          if (placed.has(child)) return;
          const childValues = stringValues(child.instanceData);
          const linked = [...childValues].some(v => parentValues.has(v));
          if (linked) { sortedRepeatable.push(child); placed.add(child); }
        });
      });
    });
    tierBuckets.slice(1).forEach(childBucket => {
      childBucket.forEach(child => { if (!placed.has(child)) sortedRepeatable.push(child); });
    });
  }

  const sortedGenerated = [...staticSlides, ...sortedRepeatable];

  // Collect _rels templates before deleting originals
  const slideRelsTemplates = {};
  zip.getEntries()
    .filter(e => e.entryName.match(/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/))
    .forEach(e => {
      const num = parseInt(e.entryName.match(/slide(\d+)\.xml\.rels/)[1]);
      slideRelsTemplates[num] = e.getData().toString('utf8');
    });

  // Delete all original slide XMLs and _rels
  zip.getEntries().forEach(entry => {
    if (entry.entryName.match(/^ppt\/slides\/slide\d+\.xml$/) ||
        entry.entryName.match(/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/)) {
      zip.deleteEntry(entry.entryName);
    }
  });

  // Add generated slides
  sortedGenerated.forEach((gs, idx) => {
    const slideNum = idx + 1;
    const escapedContent = (gs.content || '').replace(/&(?!(amp|lt|gt|apos|quot);)/g, '&amp;');
    zip.addFile(`ppt/slides/slide${slideNum}.xml`, Buffer.from(escapedContent, 'utf8'));
    const sourceRels = slideRelsTemplates[gs.slideIndex] || slideRelsTemplates[1] ||
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
    const cleanRels = sourceRels.replace(/<Relationship[^>]*notesSlide[^>]*\/>/g, '');
    zip.addFile(`ppt/slides/_rels/slide${slideNum}.xml.rels`, Buffer.from(cleanRels, 'utf8'));
  });

  // Update presentation.xml.rels
  const relsEntry = zip.getEntries().find(e => e.entryName === 'ppt/_rels/presentation.xml.rels');
  if (relsEntry) {
    let relsXml = relsEntry.getData().toString('utf8');
    relsXml = relsXml.replace(/<Relationship[^>]*\/officeDocument\/2006\/relationships\/slide"[^>]*\/>/g, '');
    const existingIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1]));
    const maxRId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    const newSlideRels = sortedGenerated.map((_, idx) =>
      `<Relationship Id="rId${maxRId + idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${idx + 1}.xml"/>`
    ).join('');
    relsXml = relsXml.replace('</Relationships>', newSlideRels + '</Relationships>');
    relsEntry.setData(Buffer.from(relsXml, 'utf8'));

    const presentationEntry = zip.getEntries().find(e => e.entryName === 'ppt/presentation.xml');
    if (presentationEntry) {
      let presentationXml = presentationEntry.getData().toString('utf8');
      const slideIds = sortedGenerated.map((_, idx) =>
        `<p:sldId id="${256 + idx}" r:id="rId${maxRId + idx + 1}"/>`
      ).join('');
      presentationXml = presentationXml.replace(
        /<p:sldIdLst[^>]*>[\s\S]*?<\/p:sldIdLst>/,
        `<p:sldIdLst>${slideIds}</p:sldIdLst>`
      );
      presentationEntry.setData(Buffer.from(presentationXml, 'utf8'));
    }
  }

  // Update [Content_Types].xml
  const contentTypesEntry = zip.getEntries().find(e => e.entryName === '[Content_Types].xml');
  if (contentTypesEntry) {
    let contentTypesXml = contentTypesEntry.getData().toString('utf8');
    contentTypesXml = contentTypesXml.replace(/<Override PartName="\/ppt\/slides\/slide\d+\.xml"[^>]*\/>/g, '');
    const slideOverrides = sortedGenerated.map((_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    );
    const lastOverrideMatch = contentTypesXml.match(/<Override PartName="(?!\/ppt\/slides\/)[^"]*"[^>]*\/>/g);
    if (lastOverrideMatch) {
      const lastOverride = lastOverrideMatch[lastOverrideMatch.length - 1];
      const lastIndex = contentTypesXml.lastIndexOf(lastOverride);
      contentTypesXml = contentTypesXml.slice(0, lastIndex + lastOverride.length) + '\n' + slideOverrides.join('\n') + contentTypesXml.slice(lastIndex + lastOverride.length);
    } else {
      contentTypesXml = contentTypesXml.replace('</Types>', slideOverrides.join('\n') + '\n</Types>');
    }
    contentTypesEntry.setData(Buffer.from(contentTypesXml, 'utf8'));
  }

  // Build preview data
  const previewData = sortedGenerated.map((gs, idx) => {
    const content = gs.content || '';
    let elements = { elements: [] };
    try { elements = extractSlideElements(content, gs.slideIndex); } catch (e) {
      console.error(`[pptx-utils] Failed to parse slide ${gs.slideIndex} for preview:`, e.message);
    }
    const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const sampleText = textMatches.slice(0, 3).map(t => t.replace(/<[^>]+>/g, ''));
    return {
      slideNumber: idx + 1,
      instanceIndex: gs.instanceIndex,
      content: gs.content,
      elements: elements.elements,
      background: elements.background,
      sampleText
    };
  });

  return { zip, previewData };
}
