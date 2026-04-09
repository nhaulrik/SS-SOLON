import express from 'express';
import cors from 'cors';
import admZip from 'adm-zip';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const TEMP_DIR = path.join(__dirname, 'temp');
const OUTPUT_DIR = path.join(__dirname, 'output');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// UC-01: Upload and parse PPTX
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
  const slide = {
    index: slideIndex,
    elements: []
  };

  // Match all text elements (a:t tags) with their shapes
  const shapeMatches = xml.match(/<p:sp>([\s\S]*?)<\/p:sp>/g) || [];
  
  for (let i = 0; i < shapeMatches.length; i++) {
    const shapeXml = shapeMatches[i];
    const textMatches = shapeXml.match(/<a:t>([^<]*)<\/a:t>/g);
    
    if (textMatches && textMatches.length > 0) {
      const textContent = textMatches.map(t => t.replace(/<[^>]+>/g, '')).join(' ');
      
      // Get shape position for potential rendering
      let bounds = { x: 0, y: 0, w: 100, h: 50 };
      const xfrmMatch = shapeXml.match(/<p:xfrm>([\s\S]*?)<\/p:xfrm>/);
      if (xfrmMatch) {
        const offMatch = xfrmMatch[0].match(/<a:off x="(\d+)" y="(\d+)"/);
        const extMatch = xfrmMatch[0].match(/<a:ext cx="(\d+)" cy="(\d+)"/);
        if (offMatch && extMatch) {
          bounds = {
            x: Math.round(parseInt(offMatch[1]) / 10000),
            y: Math.round(parseInt(offMatch[2]) / 10000),
            w: Math.round(parseInt(extMatch[1]) / 10000),
            h: Math.round(parseInt(extMatch[2]) / 10000)
          };
        }
      }

      // Get shape name
      let shapeName = `element_${slide.elements.length}`;
      const cNvPrMatch = shapeXml.match(/<p:cNvPr id="\d+" name="([^"]+)"/);
      if (cNvPrMatch) {
        shapeName = cNvPrMatch[1];
      }

      slide.elements.push({
        id: `slide${slideIndex}-elem${i}`,
        shapeName,
        text: textContent,
        bounds,
        index: i
      });
    }
  }

  return slide;
}

