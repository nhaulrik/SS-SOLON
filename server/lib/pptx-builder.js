import admZip from 'adm-zip';
import fs from 'fs';
import { slideNumFrom, slideNumComparator, extractSlideElements } from './slide-parser.js';
import { replacePlaceholders } from './placeholder.js';

export function buildPptxZip(templatePath, tags, jsonData, repeatableSlides) {
  const buffer = fs.readFileSync(templatePath);
  const zip = new admZip(buffer);

  const sortedEntries = zip.getEntries()
    .filter(e => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort(slideNumComparator);

  // Inject placeholders into each slide
  const baseContent = {};
  for (const entry of sortedEntries) {
    let content = entry.getData().toString('utf8');
    const slideNum = parseInt(entry.entryName.match(/slide(\d+)\.xml/)[1]);
    tags.filter(t => t.slideIndex === slideNum).forEach(tag => {
      if (tag.originalText) {
        const escaped = tag.originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp(`<a:t>(${escaped})</a:t>`, 'g'), `<a:t>{{${tag.key}}}</a:t>`);
      }
    });
    baseContent[slideNum] = content;
  }

  // Build repeatable instances
  const slidesData = jsonData.slides || {};
  const structureTypeToTemplate = {};
  (repeatableSlides || []).forEach(r => {
    const st = r.structureType || `slide_${r.slideIndex}`;
    structureTypeToTemplate[st] = { slideIndex: r.slideIndex, content: baseContent[r.slideIndex] };
  });

  const generatedSlides = [];
  Object.entries(slidesData).forEach(([, instances]) => {
    if (!Array.isArray(instances) || instances.length === 0) return;
    instances.forEach((instance, instanceIdx) => {
      const template = structureTypeToTemplate[instance.structure_type];
      if (template) {
        generatedSlides.push({
          slideIndex:    template.slideIndex,
          instanceIndex: instanceIdx + 1,
          structureType: instance.structure_type,
          instanceData:  instance,
          content:       replacePlaceholders(template.content, jsonData, instance, tags, template.slideIndex)
        });
      }
    });
  });

  // Build static slides
  const repeatableSet = new Set((repeatableSlides || []).map(r => r.slideIndex));
  for (let slideNum = 1; slideNum <= sortedEntries.length; slideNum++) {
    if (!repeatableSet.has(slideNum)) {
      generatedSlides.push({
        slideIndex:    slideNum,
        instanceIndex: null,
        content:       replacePlaceholders(baseContent[slideNum], jsonData.static || jsonData, null, tags, slideNum)
      });
    }
  }

  // Interleave repeatable slides by parent-child relationship
  const staticSlides     = generatedSlides.filter(g => g.instanceIndex === null);
  const repeatableList   = generatedSlides.filter(g => g.instanceIndex !== null);

  const tierOrder = [...new Set(
    (repeatableSlides || []).slice().sort((a, b) => a.slideIndex - b.slideIndex)
      .map(r => r.structureType || `slide_${r.slideIndex}`)
  )];

  const stringValues   = (instance) =>
    new Set(Object.values(instance).filter(v => typeof v === 'string' && v.trim() !== ''));
  const tierBuckets    = tierOrder.map(st => repeatableList.filter(s => s.structureType === st));
  const sortedRepeatable = [];
  const placed         = new Set();

  if (tierBuckets.length <= 1) {
    sortedRepeatable.push(...(tierBuckets[0] || []));
  } else {
    tierBuckets[0].forEach(parent => {
      sortedRepeatable.push(parent);
      placed.add(parent);
      const parentValues = stringValues(parent.instanceData);
      tierBuckets.slice(1).forEach(childBucket => {
        childBucket.forEach(child => {
          if (placed.has(child)) return;
          const linked = [...stringValues(child.instanceData)].some(v => parentValues.has(v));
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
      slideRelsTemplates[slideNumFrom(e)] = e.getData().toString('utf8');
    });

  // Delete original slides and _rels
  zip.getEntries().forEach(entry => {
    if (entry.entryName.match(/^ppt\/slides\/slide\d+\.xml$/) ||
        entry.entryName.match(/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/)) {
      zip.deleteEntry(entry.entryName);
    }
  });

  // Add generated slides
  const fallbackRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;

  sortedGenerated.forEach((gs, idx) => {
    const slideNum    = idx + 1;
    const escaped     = (gs.content || '').replace(/&(?!(amp|lt|gt|apos|quot);)/g, '&amp;');
    zip.addFile(`ppt/slides/slide${slideNum}.xml`, Buffer.from(escaped, 'utf8'));
    const sourceRels  = slideRelsTemplates[gs.slideIndex] || slideRelsTemplates[1] || fallbackRels;
    const cleanRels   = sourceRels.replace(/<Relationship[^>]*notesSlide[^>]*\/>/g, '');
    zip.addFile(`ppt/slides/_rels/slide${slideNum}.xml.rels`, Buffer.from(cleanRels, 'utf8'));
  });

  // Update presentation.xml.rels
  const relsEntry = zip.getEntries().find(e => e.entryName === 'ppt/_rels/presentation.xml.rels');
  if (relsEntry) {
    let relsXml = relsEntry.getData().toString('utf8');
    relsXml = relsXml.replace(/<Relationship[^>]*\/officeDocument\/2006\/relationships\/slide"[^>]*\/>/g, '');
    const existingIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1]));
    const maxRId      = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    const newSlideRels = sortedGenerated.map((_, idx) =>
      `<Relationship Id="rId${maxRId + idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${idx + 1}.xml"/>`
    ).join('');
    relsXml = relsXml.replace('</Relationships>', newSlideRels + '</Relationships>');
    relsEntry.setData(Buffer.from(relsXml, 'utf8'));

    const presEntry = zip.getEntries().find(e => e.entryName === 'ppt/presentation.xml');
    if (presEntry) {
      let presXml  = presEntry.getData().toString('utf8');
      const slideIds = sortedGenerated.map((_, idx) =>
        `<p:sldId id="${256 + idx}" r:id="rId${maxRId + idx + 1}"/>`
      ).join('');
      presXml = presXml.replace(
        /<p:sldIdLst[^>]*>[\s\S]*?<\/p:sldIdLst>/,
        `<p:sldIdLst>${slideIds}</p:sldIdLst>`
      );
      presEntry.setData(Buffer.from(presXml, 'utf8'));
    }
  }

  // Update [Content_Types].xml
  const ctEntry = zip.getEntries().find(e => e.entryName === '[Content_Types].xml');
  if (ctEntry) {
    let ctXml = ctEntry.getData().toString('utf8');
    ctXml = ctXml.replace(/<Override PartName="\/ppt\/slides\/slide\d+\.xml"[^>]*\/>/g, '');
    const slideOverrides = sortedGenerated.map((_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    );
    const lastOverrideMatch = ctXml.match(/<Override PartName="(?!\/ppt\/slides\/)[^"]*"[^>]*\/>/g);
    if (lastOverrideMatch) {
      const last = lastOverrideMatch[lastOverrideMatch.length - 1];
      const at   = ctXml.lastIndexOf(last);
      ctXml = ctXml.slice(0, at + last.length) + '\n' + slideOverrides.join('\n') + ctXml.slice(at + last.length);
    } else {
      ctXml = ctXml.replace('</Types>', slideOverrides.join('\n') + '\n</Types>');
    }
    ctEntry.setData(Buffer.from(ctXml, 'utf8'));
  }

  // Build preview data
  const previewData = sortedGenerated.map((gs, idx) => {
    let elements = { elements: [], background: '#ffffff' };
    try { elements = extractSlideElements(gs.content || '', gs.slideIndex); } catch (e) {
      console.error(`[pptx-builder] Failed to parse slide ${gs.slideIndex} for preview:`, e.message);
    }
    const textMatches = (gs.content || '').match(/<a:t>([^<]*)<\/a:t>/g) || [];
    return {
      slideNumber:   idx + 1,
      instanceIndex: gs.instanceIndex,
      content:       gs.content,
      elements:      elements.elements,
      background:    elements.background,
      sampleText:    textMatches.slice(0, 3).map(t => t.replace(/<[^>]+>/g, ''))
    };
  });

  return { zip, previewData };
}
