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
    const { tags, recordSlideIndex } = req.body;
    
    const rootFields = tags.filter(t => t.slideIndex !== recordSlideIndex);
    const recordFields = tags.filter(t => t.slideIndex === recordSlideIndex);
    
    const generateFields = [];
    const hints = {};
    
    [...rootFields, ...recordFields].forEach(tag => {
      if (tag.autoGenerate) {
        generateFields.push(tag.key);
        if (tag.hint) {
          if (tag.maxChars && tag.maxChars > 0) {
            hints[tag.key] = `${tag.hint}, max ${tag.maxChars} chars`;
          } else {
            hints[tag.key] = tag.hint;
          }
        }
      }
    });
    
    let recipe = `INSTRUCTIONS:
- Return ONLY valid JSON, no explanations or markdown
- Strictly follow the JSON structure below
- Use EXACT key names as provided - do NOT abbreviate or modify key names

JSON STRUCTURE:\n{\n`;
    
    if (generateFields.length > 0) {
      recipe += `  "_instructions": {\n`;
      recipe += `    "generate_fields": ${JSON.stringify(generateFields)},\n`;
      recipe += `    "hints": ${JSON.stringify(hints)}\n`;
      recipe += `  }\n`;
    }
    
    recipe += `}`;
    
    res.json({ ok: true, recipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UC-05: Validate JSON
app.post('/api/validate-json', (req, res) => {
  try {
    const { jsonString, tags, recordSlideIndex } = req.body;
    
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
    const rootGenerateTags = generateOnlyTags.filter(t => t.slideIndex !== recordSlideIndex);
    const recordGenerateTags = generateOnlyTags.filter(t => t.slideIndex === recordSlideIndex);
    
    rootGenerateTags.forEach(tag => {
      if (data[tag.key] !== undefined) {
        foundFields.push(tag.key);
      } else {
        missingFields.push(tag.key);
      }
    });
    
    if (recordSlideIndex !== null && Array.isArray(data.records)) {
      data.records.forEach((record, idx) => {
        recordGenerateTags.forEach(tag => {
          if (record[tag.key] !== undefined) {
            if (!foundFields.includes(`${tag.key} (record ${idx + 1})`)) {
              foundFields.push(`${tag.key} (record ${idx + 1})`);
            }
          } else {
            if (!missingFields.includes(`${tag.key} (record ${idx + 1})`)) {
              missingFields.push(`${tag.key} (record ${idx + 1})`);
            }
          }
        });
      });
    }
    
    res.json({
      valid: missingFields.length === 0,
      error: null,
      foundFields,
      missingFields,
      recordCount: data.records ? data.records.length : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UC-06: Generate PPTX
app.post('/api/generate-pptx', (req, res) => {
  try {
    const { templatePath, tags, jsonData, recordSlideIndex } = req.body;
    
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
    
    // Replace with JSON data
    const generatedSlides = [];
    for (let slideIdx = 0; slideIdx < sortedEntries.length; slideIdx++) {
      let content = baseContent[slideIdx + 1];
      const slideNum = slideIdx + 1;
      const isRecordSlide = slideNum === recordSlideIndex;
      
      if (isRecordSlide && jsonData.records && jsonData.records.length > 0) {
        jsonData.records.forEach((record, recordIdx) => {
          const slideContent = replacePlaceholders(content, jsonData, record, tags, slideNum, recordSlideIndex);
          generatedSlides.push({ slideIndex: slideNum, recordIndex: recordIdx + 1, content: slideContent });
        });
      } else if (!isRecordSlide) {
        const slideContent = replacePlaceholders(content, jsonData, null, tags, slideNum, recordSlideIndex);
        generatedSlides.push({ slideIndex: slideNum, recordIndex: null, content: slideContent });
      }
    }
    
    // Output slides
    const outputEntries = sortedEntries.map((entry, idx) => {
      const slideNum = idx + 1;
      const gen = generatedSlides.find(g => g.slideIndex === slideNum && g.recordIndex === 1) 
        || generatedSlides.find(g => g.slideIndex === slideNum && g.recordIndex === null);
      const content = gen ? gen.content : (baseContent[slideNum] || entry.getData().toString('utf8'));
      return { entry, content };
    });
    
    const previewData = generatedSlides.map(gs => {
      const content = gs.content || '';
      let elements = { elements: [] };
      try {
        elements = extractSlideElements(content, gs.slideIndex);
      } catch (e) {}
      
      const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const sampleText = textMatches.slice(0, 3).map(t => t.replace(/<[^>]+>/g, ''));
      
      return {
        slideNumber: gs.slideIndex,
        recordIndex: gs.recordIndex,
        content: gs.content,
        elements: elements.elements,
        background: elements.background,
        sampleText
      };
    });
    
    outputEntries.forEach(({ entry, content }) => {
      if (content && entry) {
        entry.setData(Buffer.from(content, 'utf8'));
      }
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
    console.log('PATCHES_DIR:', PATCHES_DIR);
    if (!fs.existsSync(PATCHES_DIR)) {
      console.log('Patches dir does not exist');
      return res.json([]);
    }
    const files = fs.readdirSync(PATCHES_DIR);
    console.log('Files:', files);
    const patches = files.filter(f => f.endsWith('.json')).map(f => {
      const data = fs.readFileSync(path.join(PATCHES_DIR, f), 'utf8');
      return JSON.parse(data);
    });
    res.json(patches);
  } catch (err) {
    console.error('Error:', err);
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
        return `<a:t>${value || ''}</a:t>`;
      } else {
        return `<a:t>${tag.originalText || ''}</a:t>`;
      }
    }
    
    return match;
  });
  
  return result;
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});