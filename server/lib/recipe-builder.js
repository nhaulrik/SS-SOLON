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

export function buildRecipe(tags, repeatableSlides, globalPrompt, propagations = []) {
  const globalPromptSection = globalPrompt ? `GLOBAL GUIDANCE:\n${globalPrompt}\n\n` : '';

  const repeatableSlideIndices = new Set((repeatableSlides || []).map(r => r.slideIndex));
  const allStaticFields = tags.filter(t => !repeatableSlideIndices.has(t.slideIndex) && t.autoGenerate);
  const sharedKeys = detectSharedKeys(tags, repeatableSlideIndices);

  // Shared keys with non-unique propagation config are promoted to static
  const nonUniqueKeys = new Set(
    propagations.filter(p => p.mode === 'non-unique').map(p => p.key)
  );
  const uniqueKeys = new Set(
    propagations.filter(p => p.mode === 'unique').map(p => p.key)
  );

  // Non-unique shared keys → static; unique or unconfigured shared keys → contextual
  const staticFields    = allStaticFields.filter(t => !sharedKeys.has(t.key) || nonUniqueKeys.has(t.key));
  const contextualFields = allStaticFields.filter(t =>  sharedKeys.has(t.key) && !nonUniqueKeys.has(t.key));
  const repeatableFields = (repeatableSlides || []).map(r => ({
    slideIndex:    r.slideIndex,
    structureType: r.structureType || `slide_${r.slideIndex}`,
    customPrompt:  r.customPrompt || '',
    fields:        tags.filter(t => t.slideIndex === r.slideIndex && t.autoGenerate)
  })).filter(r => r.fields.length > 0);

  let recipe = `INSTRUCTIONS:
- Return ONLY valid JSON, no explanations or markdown
- Use EXACT key names as provided - do NOT abbreviate or modify key names

${globalPromptSection}GENERATE THE FOLLOWING DATA:
`;

  let sectionNum = 1;

  // Non-unique shared keys appear once per key (not once per slide).
  const seenStaticKeys = new Set();
  const dedupedStaticFields = staticFields.filter(t => {
    if (seenStaticKeys.has(t.key)) return false;
    seenStaticKeys.add(t.key);
    return true;
  });

  if (dedupedStaticFields.length > 0) {
    recipe += `\n${sectionNum}. STATIC FIELDS (one value per field):
{
  "static": {
`;
    dedupedStaticFields.forEach(tag => {
      const hint = tag.hint || `value for ${tag.key}`;
      const maxCharsStr = tag.maxChars ? ` (max ${tag.maxChars} chars)` : '';
      recipe += `    "${tag.key}": "${hint}${maxCharsStr}",\n`;
    });
    recipe += `  },\n`;
    sectionNum++;
  }

  if (contextualFields.length > 0) {
    recipe += `\n${sectionNum}. CONTEXTUAL FIELDS (same field type, slide-specific content — generate one value per slide):\n`;
    recipe += `"contextual": [\n`;

    const byKey = {};
    contextualFields.forEach(t => {
      if (!byKey[t.key]) byKey[t.key] = [];
      byKey[t.key].push(t);
    });

    Object.entries(byKey).forEach(([key, fieldTags]) => {
      fieldTags
        .sort((a, b) => a.slideIndex - b.slideIndex)
        .forEach(tag => {
          const baseHint = tag.hint || `value for ${key} on slide ${tag.slideIndex}`;
          const maxCharsStr = tag.maxChars ? ` (max ${tag.maxChars} chars)` : '';
          const propagationConfig = propagations.find(p => p.key === key);
          const linkedSuffix = (() => {
            if (!uniqueKeys.has(key) || !propagationConfig?.linkedKey) return '';
            // Look up the actual text of the linked element on this specific slide
            // so the AI receives a concrete value rather than an abstract key reference.
            const linkedTag = tags.find(
              t => t.key === propagationConfig.linkedKey && t.slideIndex === tag.slideIndex
            );
            if (!linkedTag?.originalText) return '';
            return `. Context for this slide: "${linkedTag.originalText}"`;
          })();
          recipe += `  { "slide_index": ${tag.slideIndex}, "${key}": "${baseHint}${maxCharsStr}${linkedSuffix}" },\n`;
        });
    });

    recipe += `]\n`;
  }

  const _hasContextual = contextualFields.length > 0;
  const hasRepeatable = repeatableFields.length > 0;
  
  if (hasRepeatable) {
    recipe += `\n${sectionNum}. REPEATABLE SLIDES (generate an array of instances for each slide type):\n`;
    recipe += `"slides": {\n`;

    repeatableFields.forEach((rf, idx) => {
      const dataKey   = rf.structureType;
      const isLast    = idx === repeatableFields.length - 1;
      const genFields = rf.fields;

      recipe += `  "${dataKey}": [\n`;
      recipe += `    {\n`;
      if (rf.customPrompt) recipe += `      "custom_prompt": "${rf.customPrompt}",\n`;
      recipe += `      "structure_type": "${rf.structureType}",\n`;
      genFields.forEach(tag => {
        const hint = tag.hint || `value for ${tag.key}`;
        const maxCharsStr = tag.maxChars ? ` (max ${tag.maxChars} chars)` : '';
        recipe += `      "${tag.key}": "${hint}${maxCharsStr}",\n`;
      });
      recipe += `    }\n`;
      recipe += `  ]${isLast ? '' : ','}\n`;
    });

    recipe += `}\n`;
  }

  recipe += `\nIMPORTANT:\n- static: one value per key\n- contextual: one array entry per slide, each with "slide_index" and the field value\n- slides: array of instances, each with "structure_type" field`;

  return recipe;
}

