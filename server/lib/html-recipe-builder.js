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
  // Backward compat: if no repeatableSlides arg, use structureType from zones
  if (repeatableSlides.length === 0) {
    zones.filter(z => z.isRepeatable).forEach(z => {
      if (!repBySlide.has(z.slideIndex)) {
        repBySlide.set(z.slideIndex, {
          slideIndex: z.slideIndex,
          key: z.structureType || `slide_${z.slideIndex}`,
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

  let recipe = `INSTRUCTIONS:
- Return ONLY valid JSON, no explanations or markdown
- Use EXACT key names as provided - do NOT abbreviate or modify key names
- Return the full innerHTML string for each zone
- For repeatable slides, return both a "shared" object and an "instances" array

${globalSection}GENERATE THE FOLLOWING DATA:\n`;

  let sectionNum = 1;

  // ── Static block zones ────────────────────────────────────────────────────
  if (staticBlockZones.length > 0) {
    recipe += `\n${sectionNum}. BLOCK ZONES (generate full innerHTML for each container):\n{\n  "blocks": {\n`;
    staticBlockZones.forEach(z => {
      const promptLine  = z.prompt    ? `      // Prompt: ${z.prompt}\n` : '';
      const exampleLine = z.exampleHtml
        ? `      // Example structure (populate with real data, preserve all tags and classes):\n      // ${z.exampleHtml.replace(/\n/g, '\n      // ')}\n`
        : '';
      recipe += `    "${z.key}": {\n${promptLine}${exampleLine}      "value": "<!-- your generated HTML here -->"\n    },\n`;
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

      recipe += `\n${sectionNum}. REPEATABLE SLIDE — ${slideKey}\n`;
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
        recipe += `Each instance must follow this structure exactly:\n{\n`;
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
        recipe += `      "instances": [\n        {\n`;
        uniqueZones.forEach(z => {
          recipe += `          "${z.key}": "...",\n`;
        });
        recipe += `        }\n      ]\n    }\n  }\n}\n`;
      }
    });
  }

  recipe += `\nIMPORTANT:
- blocks: innerHTML strings (valid HTML, no surrounding tags)
- slides[key].shared: one value per non-unique key — same on every clone
- slides[key].instances: array of N objects (AI decides N from context)
- Each instance must include ALL unique keys listed above
- All zone values: valid innerHTML only — no surrounding container tags`;

  return recipe;
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
 * @returns {{ valid, error, foundFields, missingFields, instanceCount }}
 */
export function validateHtmlJson(jsonString, zones, repeatableSlides = []) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return {
      valid: false,
      error: 'Invalid JSON syntax',
      foundFields: [],
      missingFields: zones.filter(z => isGenerated(z)).map(z => z.key),
    };
  }

  const repSet = repeatableSlideIndexSet(zones, repeatableSlides);

  // Build lookup: slideIndex → repeatableSlide
  const repBySlide = new Map();
  repeatableSlides.forEach(rs => repBySlide.set(rs.slideIndex, rs));
  if (repeatableSlides.length === 0) {
    zones.filter(z => z.isRepeatable).forEach(z => {
      if (!repBySlide.has(z.slideIndex)) {
        repBySlide.set(z.slideIndex, {
          slideIndex: z.slideIndex,
          key: z.structureType || `slide_${z.slideIndex}`,
          prompt: '',
        });
      }
    });
  }

  const foundFields   = [];
  const missingFields = [];

  // ── Static block zones ────────────────────────────────────────────────────
  const blocksData = data.blocks || {};
  zones
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
  zones.filter(z => repSet.has(z.slideIndex) && isGenerated(z)).forEach(z => {
    if (!bySlide[z.slideIndex]) bySlide[z.slideIndex] = [];
    bySlide[z.slideIndex].push(z);
  });

  Object.entries(bySlide).forEach(([slideIdxStr, slideZones]) => {
    const slideIndex = parseInt(slideIdxStr);
    const repSlide   = repBySlide.get(slideIndex);
    const slideKey   = repSlide?.key || `slide_${slideIndex}`;
    const slideData  = slidesData[slideKey];

    if (!slideData) {
      missingFields.push(`${slideKey} (missing)`);
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
        if (!inst.structure_type) missingFields.push(`structure_type (${slideKey} instance ${idx + 1})`);
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
