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

export function buildRecipe(tags, repeatableSlides, globalPrompt) {
  const globalPromptSection = globalPrompt ? `GLOBAL GUIDANCE:\n${globalPrompt}\n\n` : '';

  const repeatableSlideIndices = new Set((repeatableSlides || []).map(r => r.slideIndex));
  const allStaticFields = tags.filter(t => !repeatableSlideIndices.has(t.slideIndex));
  const sharedKeys = detectSharedKeys(tags, repeatableSlideIndices);

  const staticFields    = allStaticFields.filter(t => !sharedKeys.has(t.key));
  const contextualFields = allStaticFields.filter(t =>  sharedKeys.has(t.key));
  const repeatableFields = (repeatableSlides || []).map(r => ({
    slideIndex:    r.slideIndex,
    structureType: r.structureType || `slide_${r.slideIndex}`,
    customPrompt:  r.customPrompt || '',
    fields:        tags.filter(t => t.slideIndex === r.slideIndex)
  }));

  let recipe = `INSTRUCTIONS:
- Return ONLY valid JSON, no explanations or markdown
- Use EXACT key names as provided - do NOT abbreviate or modify key names

${globalPromptSection}GENERATE THE FOLLOWING DATA:

1. STATIC FIELDS (one value per field):
{
  "static": {
`;

  staticFields.forEach(tag => {
    const hint        = tag.hint || `value for ${tag.key}`;
    const maxCharsStr = tag.maxChars ? ` (max ${tag.maxChars} chars)` : '';
    const autoGen     = tag.autoGenerate ? ' [AI]' : '';
    recipe += `    "${tag.key}": "${hint}${maxCharsStr}"${autoGen},\n`;
  });

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
          const hint        = tag.hint || `value for ${key} on slide ${tag.slideIndex}`;
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
      const dataKey   = rf.structureType;
      const isLast    = idx === repeatableFields.length - 1;
      const genFields = rf.fields.filter(t => t.autoGenerate);

      recipe += `  "${dataKey}": [\n`;
      recipe += `    // CUSTOM PROMPT: ${rf.customPrompt || 'instances of this slide type'}\n`;
      recipe += `    {\n`;
      recipe += `      "structure_type": "${rf.structureType}",\n`;
      genFields.forEach(tag => {
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

export function validateJsonData(jsonString, tags, repeatableSlides) {
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

  const staticData  = data.static || data;
  const staticTags  = allStaticTags.filter(t => !sharedKeys.has(t.key));
  staticTags.forEach(tag => {
    if (staticData[tag.key] !== undefined) foundFields.push(tag.key);
    else missingFields.push(tag.key);
  });

  const contextualData  = data.contextual || [];
  const contextualTags  = allStaticTags.filter(t => sharedKeys.has(t.key));
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