export function validateJsonData(jsonString, tags, repeatableSlides, propagations = []) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return { valid: false, error: 'Invalid JSON syntax', foundFields: [], missingFields: tags.map(t => t.key) };
  }

  const foundFields  = [];
  const missingFields = [];

  const generateOnlyTags = tags.filter(t => t.autoGenerate);
  const repeatableSet    = new Set((repeatableSlides || []).map(r => r.slideIndex));
  const allStaticTags    = generateOnlyTags.filter(t => !repeatableSet.has(t.slideIndex));
  const sharedKeys       = detectSharedKeys(generateOnlyTags, repeatableSet);

  const nonUniqueKeys = new Set(
    propagations.filter(p => p.mode === 'non-unique').map(p => p.key)
  );

  const staticData  = data.static || data;
  const staticTags  = allStaticTags.filter(t => !sharedKeys.has(t.key) || nonUniqueKeys.has(t.key));
  staticTags.forEach(tag => {
    if (staticData[tag.key] !== undefined) foundFields.push(tag.key);
    else missingFields.push(tag.key);
  });

  const contextualData  = data.contextual || [];
  const contextualTags  = allStaticTags.filter(t => sharedKeys.has(t.key) && !nonUniqueKeys.has(t.key));
  contextualTags.forEach(tag => {
    const entry = contextualData.find(c => c.slide_index === tag.slideIndex);
    if (entry && entry[tag.key] !== undefined) foundFields.push(`${tag.key} (slide ${tag.slideIndex})`);
    else missingFields.push(`${tag.key} (slide ${tag.slideIndex})`);
  });

  const slidesData = data.slides || {};
  (repeatableSlides || []).forEach(repeatable => {
    const dataKey   = repeatable.structureType || `slide_${repeatable.slideIndex}`;
    const instances = slidesData[dataKey];

    if (!Array.isArray(instances) || instances.length === 0) {
      missingFields.push(`${dataKey} (no instances)`);
      return;
    }

    instances.forEach((instance, idx) => {
      if (!instance.structure_type) missingFields.push(`structure_type (${dataKey} instance ${idx + 1})`);
      const slideTags = generateOnlyTags.filter(t => t.slideIndex === repeatable.slideIndex);
      slideTags.forEach(tag => {
        if (instance[tag.key] !== undefined) foundFields.push(`${tag.key} (${dataKey} instance ${idx + 1})`);
        else missingFields.push(`${tag.key} (${dataKey} instance ${idx + 1})`);
      });
    });
  });

  const instanceCount = Object.values(slidesData).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0
  );

  return { valid: missingFields.length === 0, error: null, foundFields, missingFields, instanceCount };
}
