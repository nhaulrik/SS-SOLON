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
const CHAINS_DIR = path.join(PROJECT_ROOT, 'patch-chains');
const EMU_PER_INCH = 914400;

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(PATCHES_DIR)) fs.mkdirSync(PATCHES_DIR, { recursive: true });
if (!fs.existsSync(CHAINS_DIR)) fs.mkdirSync(CHAINS_DIR, { recursive: true });

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
    const { tags, repeatableSlides, globalPrompt } = req.body;
    
    // Build global prompt section if provided
    const globalPromptSection = globalPrompt 
      ? `GLOBAL GUIDANCE:\n${globalPrompt}\n\n`
      : '';
    
    // Separate static fields (non-repeatable slides) from repeatable slide fields
    const repeatableSlideIndices = new Set((repeatableSlides || []).map(r => r.slideIndex));
    const allStaticFields = tags.filter(t => !repeatableSlideIndices.has(t.slideIndex));

    // Detect shared keys: a key used on more than one distinct static slide
    const keyToSlides = {};
    allStaticFields.forEach(t => {
      if (!keyToSlides[t.key]) keyToSlides[t.key] = [];
      if (!keyToSlides[t.key].includes(t.slideIndex)) keyToSlides[t.key].push(t.slideIndex);
    });
    const sharedKeys = new Set(
      Object.entries(keyToSlides).filter(([, slides]) => slides.length > 1).map(([k]) => k)
    );

    // Split static fields into truly-static (one slide) and contextual (multiple slides)
    const staticFields = allStaticFields.filter(t => !sharedKeys.has(t.key));
    const contextualFields = allStaticFields.filter(t => sharedKeys.has(t.key));

    // Get fields for each repeatable slide
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

    // Static fields section
    if (staticFields.length > 0) {
      staticFields.forEach(tag => {
        const hint = tag.hint || `value for ${tag.key}`;
        const maxCharsStr = tag.maxChars ? ` (max ${tag.maxChars} chars)` : '';
        const autoGen = tag.autoGenerate ? ' [AI]' : '';
        recipe += `    "${tag.key}": "${hint}${maxCharsStr}"${autoGen},\n`;
      });
    }

    recipe += `  },\n`;

    // Contextual fields section — same key, different slide-specific values
    if (contextualFields.length > 0) {
      recipe += `\n2. CONTEXTUAL FIELDS (same field type, slide-specific content — generate one value per slide):\n`;
      recipe += `"contextual": [\n`;
      recipe += `  // Each entry: { "slide_index": N, "field_key": "generated value" }\n`;

      // Group by key for readability
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

    // Repeatable slides section
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

    // Detect shared keys among static (non-repeatable) auto-generate tags
    const allStaticTags = generateOnlyTags.filter(t => !repeatableSet.has(t.slideIndex));
    const keyToSlides = {};
    allStaticTags.forEach(t => {
      if (!keyToSlides[t.key]) keyToSlides[t.key] = [];
      if (!keyToSlides[t.key].includes(t.slideIndex)) keyToSlides[t.key].push(t.slideIndex);
    });
    const sharedKeys = new Set(
      Object.entries(keyToSlides).filter(([, slides]) => slides.length > 1).map(([k]) => k)
    );

    // Validate truly-static fields (under "static" key)
    const staticData = data.static || data;
    const staticTags = allStaticTags.filter(t => !sharedKeys.has(t.key));
    staticTags.forEach(tag => {
      if (staticData[tag.key] !== undefined) {
        foundFields.push(tag.key);
      } else {
        missingFields.push(tag.key);
      }
    });

    // Validate contextual fields (under "contextual" array)
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

    const { zip, previewData } = buildPptxZip(templatePath, tags, jsonData, repeatableSlides);
    const outputPath = path.join(OUTPUT_DIR, `generated-${Date.now()}.pptx`);
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

// ========================
// Patch Chain Endpoints
// ========================

// Create a new chain — copies the uploaded temp file into a permanent chain folder
app.post('/api/patch-chains', (req, res) => {
  try {
    const { templatePath, pptxFileName } = req.body;
    if (!templatePath || !fs.existsSync(templatePath)) {
      return res.status(400).json({ error: 'Template file not found' });
    }
    const chainId = `chain-${Date.now()}`;
    const chainDir = path.join(CHAINS_DIR, chainId);
    fs.mkdirSync(chainDir, { recursive: true });
    fs.copyFileSync(templatePath, path.join(chainDir, 'original.pptx'));
    const chain = {
      id: chainId,
      pptxFileName: pptxFileName || 'template.pptx',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rounds: []
    };
    fs.writeFileSync(path.join(chainDir, 'chain.json'), JSON.stringify(chain, null, 2));
    res.json({ ok: true, chainId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply a patch round to the chain's current base file, produce next intermediate
app.post('/api/patch-chains/:chainId/apply', (req, res) => {
  try {
    const { chainId } = req.params;
    const { tags, jsonData, repeatableSlides, roundName, focus } = req.body;
    const chainDir = path.join(CHAINS_DIR, chainId);
    const chainPath = path.join(chainDir, 'chain.json');
    if (!fs.existsSync(chainPath)) {
      return res.status(404).json({ error: 'Chain not found' });
    }
    const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
    const appliedCount = chain.rounds.filter(r => r.status === 'applied').length;
    const baseFile = appliedCount === 0 ? 'original.pptx' : chain.rounds.filter(r => r.status === 'applied').slice(-1)[0].outputFile;
    const basePath = path.join(chainDir, baseFile);
    const originalBase = path.basename(chain.pptxFileName, '.pptx');
    const outputFile = `${originalBase}-patch-${appliedCount + 1}.pptx`;
    const outputPath = path.join(chainDir, outputFile);
    if (!fs.existsSync(basePath)) {
      return res.status(400).json({ error: `Base file not found: ${baseFile}` });
    }
    const { zip, previewData } = buildPptxZip(basePath, tags || [], jsonData || {}, repeatableSlides || []);
    zip.writeZip(outputPath);
    const round = {
      id: `round-${appliedCount + 1}`,
      name: roundName || `Patch ${appliedCount + 1}`,
      focus: focus || 'mixed',
      status: 'applied',
      baseFile,
      outputFile,
      tags: tags || [],
      repeatableSlides: repeatableSlides || [],
      appliedAt: new Date().toISOString()
    };
    chain.rounds.push(round);
    chain.updatedAt = new Date().toISOString();
    fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2));
    res.json({
      ok: true,
      chainId,
      roundId: round.id,
      outputFile,
      nextBasePath: outputPath,
      previewData,
      downloadUrl: `/api/patch-chains/${chainId}/download/${outputFile}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve an intermediate or original file from a chain (for download)
app.get('/api/patch-chains/:chainId/download/:filename', (req, res) => {
  const filePath = path.join(CHAINS_DIR, req.params.chainId, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath);
});

// Parse a PPTX from a server-side path (used to load the next round's Tag step from an intermediate)
app.post('/api/parse-pptx-from-path', (req, res) => {
  try {
    const { filePath } = req.body;
    const resolved = path.resolve(filePath);
    // Only allow paths within CHAINS_DIR
    if (!resolved.startsWith(path.resolve(CHAINS_DIR))) {
      return res.status(403).json({ error: 'Invalid path' });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const buffer = fs.readFileSync(resolved);
    const zip = new admZip(buffer);
    const slides = parseSlides(zip);
    res.json({ ok: true, filePath: resolved, slides });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shared PPTX generation logic. Returns { zip, previewData }.
// Caller is responsible for writing zip to the desired output path.
function buildPptxZip(templatePath, tags, jsonData, repeatableSlides) {
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

  // Generate slides from JSON data by structure_type
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

  // Include static slides (non-repeatable)
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
    try { elements = extractSlideElements(content, gs.slideIndex); } catch (e) {}
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

  const bgSchemeMap = {
    dk1: '#000000', dk2: '#44546A', lt1: '#FFFFFF', lt2: '#E7E6E6',
    accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A9D18E',
    accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47',
    bg1: '#FFFFFF', bg2: '#E7E6E6'
  };
  const bgMatch = xml.match(/<p:bg>([\s\S]*?)<\/p:bg>/);
  if (bgMatch) {
    const srgbMatch = bgMatch[1].match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
    if (srgbMatch) {
      slide.background = '#' + srgbMatch[1];
    } else {
      const schemeMatch = bgMatch[1].match(/<a:schemeClr val="([^"]+)"/);
      if (schemeMatch) {
        slide.background = bgSchemeMap[schemeMatch[1]] || '#FFFFFF';
      } else {
        const prstMatch = bgMatch[1].match(/<a:prstClr val="(\w+)"/);
        if (prstMatch) slide.background = getPresetColor(prstMatch[1]);
      }
    }
  }

  const spTreeMatch = xml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/);
  const shapesToCheck = spTreeMatch ? spTreeMatch[1] : xml;
  const shapeMatches = shapesToCheck.match(/<p:sp>([\s\S]*?)<\/p:sp>/g) || [];
  
  // Full Office theme palette (defined once, used by resolveColor below)
  const schemeMap = {
    dk1: '#000000', dk2: '#44546A',
    lt1: '#FFFFFF', lt2: '#E7E6E6',
    accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A9D18E',
    accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47',
    tx1: '#000000', tx2: '#44546A',
    bg1: '#FFFFFF', bg2: '#E7E6E6',
    hlink: '#0563C1', folHlink: '#954F72'
  };

  const resolveColor = (xml) => {
    const srgb = xml.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
    if (srgb) return '#' + srgb[1];
    const scheme = xml.match(/<a:schemeClr val="([^"]+)"/);
    if (scheme) return schemeMap[scheme[1]] || '#333333';
    return null;
  };

  for (let i = 0; i < shapeMatches.length; i++) {
    const shapeXml = shapeMatches[i];

    // --- Extract bounds (needed for both rect and text elements) ---
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

    // --- Extract shape fill and border (needed for both rect and text elements) ---
    let shapeFill = null;
    let shapeBorder = null;
    const spPrMatch2 = shapeXml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/);
    if (spPrMatch2) {
      const spPr = spPrMatch2[1];

      // Solid fill
      const solidFillMatch = spPr.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
      if (solidFillMatch) {
        shapeFill = resolveColor(solidFillMatch[1]);
      } else {
        // Gradient: use the first stop colour as an approximation
        const gradStopMatch = spPr.match(/<a:gs\s+pos="\d+">([\s\S]*?)<\/a:gs>/);
        if (gradStopMatch) shapeFill = resolveColor(gradStopMatch[1]);
      }

      // Border / outline  (<a:ln w="EMUs">)
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
      // No text: emit a rect element only if it has a fill or border (otherwise invisible — skip)
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

      // Vertical alignment from <a:bodyPr anchor="">
      const bodyPrMatch = txBody.match(/<a:bodyPr([^>]*)/);
      if (bodyPrMatch) {
        const anchorMatch = bodyPrMatch[1].match(/anchor="(\w+)"/);
        if (anchorMatch) verticalAlign = anchorMatch[1];
      }

      // Paragraph alignment from first <a:pPr>
      const pPrMatch = txBody.match(/<a:pPr([^>]*)/);
      if (pPrMatch) {
        const algnMatch = pPrMatch[1].match(/algn="(\w+)"/);
        if (algnMatch) textAlign = algnMatch[1];
      }

      // Font properties from first <a:rPr>; fall back to <a:defRPr>
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

      // If no color found in rPr, try defRPr
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

    // Dynamic max chars calculation based on metric system
    // Uses element dimensions (in inches) and font size (in points)
    // Average char width ~0.55x font size, line height ~1.2x font size
    // 1 inch = 72 points
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

  // For contextual fields: find the entry in jsonData.contextual whose slide_index matches
  const contextualEntry = !recordData && Array.isArray(jsonData.contextual)
    ? jsonData.contextual.find(c => c.slide_index === slideIndex)
    : null;

  const findValue = (key) => {
    // Contextual lookup takes priority over static for shared keys on this slide
    if (contextualEntry && contextualEntry[key] !== undefined) return contextualEntry[key];

    const source = recordData || jsonData.static || jsonData;
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