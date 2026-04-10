import express from 'express';
import cors from 'cors';
import admZip from 'adm-zip';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3001;
const PROJECT_ROOT = path.join(__dirname);
const TEMP_DIR = path.join(PROJECT_ROOT, 'temp');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const PATCHES_DIR = path.join(PROJECT_ROOT, 'patches');
const EMU_PER_INCH = 914400;

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(PATCHES_DIR)) fs.mkdirSync(PATCHES_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// UC-01: Upload PPTX
app.post('/api/upload-pptx', (req, res) => {
  try {
    const { file, fileName } = req.body;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const buffer = Buffer.from(file, 'base64');
    const tempPath = path.join(TEMP_DIR, `${Date.now()}-${fileName || 'template.pptx'}`);
    fs.writeFileSync(tempPath, buffer);

    const zip = new admZip(buffer);
    const slides = parseSlides(zip);

    res.json({
      ok: true,
      filePath: tempPath,
      slides,
      fileName: fileName || 'template.pptx'
    });
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse PPTX: ' + err.message });
  }
});

// UC-04: Generate recipe
app.post('/api/generate-recipe', (req, res) => {
  try {
    const { tags, repeatableSlides } = req.body;
    
    // Separate static fields (non-repeatable slides) from repeatable slide fields
    const repeatableSlideIndices = new Set((repeatableSlides || []).map(r => r.slideIndex));
    const staticFields = tags.filter(t => !repeatableSlideIndices.has(t.slideIndex));
    
    // Get fields for each repeatable slide
    const repeatableFields = (repeatableSlides || []).map(r => ({
      slideIndex: r.slideIndex,
      structureType: r.structureType || `slide_${r.slideIndex}`,
      customPrompt: r.customPrompt || '',
      fields: tags.filter(t => t.slideIndex === r.slideIndex)
    }));
    
    // Collect static generate fields
    const staticGenerateFieldsList = staticFields.filter(t => t.autoGenerate);
    
    let recipe = `INSTRUCTIONS:
- Return ONLY valid JSON, no explanations or markdown
- Use EXACT key names as provided - do NOT abbreviate or modify key names

GENERATE THE FOLLOWING DATA:

1. STATIC FIELDS (non-repeatable slides) - generate actual values:
{
  "static": {
`;
    
    // Static fields section
    if (staticGenerateFieldsList.length > 0) {
      staticGenerateFieldsList.forEach(tag => {
        const hint = tag.hint || `value for ${tag.key}`;
        recipe += `    "${tag.key}": "${hint}"${tag.maxChars ? ` (max ${tag.maxChars} chars)` : ''},\n`;
      });
    }
    
    recipe += `  },\n`;
    
    // Repeatable slides section
    if (repeatableFields.length > 0) {
      recipe += `  "slides": {\n`;
      
      repeatableFields.forEach((rf, idx) => {
        const dataKey = rf.structureType;
        const isLast = idx === repeatableFields.length - 1;
        
        // Generate fields for this repeatable slide
        const slideGenerateFields = rf.fields.filter(t => t.autoGenerate);
        
        recipe += `    "${dataKey}": [\n`;
        
        // Show example instance with structure_type
        recipe += `      // Example: generate ${rf.customPrompt || 'instances of this slide type'}\n`;
        recipe += `      {\n`;
        recipe += `        "structure_type": "${rf.structureType}",\n`;
        
        slideGenerateFields.forEach(tag => {
          const hint = tag.hint || `value for ${tag.key}`;
          recipe += `        "${tag.key}": "${hint}"${tag.maxChars ? ` (max ${tag.maxChars} chars)` : ''},\n`;
        });
        
        recipe += `      }\n`;
        recipe += `    ]${isLast ? '' : ','}\n`;
      });
      
      recipe += `  }\n`;
    } else {
      recipe += `  "slides": {}\n`;
    }
    
    recipe += `}\n\nIMPORTANT: For static fields, provide actual generated values. For repeatable slides, generate an array of instances - each with "structure_type" field matching the key name.`;
    
    res.json({ ok: true, recipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UC-05: Validate JSON
app.post('/api/validate-json', (req, res) => {
  try {
    const { jsonString, tags, repeatableSlides } = req.body;
    
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      return res.json({ 
        valid: false, 
        error: 'Invalid JSON syntax',
        foundFields: [],
        missingFields: tags.map(t => t.key)
      });
    }
    
    const foundFields = [];
    const missingFields = [];
    
    const generateOnlyTags = tags.filter(t => t.autoGenerate);
    const repeatableSet = new Set((repeatableSlides || []).map(r => r.slideIndex));
    
    // Validate static fields (now under "static" key)
    const staticData = data.static || data;
    const staticTags = generateOnlyTags.filter(t => !repeatableSet.has(t.slideIndex));
    staticTags.forEach(tag => {
      if (staticData[tag.key] !== undefined) {
        foundFields.push(tag.key);
      } else {
        missingFields.push(tag.key);
      }
    });
    
    // Validate repeatable slides
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
    
    const instanceCount = Object.values(slidesData).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    
    res.json({
      valid: missingFields.length === 0,
      error: null,
      foundFields,
      missingFields,
      instanceCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UC-06: Generate PPTX
app.post('/api/generate-pptx', (req, res) => {
  try {
    const { templatePath, tags, jsonData, repeatableSlides } = req.body;
    
    if (!templatePath || !fs.existsSync(templatePath)) {
      return res.status(400).json({ error: 'Template file not found' });
    }
    
    const buffer = fs.readFileSync(templatePath);
    const zip = new admZip(buffer);
    
    // Get original slides content
    const sortedEntries = zip.getEntries()
      .filter(e => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/slide(\d+)\.xml/)[1]);
        const numB = parseInt(b.entryName.match(/slide(\d+)\.xml/)[1]);
        return numA - numB;
      });
    
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
    
    // Build output slides
    const generatedSlides = [];
    const slidesData = jsonData.slides || {};
    
    // Build structure type to slide template mapping
    const structureTypeToTemplate = {};
    (repeatableSlides || []).forEach(r => {
      const st = r.structureType || `slide_${r.slideIndex}`;
      structureTypeToTemplate[st] = {
        slideIndex: r.slideIndex,
        content: baseContent[r.slideIndex]
      };
    });
    
    // Generate slides from JSON data by structure_type, preserving raw instance for matching
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
            instanceData: instance,   // retained for field-value matching at sort time
            content: slideContent
          });
        }
      });
    });

    // Also include static slides (non-repeatable)
    const repeatableSet = new Set((repeatableSlides || []).map(r => r.slideIndex));
    const staticData = jsonData.static || jsonData;
    for (let slideNum = 1; slideNum <= sortedEntries.length; slideNum++) {
      if (!repeatableSet.has(slideNum)) {
        const slideContent = replacePlaceholders(baseContent[slideNum], staticData, null, tags, slideNum);
        generatedSlides.push({
          slideIndex: slideNum,
          instanceIndex: null,
          content: slideContent
        });
      }
    }

    // Interleave repeatable slides by parent-child relationship
    const staticSlides = generatedSlides.filter(g => g.instanceIndex === null);
    const repeatableSlidesList = generatedSlides.filter(g => g.instanceIndex !== null);

    // Determine tier order from template slideIndex (lower = parent, higher = child)
    const tierOrder = [...new Set(
      (repeatableSlides || [])
        .slice()
        .sort((a, b) => a.slideIndex - b.slideIndex)
        .map(r => r.structureType || `slide_${r.slideIndex}`)
    )];

    // Extract all string field values from an instance for matching
    const stringValues = (instance) => new Set(
      Object.values(instance).filter(v => typeof v === 'string' && v.trim() !== '')
    );

    // Build tier buckets in template slide order
    const tierBuckets = tierOrder.map(st => repeatableSlidesList.filter(s => s.structureType === st));

    const sortedRepeatable = [];
    const placed = new Set();

    if (tierBuckets.length <= 1) {
      // Single structure type — no interleaving needed
      sortedRepeatable.push(...(tierBuckets[0] || []));
    } else {
      const parentBucket = tierBuckets[0];
      const childBuckets = tierBuckets.slice(1);

      parentBucket.forEach(parent => {
        sortedRepeatable.push(parent);
        placed.add(parent);

        const parentValues = stringValues(parent.instanceData);

        // For each child tier (in slideIndex order), emit matched children
        childBuckets.forEach(childBucket => {
          childBucket.forEach(child => {
            if (placed.has(child)) return;
            const childValues = stringValues(child.instanceData);
            const linked = [...childValues].some(v => parentValues.has(v));
            if (linked) {
              sortedRepeatable.push(child);
              placed.add(child);
            }
          });
        });
      });

      // Append any children not matched to a parent (orphans) in tier order
      tierBuckets.slice(1).forEach(childBucket => {
        childBucket.forEach(child => {
          if (!placed.has(child)) sortedRepeatable.push(child);
        });
      });
    }

    // Combine: static slides first, then interleaved repeatable slides
    const finalSortedSlides = [...staticSlides, ...sortedRepeatable];
    
    // Handle slide numbering for PPTX
    // Remove original slides and replace with generated slides only

    // Collect slide _rels templates before deletion so we can recreate them for generated slides
    const slideRelsTemplates = {};
    zip.getEntries()
      .filter(e => e.entryName.match(/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/))
      .forEach(e => {
        const num = parseInt(e.entryName.match(/slide(\d+)\.xml\.rels/)[1]);
        slideRelsTemplates[num] = e.getData().toString('utf8');
      });

    // Delete all original slide XMLs and their _rels files from zip
    const allEntries = zip.getEntries();
    allEntries.forEach(entry => {
      if (entry.entryName.match(/^ppt\/slides\/slide\d+\.xml$/) ||
          entry.entryName.match(/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/)) {
        zip.deleteEntry(entry.entryName);
      }
    });

    // Use the final sorted slides with interleaved ordering
    const sortedGenerated = finalSortedSlides;

    // Add all generated slides starting from slide1.xml, plus their _rels files
    sortedGenerated.forEach((gs, idx) => {
      const slideNum = idx + 1;
      const slideXml = `ppt/slides/slide${slideNum}.xml`;
      // Escape & to &amp; in XML content
      const escapedContent = (gs.content || '').replace(/&(?!(amp|lt|gt|apos|quot);)/g, '&amp;');
      zip.addFile(slideXml, Buffer.from(escapedContent, 'utf8'));

      // Create _rels file for this slide based on the source template slide's rels
      const sourceRels = slideRelsTemplates[gs.slideIndex] || slideRelsTemplates[1] ||
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
      // Strip notesSlide refs — we're not generating note slides for the expanded set
      const cleanRels = sourceRels.replace(/<Relationship[^>]*notesSlide[^>]*\/>/g, '');
      zip.addFile(`ppt/slides/_rels/slide${slideNum}.xml.rels`, Buffer.from(cleanRels, 'utf8'));
    });

    // Update _rels/presentation.xml.rels: preserve non-slide relationships, replace slide ones
    const relsEntry = zip.getEntries().find(e => e.entryName === 'ppt/_rels/presentation.xml.rels');
    if (relsEntry) {
      let relsXml = relsEntry.getData().toString('utf8');

      // Remove only existing slide relationships (preserve slideMaster, theme, presProps, etc.)
      relsXml = relsXml.replace(/<Relationship[^>]*\/officeDocument\/2006\/relationships\/slide"[^>]*\/>/g, '');

      // Find max rId used by remaining relationships to avoid ID conflicts
      const existingIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1]));
      const maxRId = existingIds.length > 0 ? Math.max(...existingIds) : 0;

      // Build new slide relationships with non-conflicting IDs
      const newSlideRels = sortedGenerated.map((_, idx) =>
        `<Relationship Id="rId${maxRId + idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${idx + 1}.xml"/>`
      ).join('');

      relsXml = relsXml.replace('</Relationships>', newSlideRels + '</Relationships>');
      relsEntry.setData(Buffer.from(relsXml, 'utf8'));

      // Update presentation.xml sldIdLst to use the matching rIds
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
    
    // Update [Content_Types].xml to include all new slides
    const contentTypesEntry = zip.getEntries().find(e => e.entryName === '[Content_Types].xml');
    if (contentTypesEntry) {
      let contentTypesXml = contentTypesEntry.getData().toString('utf8');
      
      // FIX 1: Remove all existing slide overrides first to avoid duplicates
      contentTypesXml = contentTypesXml.replace(/<Override PartName="\/ppt\/slides\/slide\d+\.xml"[^>]*\/>/g, '');
      
      // FIX 2: Use correct ContentType — slide+xml not slide.main+xml
      const slideOverrides = [];
      for (let i = 1; i <= sortedGenerated.length; i++) {
        slideOverrides.push(`<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
      }
      
      // FIX 3: Use correct negative lookahead regex to find a non-slide Override to insert after,
      // instead of the broken character-by-character approach that could insert outside </Types>
      const lastOverrideMatch = contentTypesXml.match(/<Override PartName="(?!\/ppt\/slides\/)[^"]*"[^>]*\/>/g);
      if (lastOverrideMatch) {
        const lastOverride = lastOverrideMatch[lastOverrideMatch.length - 1];
        const lastIndex = contentTypesXml.lastIndexOf(lastOverride);
        contentTypesXml = contentTypesXml.slice(0, lastIndex + lastOverride.length) + '\n' + slideOverrides.join('\n') + contentTypesXml.slice(lastIndex + lastOverride.length);
      } else {
        // Fallback: insert before closing </Types> tag to guarantee valid XML
        contentTypesXml = contentTypesXml.replace('</Types>', slideOverrides.join('\n') + '\n</Types>');
      }
      
      contentTypesEntry.setData(Buffer.from(contentTypesXml, 'utf8'));
    }
    
    // Generate preview data in the same order as the output PPTX (sortedGenerated)
    const previewData = sortedGenerated.map((gs, idx) => {
      const content = gs.content || '';
      let elements = { elements: [] };
      try {
        elements = extractSlideElements(content, gs.slideIndex);
      } catch (e) {}

      const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const sampleText = textMatches.slice(0, 3).map(t => t.replace(/<[^>]+>/g, ''));

      return {
        slideNumber: idx + 1,          // output position (1-based), not template slide index
        instanceIndex: gs.instanceIndex,
        content: gs.content,
        elements: elements.elements,
        background: elements.background,
        sampleText
      };
    });
    
    const timestamp = Date.now();
    const outputPath = path.join(OUTPUT_DIR, `generated-${timestamp}.pptx`);
    zip.writeZip(outputPath);
    
    res.json({
      ok: true,
      previewData,
      downloadUrl: `/api/download/${path.basename(outputPath)}`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate: ' + err.message });
  }
});

// Download
app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(OUTPUT_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath);
});

// Patch endpoints
app.get('/api/patches', (req, res) => {
  try {
    if (!fs.existsSync(PATCHES_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(PATCHES_DIR);
    const patches = files.filter(f => f.endsWith('.json')).map(f => {
      const data = fs.readFileSync(path.join(PATCHES_DIR, f), 'utf8');
      return JSON.parse(data);
    });
    res.json(patches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/patches', (req, res) => {
  try {
    const { patch } = req.body;
    if (!patch || !patch.name) {
      return res.status(400).json({ error: 'Patch name required' });
    }
    const filename = `${patch.id}-${patch.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    fs.writeFileSync(path.join(PATCHES_DIR, filename), JSON.stringify(patch, null, 2));
    res.json({ ok: true, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/patches/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const files = fs.readdirSync(PATCHES_DIR).filter(f => f.endsWith('.json'));
    const file = files.find(f => f.startsWith(`${id}-`));
    if (file) {
      fs.unlinkSync(path.join(PATCHES_DIR, file));
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// Helper Functions
// ========================

function parseSlides(zip) {
  const slides = [];
  const slideEntries = zip.getEntries().filter(e => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/));
  
  for (const entry of slideEntries.sort((a, b) => {
    const numA = parseInt(a.entryName.match(/slide(\d+)\.xml/)[1]);
    const numB = parseInt(b.entryName.match(/slide(\d+)\.xml/)[1]);
    return numA - numB;
  })) {
    const content = entry.getData().toString('utf8');
    const slideData = extractSlideElements(content, parseInt(entry.entryName.match(/slide(\d+)\.xml/)[1]));
    slides.push(slideData);
  }
  
  return slides;
}

function extractSlideElements(xml, slideIndex) {
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
    const srgbMatch = bgMatch[1].match(/<a:srgbClr val="([^"]+)"/);
    if (srgbMatch) {
      slide.background = '#' + srgbMatch[1];
    } else {
      const prstMatch = bgMatch[1].match(/<a:prstClr val="(\w+)"/);
      if (prstMatch) slide.background = getPresetColor(prstMatch[1]);
    }
  }

  const spTreeMatch = xml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/);
  const shapesToCheck = spTreeMatch ? spTreeMatch[1] : xml;
  const shapeMatches = shapesToCheck.match(/<p:sp>([\s\S]*?)<\/p:sp>/g) || [];
  
  for (let i = 0; i < shapeMatches.length; i++) {
    const shapeXml = shapeMatches[i];
    const textMatches = shapeXml.match(/<a:t>([^<]*)<\/a:t>/g);
    
    if (!textMatches || textMatches.length === 0) continue;
    
    const textContent = textMatches.map(t => t.replace(/<[^>]+>/g, '')).join(' ');
    if (!textContent.trim()) continue;
    
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

    let shapeName = `text_${i}`;
    const cNvPrMatch = shapeXml.match(/<p:cNvPr\s+id="\d+"\s+name="([^"]+)"/);
    if (cNvPrMatch) shapeName = cNvPrMatch[1];

    let fontSize = 14;
    let fontBold = false;
    let fontColor = '#333333';
    let textAlign = 'left';

    const txBodyMatch = shapeXml.match(/<p:txBody[^>]*>([\s\S]*?)<\/p:txBody>/);
    if (txBodyMatch && txBodyMatch[1]) {
      const txBody = txBodyMatch[1];
      
      const rPrOpenMatch = txBody.match(/<a:rPr([^>]*)>/);
      if (rPrOpenMatch && rPrOpenMatch[1]) {
        const rPrAttrs = rPrOpenMatch[1];
        const szMatch = rPrAttrs.match(/sz="(\d+)"/);
        if (szMatch) fontSize = parseInt(szMatch[1]) / 100;
        if (rPrAttrs.includes('b="1"') || rPrAttrs.includes('b="true"')) fontBold = true;
      }
      
      const colorMatches = txBody.match(/<a:srgbClr val="([^"]+)"/);
      if (colorMatches) {
        fontColor = '#' + colorMatches[1];
      } else {
        const schemeMatch = txBody.match(/<a:schemeClr val="([^"]+)"/);
        if (schemeMatch) {
          const schemeMap = { tx1: '#000000', tx2: '#44546a', tx3: '#4472c4' };
          fontColor = schemeMap[schemeMatch[1]] || '#333333';
        }
      }
      
      const pPrMatch = txBody.match(/<a:pPr([^>]*)/);
      if (pPrMatch && pPrMatch[1]) {
        const algnMatch = pPrMatch[1].match(/algn="(\w+)"/);
        if (algnMatch) textAlign = algnMatch[1];
      }
    }

    const area = bounds.w * bounds.h;
    const maxChars = Math.floor(area * 5);
    
    slide.elements.push({
      id: `slide${slideIndex}-elem${i}`,
      shapeName,
      text: textContent,
      bounds,
      fontSize,
      fontBold,
      fontColor,
      textAlign,
      maxChars
    });
  }

  return slide;
}

function getPresetColor(name) {
  const colors = { white: '#FFFFFF', black: '#000000', red: '#FF0000', green: '#00FF00', blue: '#0000FF', yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF', gray: '#808080' };
  return colors[name] || '#FFFFFF';
}

function replacePlaceholders(content, jsonData, recordData, tags, slideIndex, recordSlideIndex) {
  const slideTags = tags.filter(t => t.slideIndex === slideIndex);
  
  const escapeXml = (str) => {
    if (!str) return '';
    return str.replace(/&(?!(amp|lt|gt|apos|quot);)/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
  };
  
  const findValue = (key) => {
    const source = recordData || jsonData;
    if (source[key] !== undefined) return source[key];
    
    const keyBase = key.replace(/_20\d{2}.*$/, '').replace(/_session.*$/, '').replace(/_steerco.*$/, '').replace(/_roadmap.*$/, '').replace(/_product.*$/, '').replace(/_tax.*$/, '').replace(/_solon.*$/, '');
    
    for (const k of Object.keys(source)) {
      if (k.includes(key) || key.includes(k) || k.replace(/_20\d{2}.*$/, '').replace(/_session.*$/, '').replace(/_steerco.*$/, '').replace(/_roadmap.*$/, '').replace(/_product.*$/, '').replace(/_tax.*$/, '').replace(/_solon.*$/, '') === keyBase) {
        return source[k];
      }
    }
    return undefined;
  };
  
  const result = content.replace(/<a:t>([^<]*)<\/a:t>/g, (match, text) => {
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
  
  return result;
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});