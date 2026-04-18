/**
 * server/lib/html-recipe-builder.js
 *
 * Recipe generation and JSON validation for the HTML Visual Flow.
 *
 * Zone model:
 *   - block (zoneType:'block') : data-block — AI fills the entire innerHTML
 *
 * Repeatable slides: sections marked repeatable via repeatableSlides[].
 * Each zone on a repeatable slide carries:
 *   - unique:true  → different value per instance (goes into instances array)
 *   - unique:false → same value across all clones (goes into shared object)
 *
 * The recipe structure for repeatable slides:
 *   slides[key].shared    — one value per non-unique zone
 *   slides[key].instances — array of objects, one per slide clone
 *
 * All zones include their full exampleHtml — no truncation.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

const isGenerated = (z) => z.autoGenerate !== false;

/** Check if a zone is ignored directly or is a descendant of an ignored parent. */
function isIgnoredOrDescendantOfIgnored(zone, allZones) {
  if (zone.ignored) return true;
  
  // Check if any ancestor is ignored
  let current = zone;
  while (current.nodeId) {
    // Find the parent by checking if another zone's nodeId is a prefix
    const parent = allZones.find(z => 
      current.nodeId !== z.nodeId && 
      current.nodeId.startsWith(z.nodeId + '>')
    );
    if (!parent) break;
    if (parent.ignored) return true;
    current = parent;
  }
  
  return false;
}

/** Set of slideIndex values that are repeatable. */
function repeatableSlideIndexSet(zones, repeatableSlides = []) {
  if (repeatableSlides.length > 0) {
    return new Set(repeatableSlides.map(rs => rs.slideIndex));
  }
  // Backward compat: derive from zone.isRepeatable flag
  const set = new Set();
  zones.forEach(z => { if (z.isRepeatable) set.add(z.slideIndex); });
  return set;
}



// ── buildHtmlRecipe ───────────────────────────────────────────────────────────

/**
 * Build a recipe prompt string from a zone list.
 *
 * @param {Array}  zones            - Zone objects from parseTemplate / user edits
 * @param {string} globalPrompt     - Optional global guidance prepended to the recipe
 * @param {Array}  repeatableSlides - [{ slideIndex, key, prompt }]
 * @returns {string}
 */