// Generate recipe prompt (UC-04)
app.post('/api/generate-recipe', (req, res) => {
  try {
    const { tags, recordSlideIndex } = req.body;
    
    let recipe = `Return a JSON object with the following structure. Do not include any explanation — return only the JSON.\n\n{\n`;
    
    const rootFields = tags.filter(t => t.slideIndex !== recordSlideIndex);
    const recordFields = tags.filter(t => t.slideIndex === recordSlideIndex);
    
    // Root level fields
    rootFields.forEach((tag, idx) => {
      const comma = idx < rootFields.length - 1 || recordFields.length > 0 ? ',' : '';
      const hint = tag.hint ? ` // ${tag.hint}` : '';
      recipe += `  "${tag.key}": "..."${hint}${comma}\n`;
    });
    
    // Record slide as array
    if (recordSlideIndex !== null && recordFields.length > 0) {
      recipe += `  "records": [\n    {\n`;
      recordFields.forEach((tag, idx) => {
        const comma = idx < recordFields.length - 1 ? ',' : '';
        const hint = tag.hint ? ` // ${tag.hint}` : '';
        recipe += `      "${tag.key}": "..."${hint}${comma}\n`;
      });
      recipe += `    }\n    // repeat for each item\n  ]\n`;
    }
    
    recipe += `}`;
    
    res.json({ ok: true, recipe });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Validate JSON (UC-05)
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
    
    // Check root fields
    const rootTags = tags.filter(t => t.slideIndex !== recordSlideIndex);
    rootTags.forEach(tag => {
      if (data[tag.key] !== undefined) {
        foundFields.push(tag.key);
      } else {
        missingFields.push(tag.key);
      }
    });
    
    // Check record fields
    const recordTags = tags.filter(t => t.slideIndex === recordSlideIndex);
    if (recordSlideIndex !== null && Array.isArray(data.records)) {
      data.records.forEach((record, idx) => {
        recordTags.forEach(tag => {
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
      valid: true,
      error: null,
      foundFields,
      missingFields,
      recordCount: data.records ? data.records.length : 0
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Preview and Generate (UC-06, UC-07)
app.post('/api/generate-pptx', (req, res) => {
  try {
    const { templatePath, tags, jsonData, recordSlideIndex } = req.body;
    
    if (!templatePath || !fs.existsSync(templatePath)) {
      return res.status(400).json({ error: 'Template not found' });
    }
    
    const zip = new admZip(templatePath);
    const slideEntries = zip.getEntries().filter(e => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/));
    
    const sortedEntries = slideEntries.sort((a, b) => {
      const numA = parseInt(a.entryName.match(/slide(\d+)\.xml/)[1]);
      const numB = parseInt(b.entryName.match(/slide(\d+)\.xml/)[1]);
      return numA - numB;
    });
    
    // Map tags by element ID for quick lookup
    const tagMap = {};
    tags.forEach(tag => {
      tagMap[tag.elementId] = tag.key;
    });
    
    // Replace placeholders in each slide
    const generatedSlides = [];
    const recordTag = tags.find(t => t.slideIndex === recordSlideIndex);
    
    for (let slideIdx = 0; slideIdx < sortedEntries.length; slideIdx++) {
      const entry = sortedEntries[slideIdx];
      let content = entry.getData().toString('utf8');
      
      // Check if this is the record slide
      const isRecordSlide = slideIdx + 1 === recordSlideIndex;
      
      if (isRecordSlide && jsonData.records && jsonData.records.length > 0) {
        // Generate multiple copies of this slide
        jsonData.records.forEach((record, recordIdx) => {
          const slideContent = replacePlaceholders(content, jsonData, record, tags, slideIdx + 1);
          generatedSlides.push({ slideIndex: slideIdx + 1, recordIndex: recordIdx + 1, content: slideContent });
        });
      } else if (!isRecordSlide) {
        // Regular slide - just replace with root level data
        const slideContent = replacePlaceholders(content, jsonData, null, tags, slideIdx + 1);
        generatedSlides.push({ slideIndex: slideIdx + 1, recordIndex: null, content: slideContent });
      }
    }
    
    // If no record slide, just use all original slides with replacement
    if (recordSlideIndex === null) {
      for (const entry of sortedEntries) {
        let content = entry.getData().toString('utf8');
        const slideIdx = parseInt(entry.entryName.match(/slide(\d+)\.xml/)[1]);
        content = replacePlaceholders(content, jsonData, null, tags, slideIdx);
        generatedSlides.push({ slideIndex: slideIdx, recordIndex: null, content });
      }
    }
    
    // Write the modified slides back (replacing in order)
    // This is a simplified version - in production you'd rebuild properly
    const outputSlides = sortedEntries.map((entry, idx) => {
      const gen = generatedSlides.find(g => g.slideIndex === idx + 1 && g.recordIndex === null);
      if (gen) {
        return { entry, content: gen.content };
      }
      return { entry, content: entry.getData().toString('utf8') };
    });
    
    // For preview, return the modified slide data
    const previewData = generatedSlides.map(gs => ({
      slideNumber: gs.slideIndex,
      recordIndex: gs.recordIndex,
      content: gs.content
    }));
    
    // For download, create the file
    outputSlides.forEach(({ entry, content }) => {
      entry.setData(Buffer.from(content, 'utf8'));
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

function replacePlaceholders(content, jsonData, recordData, tags, slideIndex) {
  const slideTags = tags.filter(t => t.slideIndex === slideIndex);
  
  return content.replace(/<a:t>([^<]*)<\/a:t>/g, (match, text) => {
    // Check if this text was tagged
    const tag = slideTags.find(t => text.includes(`{{${t.key}}}`));
    
    if (tag) {
      // Replace with actual data
      let value;
      if (recordData && tag.slideIndex === recordSlideIndex) {
        value = recordData[tag.key] || '';
      } else {
        value = jsonData[tag.key] || '';
      }
      return `<a:t>${value}</a:t>`;
    }
    
    return match;
  });
}

// Download generated file
app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(OUTPUT_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});