export function buildHtmlRecipe(zones, globalPrompt = '', repeatableSlides = []) {
  const repSet = repeatableSlideIndexSet(zones, repeatableSlides);

  // Build a lookup: slideIndex → repeatableSlide entry
  const repBySlide = new Map();
  repeatableSlides.forEach(rs => repBySlide.set(rs.slideIndex, rs));
  if (repeatableSlides.length === 0) {
    zones.filter(z => z.isRepeatable).forEach(z => {
      if (!repBySlide.has(z.slideIndex)) {
        repBySlide.set(z.slideIndex, {
          slideIndex: z.slideIndex,
          key: `slide_${z.slideIndex}`,
          prompt: '',
        });
      }
    });
  }

   const globalSection = globalPrompt ? `GLOBAL GUIDANCE:\n${globalPrompt}\n\n` : '';

    // Partition zones (all are block zones now, excluding ignored zones and descendants of ignored zones)
    const staticBlockZones = zones.filter(
      z => !repSet.has(z.slideIndex) && isGenerated(z) && !isIgnoredOrDescendantOfIgnored(z, zones)
    );
    const repeatableZones = zones.filter(z => repSet.has(z.slideIndex) && isGenerated(z) && !isIgnoredOrDescendantOfIgnored(z, zones));
    
    // Collect ignored zones (for explicit preservation instructions)
    const ignoredZones = zones.filter(z => isIgnoredOrDescendantOfIgnored(z, zones));

    // Build the output skeleton to show at the top
    let skeletonParts = [];
    if (staticBlockZones.length > 0) {
      skeletonParts.push(`  "blocks": { ${staticBlockZones.map(z => `"${z.key}": {"value": "..."}`).join(', ')} }`);
    }
    if (repeatableZones.length > 0) {
      const slideSkeletons = repeatableSlides.map(rs => `    "${rs.key}": { "instances": [...] }`).join(',\n');
      skeletonParts.push(`  "slides": {\n${slideSkeletons}\n  }`);
    }
    const skeleton = skeletonParts.length > 0 ? `\nREQUIRED OUTPUT SKELETON (your response must match this structure exactly):\n{\n${skeletonParts.join(',\n')}\n}\n` : '';

    let recipe = `INSTRUCTIONS:
- Return ONLY valid JSON, no explanations or markdown
- Use EXACT key names as provided - do NOT abbreviate or modify key names
- Return the full innerHTML string for each zone
- For repeatable slides, return both a "shared" object and an "instances" array
- PRESERVE CONTENT: Do NOT modify or regenerate the content of ignored zones listed below

${skeleton}${globalSection}GENERATE THE FOLLOWING DATA:\n`;

   let sectionNum = 1;

    // ── Ignored zones (preservation instructions) ──────────────────────────────
    if (ignoredZones.length > 0) {
      recipe += `\nZONES_TO_PRESERVE (do NOT regenerate these):\n`;
      ignoredZones.forEach(z => {
        recipe += `- ${z.nodeId || z.key} (preserve as-is)\n`;
      });
      recipe += `\n`;
    }

   // ── Static block zones ────────────────────────────────────────────────────
   if (staticBlockZones.length > 0) {
     recipe += `\n${sectionNum}. BLOCK ZONES (generate full innerHTML for each container):\n{\n  "blocks": {\n`;
     staticBlockZones.forEach(z => {
       const promptLine  = z.prompt    ? `      // Prompt: ${z.prompt}\n` : '';
       const exampleLine = z.exampleHtml
         ? `      // Example structure (populate with real data, preserve all tags and classes):\n      // ${z.exampleHtml.replace(/\n/g, '\n      // ')}\n`
         : '';
       recipe += `    "${z.key}": {  // [HTML BLOCK]\n${promptLine}${exampleLine}      "value": "<!-- your generated HTML here -->"\n    },\n`;
     });
     recipe += `  }\n}\n`;
     sectionNum++;
   }

  // ── Repeatable slides ─────────────────────────────────────────────────────
  if (repeatableZones.length > 0) {
    // Group by slideIndex
    const bySlide = {};
    repeatableZones.forEach(z => {
      if (!bySlide[z.slideIndex]) bySlide[z.slideIndex] = [];
      bySlide[z.slideIndex].push(z);
    });

    Object.entries(bySlide).forEach(([slideIdxStr, slideZones]) => {
      const slideIndex = parseInt(slideIdxStr);
      const repSlide   = repBySlide.get(slideIndex);
      const slideKey   = repSlide?.key || `slide_${slideIndex}`;
      const prompt     = repSlide?.prompt || '';

      // Partition into unique (per-instance) and non-unique (shared)
      const uniqueZones    = slideZones.filter(z => z.unique !== false);
      const nonUniqueZones = slideZones.filter(z => z.unique === false);

       recipe += `\n${sectionNum}. REPEATABLE SLIDE — "${slideKey}":\n`;
       if (prompt) recipe += `PROMPT: "${prompt}"\n`;
       sectionNum++;

       // Shared values (non-unique)
        if (nonUniqueZones.length > 0) {
          recipe += `\n${sectionNum - 1}a. SHARED VALUES (same on every clone — generate once):\n`;
          recipe += `{\n  "slides": {\n    "${slideKey}": {\n      "shared": {\n`;
        nonUniqueZones.forEach(z => {
          const hint = z.hint || `value for ${z.key}`;
          recipe += `        "${z.key}": "[HTML BLOCK]${z.prompt ? ` — ${z.prompt}` : ''}",\n`;
          if (z.exampleHtml) {
            recipe += `        // Example structure (preserve all tags and classes):\n`;
            recipe += `        // ${z.exampleHtml.replace(/\n/g, '\n        // ')}\n`;
          }
        });
        recipe += `      }\n    }\n  }\n}\n`;
      }

       // Instance values (unique)
       if (uniqueZones.length > 0) {
         recipe += `\n${sectionNum - 1}b. INSTANCE VALUES (unique per clone — generate one object per instance):\n`;
         recipe += `CRITICAL: Each instance must include ALL of these keys, every time:\n`;
         uniqueZones.forEach(z => {
           recipe += `  - "${z.key}"\n`;
         });
         recipe += `\nTemplate for each instance:\n{\n`;
         uniqueZones.forEach(z => {
           const hint = z.hint || `value for ${z.key}`;
           recipe += `  "${z.key}": "[HTML BLOCK]${z.prompt ? ` — ${z.prompt}` : ''}",\n`;
         });
         recipe += `}\n`;

         // Block zone example HTML — full, no truncation
         uniqueZones.filter(z => z.exampleHtml).forEach(z => {
           recipe += `\nExample HTML structure for ${z.key} (populate with real data, preserve all tags and classes):\n`;
           recipe += z.exampleHtml + '\n';
         });

           recipe += `\nReturn the full structure as:\n`;
           recipe += `{\n  "slides": {\n    "${slideKey}": {\n`;
           if (nonUniqueZones.length > 0) {
             recipe += `      "shared": { ${nonUniqueZones.map(z => `"${z.key}": "..."`).join(', ')} },\n`;
           }
         recipe += `      "instances": [\n`;
         // Show multiple instance examples to reinforce the pattern
         for (let i = 0; i < Math.min(2, 2); i++) {
           recipe += `        {\n`;
           uniqueZones.forEach(z => {
             recipe += `          "${z.key}": "...",\n`;
           });
           recipe += `        }${i === 1 ? '' : ','}\n`;
         }
         recipe += `        // ... more instances following the same structure ...\n`;
         recipe += `      ]\n    }\n  }\n}\n`;
        }
      });
    }

    recipe += `\nIMPORTANT:
- blocks: innerHTML strings (valid HTML, no surrounding tags)
- slides[key].shared: one value per non-unique key — same on every clone
- slides[key].instances: array of N objects (AI decides N from context)
- CRITICAL: Every instance object MUST include ALL unique keys — NO EXCEPTIONS
- If a key is required in instance[0], it is required in instance[1], instance[2], etc.
- Do NOT omit any key from any instance
- All zone values: valid innerHTML only — no surrounding container tags
- REQUIRED TOP-LEVEL SLIDE KEYS: You MUST include ALL of these in your "slides" object: ${repeatableSlides.map(s => `"${s.key}"`).join(', ')}
- The "slides" object MUST contain ALL of the above keys — missing any key is an error`;

    return recipe;
  }

  // ── generateFullSlideRecipe ───────────────────────────────────────────────────

/**
 * Generate a recipe that includes ALL zones on a specific slide.
 * Used for full-slide content generation (generate all zones at once).
 *
 * @param {Array}  zones            - Zone objects from parseTemplate / user edits
 * @param {number} slideIndex       - Which slide to generate
 * @param {string} globalPrompt     - Optional global guidance
 * @param {Array}  repeatableSlides - [{ slideIndex, key, prompt }]
 * @returns {string}
 */
export function generateFullSlideRecipe(zones, slideIndex, globalPrompt = '', repeatableSlides = []) {
  const repSet = repeatableSlideIndexSet(zones, repeatableSlides);

  // Build a lookup: slideIndex → repeatableSlide entry
  const repBySlide = new Map();
  repeatableSlides.forEach(rs => repBySlide.set(rs.slideIndex, rs));
  if (repeatableSlides.length === 0) {
    zones.filter(z => z.isRepeatable).forEach(z => {
      if (!repBySlide.has(z.slideIndex)) {
        repBySlide.set(z.slideIndex, {
          slideIndex: z.slideIndex,
          key: `slide_${z.slideIndex}`,
          prompt: '',
        });
      }
    });
  }

  const globalSection = globalPrompt ? `GLOBAL GUIDANCE:\n${globalPrompt}\n\n` : '';

  // Get all zones for this slide, excluding ignored zones
  const slideZones = zones.filter(
    z => z.slideIndex === slideIndex && isGenerated(z) && !isIgnoredOrDescendantOfIgnored(z, zones)
  );

  // Get ignored zones on this slide (to preserve their original HTML)
  const ignoredZonesOnSlide = zones.filter(
    z => z.slideIndex === slideIndex && isIgnoredOrDescendantOfIgnored(z, zones)
  );

   if (slideZones.length === 0) {
     return `INSTRUCTIONS:
- Return ONLY valid JSON, no explanations or markdown

${globalSection}ERROR: No zones found on this slide.`;
   }

   // Separate into static and repeatable zones
   const staticZones = slideZones.filter(z => !repSet.has(z.slideIndex));
   const repeatableZonesOnSlide = slideZones.filter(z => repSet.has(z.slideIndex));

   // Build the output skeleton to show at the top
   let skeletonParts = [];
   if (staticZones.length > 0) {
     skeletonParts.push(`  "blocks": { ${staticZones.map(z => `"${z.key}": {"value": "..."}`).join(', ')} }`);
   }
   if (repeatableZonesOnSlide.length > 0) {
     const repSlide = repBySlide.get(slideIndex);
     const slideKey = repSlide?.key || `slide_${slideIndex}`;
     skeletonParts.push(`  "slides": {\n    "${slideKey}": { "instances": [...] }\n  }`);
   }
   const skeleton = skeletonParts.length > 0 ? `\nREQUIRED OUTPUT SKELETON (your response must match this structure exactly):\n{\n${skeletonParts.join(',\n')}\n}\n` : '';

   let recipe = `INSTRUCTIONS:
- Return ONLY valid JSON, no explanations or markdown
- Use EXACT key names as provided - do NOT abbreviate or modify key names
- Return the full innerHTML string for each zone
- For repeatable slides, return both a "shared" object and an "instances" array
- Generate ALL zones for this slide at once
- PRESERVE CONTENT: Do NOT modify or regenerate the content of ignored zones listed below

${skeleton}${globalSection}GENERATE ALL ZONES FOR THIS SLIDE:
`;

  let sectionNum = 1;

  // ── Ignored zones (preservation instructions) ──────────────────────────────
  if (ignoredZonesOnSlide.length > 0) {
    recipe += `\nZONES_TO_PRESERVE (do NOT regenerate these — keep original HTML as-is):\n`;
    ignoredZonesOnSlide.forEach(z => {
      recipe += `- ${z.nodeId || z.key}\n`;
      if (z.exampleHtml) {
        recipe += `  Original HTML:\n  ${z.exampleHtml.replace(/\n/g, '\n  ')}\n`;
      }
    });
    recipe += `\n`;
  }

  // ── Static block zones on this slide ────────────────────────────────────────
  if (staticZones.length > 0) {
    recipe += `\n${sectionNum}. BLOCK ZONES (generate full innerHTML for each container):\n{\n  "blocks": {\n`;
    staticZones.forEach(z => {
      const promptLine  = z.prompt    ? `      // Prompt: ${z.prompt}\n` : '';
      const exampleLine = z.exampleHtml
        ? `      // Example structure (populate with real data, preserve all tags and classes):\n      // ${z.exampleHtml.replace(/\n/g, '\n      // ')}\n`
        : '';
      recipe += `    "${z.key}": {  // [HTML BLOCK]\n${promptLine}${exampleLine}      "value": "<!-- your generated HTML here -->"\n    },\n`;
    });
    recipe += `  }\n}\n`;
    sectionNum++;
  }

   // ── Repeatable zones on this slide ──────────────────────────────────────────
   if (repeatableZonesOnSlide.length > 0) {
     const repSlide = repBySlide.get(slideIndex);
     const slideKey = repSlide?.key || `slide_${slideIndex}`;
     const prompt = repSlide?.prompt || '';

      recipe += `\n${sectionNum}. REPEATABLE SLIDE — "${slideKey}":\n`;
      if (prompt) recipe += `PROMPT: "${prompt}"\n`;

     // Separate unique and non-unique zones
    const uniqueZones    = repeatableZonesOnSlide.filter(z => z.unique !== false);
    const nonUniqueZones = repeatableZonesOnSlide.filter(z => z.unique === false);

    // SHARED VALUES sub-section
    if (nonUniqueZones.length > 0) {
      recipe += `\n${sectionNum}a. SHARED VALUES (same on every clone):\n{\n`;
      nonUniqueZones.forEach(z => {
        const promptLine  = z.prompt    ? `      // Prompt: ${z.prompt}\n` : '';
        const exampleLine = z.exampleHtml
          ? `      // Example: ${z.exampleHtml.replace(/\n/g, ' ')}\n`
          : '';
        recipe += `  "${z.key}": {  // [HTML BLOCK]\n${promptLine}${exampleLine}    "value": "<!-- your generated HTML here -->"\n  },\n`;
      });
      recipe += `}\n`;
    }

     // INSTANCE VALUES sub-section
     if (uniqueZones.length > 0) {
       recipe += `\n${sectionNum}b. INSTANCE VALUES (unique per clone — generate one object per instance):\n`;
       recipe += `CRITICAL: Each instance must include ALL of these keys, every time:\n`;
       uniqueZones.forEach(z => {
         recipe += `  - "${z.key}"\n`;
       });
       recipe += `\nTemplate for each instance:\n{\n`;
       uniqueZones.forEach(z => {
         const promptLine  = z.prompt    ? `  // Prompt: ${z.prompt}\n` : '';
         recipe += `  "${z.key}": "[HTML BLOCK]${promptLine}  ",\n`;
       });
       recipe += `}\n`;

         recipe += `\nReturn the full structure as:\n{\n  "slides": {\n    "${slideKey}": {\n      "instances": [\n`;
        // Show multiple instance examples to reinforce the pattern
        for (let i = 0; i < Math.min(2, 2); i++) {
          recipe += `        {\n`;
          uniqueZones.forEach(z => {
            recipe += `          "${z.key}": "...",\n`;
          });
          recipe += `        }${i === 1 ? '' : ','}\n`;
        }
        recipe += `        // ... more instances following the same structure ...\n`;
        recipe += `      ]\n    }\n  }\n}\n`;
       } else if (nonUniqueZones.length > 0) {
         // Only shared, no instances needed
         recipe += `\nReturn the full structure as:\n{\n  "slides": {\n    "${slideKey}": {\n      "shared": { ... }\n    }\n  }\n}\n`;
        }
     }

    recipe += `\nIMPORTANT:
- blocks: innerHTML strings (valid HTML, no surrounding tags)
- slides[key].shared: one value per non-unique key — same on every clone
- slides[key].instances: array of N objects (AI decides N from context)
- CRITICAL: Every instance object MUST include ALL unique keys — NO EXCEPTIONS
- If a key is required in instance[0], it is required in instance[1], instance[2], etc.
- Do NOT omit any key from any instance
- All zone values: valid innerHTML only — no surrounding container tags
- REQUIRED TOP-LEVEL SLIDE KEYS: You MUST include ALL of these in your "slides" object: ${repeatableSlides.map(s => `"${s.key}"`).join(', ')}
- The "slides" object MUST contain ALL of the above keys — missing any key is an error`;

    return recipe;
  }

  // ── validateFullSlideJson ─────────────────────────────────────────────────────

/**
 * Validate JSON for full-slide content generation.
 * Ensures all zones on the target slide are present in the JSON response.
 *
 * @param {Object} data             - Parsed JSON object
 * @param {Array}  zones            - All zone objects
 * @param {number} slideIndex       - Target slide index
 * @param {Array}  repeatableSlides - [{ slideIndex, key, prompt }]
 * @returns {{ valid, error, foundFields, missingFields, instanceCount }}
 */
function validateFullSlideJson(data, zones, slideIndex, repeatableSlides = []) {
   // Filter zones to only include those with a key property
   const validZones = zones.filter(z => z.key);
   
   const repSet = repeatableSlideIndexSet(validZones, repeatableSlides);

   // Build lookup: slideIndex → repeatableSlide
   const repBySlide = new Map();
   repeatableSlides.forEach(rs => repBySlide.set(rs.slideIndex, rs));
   if (repeatableSlides.length === 0) {
     validZones.filter(z => z.isRepeatable).forEach(z => {
       if (!repBySlide.has(z.slideIndex)) {
         repBySlide.set(z.slideIndex, {
           slideIndex: z.slideIndex,
           key: `slide_${z.slideIndex}`,
           prompt: '',
         });
       }
     });
   }

   const foundFields = [];
   const missingFields = [];

   // Get all zones on this slide (excluding ignored)
   const slideZones = validZones.filter(
     z => z.slideIndex === slideIndex && isGenerated(z) && !isIgnoredOrDescendantOfIgnored(z, validZones)
   );

  if (slideZones.length === 0) {
    return {
      valid: true, // No zones to validate
      error: '',
      foundFields: [],
      missingFields: [],
      instanceCount: 0,
    };
  }

  let instanceCount = 0;

  // Validate static block zones
  const staticZones = slideZones.filter(z => !repSet.has(z.slideIndex));
  const blocksData = data.blocks || {};

  staticZones.forEach(z => {
    const block = blocksData[z.key];
    if (block && (block.value !== undefined || typeof block === 'string')) {
      foundFields.push(`${z.key} (block)`);
    } else {
      missingFields.push(`${z.key} (block)`);
    }
  });

  // Validate repeatable zones
  const repeatableZones = slideZones.filter(z => repSet.has(z.slideIndex));
  if (repeatableZones.length > 0) {
    const repSlide = repBySlide.get(slideIndex);
    const slideKey = repSlide?.key || `slide_${slideIndex}`;
    const slidesData = data.slides || {};
    const slideData = slidesData[slideKey];

     if (!slideData) {
       const foundKeys = Object.keys(slidesData || {});
       const hint = foundKeys.length > 0 ? ` — AI used: ${foundKeys.map(k => `"${k}"`).join(', ')}` : '';
       missingFields.push(`${slideKey} (missing${hint})`);
       return {
         valid: false,
         error: `Missing slide data for "${slideKey}"`,
         foundFields,
         missingFields,
         instanceCount: 0,
       };
     }

    // Detect format: new { shared, instances } vs legacy array
    const isNewFormat = !Array.isArray(slideData) && (slideData.instances !== undefined || slideData.shared !== undefined);

    if (isNewFormat) {
      // New format validation
      const uniqueZones = repeatableZones.filter(z => z.unique !== false);
      const nonUniqueZones = repeatableZones.filter(z => z.unique === false);

      // Validate shared block
      const sharedData = slideData.shared || {};
      nonUniqueZones.forEach(z => {
        if (sharedData[z.key] !== undefined) {
          foundFields.push(`${slideKey}.shared.${z.key}`);
        } else {
          missingFields.push(`${slideKey}.shared.${z.key}`);
        }
      });

      // Validate instances array
      const instances = slideData.instances;
      if (!Array.isArray(instances) || instances.length === 0) {
        if (uniqueZones.length > 0) {
          missingFields.push(`${slideKey}.instances (missing or empty)`);
        }
      } else {
        instanceCount = instances.length;
        instances.forEach((inst, idx) => {
          uniqueZones.forEach(z => {
            if (inst[z.key] !== undefined) {
              foundFields.push(`${slideKey}[${idx + 1}].${z.key}`);
            } else {
              missingFields.push(`${slideKey}[${idx + 1}].${z.key}`);
            }
          });
        });
      }
    } else {
      // Legacy array format
      const instances = Array.isArray(slideData) ? slideData : [];
      instanceCount = instances.length;
      instances.forEach((inst, idx) => {
        repeatableZones.forEach(z => {
          if (inst[z.key] !== undefined) {
            foundFields.push(`${slideKey}[${idx + 1}].${z.key}`);
          } else {
            missingFields.push(`${slideKey}[${idx + 1}].${z.key}`);
          }
        });
      });
    }
  }

  const valid = missingFields.length === 0;
  return {
    valid,
    error: valid ? '' : `Missing fields: ${missingFields.join(', ')}`,
    foundFields,
    missingFields,
    instanceCount,
  };
}

// ── validateHtmlJson ──────────────────────────────────────────────────────────

/**
 * Validate AI-generated JSON against the zone list.
 *
 * Supports both the new { shared, instances } format (when repeatableSlides
 * is provided) and the legacy array format (backward compat).
 *
 * @param {string} jsonString
 * @param {Array}  zones
 * @param {Array}  repeatableSlides - [{ slideIndex, key, prompt }]
 * @param {Object} options - { fullSlide: boolean, slideIndex: number }
 * @returns {{ valid, error, foundFields, missingFields, instanceCount }}
 */
export function validateHtmlJson(jsonString, zones, repeatableSlides = [], options = {}) {
    const { fullSlide = false, slideIndex = null } = options;

    // Filter zones to only include those with a key property
    const validZones = zones.filter(z => z.key);

    let data;
    try {
      data = JSON.parse(jsonString);
    } catch {
      return {
        valid: false,
        error: 'Invalid JSON syntax',
        foundFields: [],
        missingFields: fullSlide
          ? validZones.filter(z => z.slideIndex === slideIndex && isGenerated(z)).map(z => z.key)
          : validZones.filter(z => isGenerated(z)).map(z => z.key),
      };
    }

    // For full-slide validation, only validate zones on that slide
    if (fullSlide && slideIndex !== null) {
      return validateFullSlideJson(data, validZones, slideIndex, repeatableSlides);
    }

    const repSet = repeatableSlideIndexSet(validZones, repeatableSlides);

   // Build lookup: slideIndex → repeatableSlide
   const repBySlide = new Map();
   repeatableSlides.forEach(rs => repBySlide.set(rs.slideIndex, rs));
    if (repeatableSlides.length === 0) {
      validZones.filter(z => z.isRepeatable).forEach(z => {
        if (!repBySlide.has(z.slideIndex)) {
          repBySlide.set(z.slideIndex, {
            slideIndex: z.slideIndex,
            key: `slide_${z.slideIndex}`,
            prompt: '',
          });
        }
      });
    }

   const foundFields   = [];
   const missingFields = [];

   // ── Block zones ────────────────────────────────────────────────────
   const blocksData = data.blocks || {};
   validZones
     .filter(z => !repSet.has(z.slideIndex) && isGenerated(z))
     .forEach(z => {
       const block = blocksData[z.key];
       if (block && (block.value !== undefined || typeof block === 'string')) foundFields.push(`${z.key} (block)`);
       else missingFields.push(`${z.key} (block)`);
     });

   // ── Repeatable slides ─────────────────────────────────────────────────────
   const slidesData   = data.slides || {};
   let instanceCount  = 0;

   const bySlide = {};
   validZones.filter(z => repSet.has(z.slideIndex) && isGenerated(z)).forEach(z => {
     if (!bySlide[z.slideIndex]) bySlide[z.slideIndex] = [];
     bySlide[z.slideIndex].push(z);
   });

  Object.entries(bySlide).forEach(([slideIdxStr, slideZones]) => {
    const slideIndex = parseInt(slideIdxStr);
    const repSlide   = repBySlide.get(slideIndex);
    const slideKey   = repSlide?.key || `slide_${slideIndex}`;
    const slideData  = slidesData[slideKey];

     if (!slideData) {
       const foundKeys = Object.keys(slidesData || {});
       const hint = foundKeys.length > 0 ? ` — AI used: ${foundKeys.map(k => `"${k}"`).join(', ')}` : '';
       missingFields.push(`${slideKey} (missing${hint})`);
       return;
     }

    // Detect format: new { shared, instances } vs legacy array
    const isNewFormat = !Array.isArray(slideData) && (slideData.instances !== undefined || slideData.shared !== undefined);

    if (isNewFormat) {
      // New format validation
      const uniqueZones    = slideZones.filter(z => z.unique !== false);
      const nonUniqueZones = slideZones.filter(z => z.unique === false);

      // Validate shared block
      const sharedData = slideData.shared || {};
      nonUniqueZones.forEach(z => {
        if (sharedData[z.key] !== undefined) foundFields.push(`${slideKey}.shared.${z.key}`);
        else missingFields.push(`${slideKey}.shared.${z.key}`);
      });

      // Validate instances array
      const instances = slideData.instances;
      if (!Array.isArray(instances) || instances.length === 0) {
        if (uniqueZones.length > 0) {
          missingFields.push(`${slideKey}.instances (missing or empty)`);
        }
        return;
      }

      instanceCount += instances.length;
      instances.forEach((inst, idx) => {
        uniqueZones.forEach(z => {
          if (inst[z.key] !== undefined) foundFields.push(`${slideKey}[${idx + 1}].${z.key}`);
          else missingFields.push(`${slideKey}[${idx + 1}].${z.key}`);
        });
      });

    } else {
      // Legacy array format — backward compat
      const instances = Array.isArray(slideData) ? slideData : [];
      if (instances.length === 0) {
        missingFields.push(`${slideKey} (no instances)`);
        return;
      }
      instanceCount += instances.length;
      instances.forEach((inst, idx) => {
        slideZones.forEach(z => {
          if (inst[z.key] !== undefined) foundFields.push(`${z.key} (${slideKey} instance ${idx + 1})`);
          else missingFields.push(`${z.key} (${slideKey} instance ${idx + 1})`);
        });
      });
    }
  });

  return {
    valid: missingFields.length === 0,
    error: null,
    foundFields,
    missingFields,
    instanceCount,
  };
}
