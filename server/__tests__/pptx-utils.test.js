import { describe, it, expect } from 'vitest';
import {
  extractSlideElements,
  getPresetColor,
  replacePlaceholders,
  detectSharedKeys,
  buildRecipe,
  validateJsonData,
} from '../pptx-utils.js';

// ─────────────────────────────────────────────
// Minimal XML helpers
// ─────────────────────────────────────────────

function makeShape({ x = 0, y = 0, w = 1, h = 0.5, text = '', fill = null, border = null, fontSize = null, bold = false, italic = false, underline = false, fontFamily = null, fontColor = null, align = null, anchor = null, name = null } = {}) {
  const EMU = 914400;
  const toEmu = (inches) => Math.round(inches * EMU);

  const fillXml = fill
    ? `<a:solidFill><a:srgbClr val="${fill.replace('#', '')}"/></a:solidFill>`
    : '<a:noFill/>';

  const borderXml = border
    ? `<a:ln w="${Math.round(border.widthPt * 12700)}"><a:solidFill><a:srgbClr val="${border.color.replace('#', '')}"/></a:solidFill></a:ln>`
    : '';

  const fontSizeAttr = fontSize ? ` sz="${fontSize * 100}"` : '';
  const boldAttr = bold ? ' b="1"' : '';
  const italicAttr = italic ? ' i="1"' : '';
  const underlineAttr = underline ? ' u="sng"' : '';
  const fontFamilyXml = fontFamily ? `<a:latin typeface="${fontFamily}"/>` : '';
  const fontColorXml = fontColor ? `<a:srgbClr val="${fontColor.replace('#', '')}"/>` : '';
  const alignAttr = align ? ` algn="${align}"` : '';
  const anchorAttr = anchor ? ` anchor="${anchor}"` : '';
  const nameAttr = name ? ` name="${name}"` : ' name="TextBox 1"';

  const textXml = text
    ? `<p:txBody>
        <a:bodyPr${anchorAttr}/>
        <a:p>
          <a:pPr${alignAttr}/>
          <a:r>
            <a:rPr${fontSizeAttr}${boldAttr}${italicAttr}${underlineAttr}>
              ${fontFamilyXml}
              ${fontColorXml}
            </a:rPr>
            <a:t>${text}</a:t>
          </a:r>
        </a:p>
      </p:txBody>`
    : '';

  return `<p:sp>
    <p:nvSpPr>
      <p:cNvPr id="1"${nameAttr}/>
    </p:nvSpPr>
    <p:spPr>
      <p:xfrm>
        <a:off x="${toEmu(x)}" y="${toEmu(y)}"/>
        <a:ext cx="${toEmu(w)}" cy="${toEmu(h)}"/>
      </p:xfrm>
      ${fillXml}
      ${borderXml}
    </p:spPr>
    ${textXml}
  </p:sp>`;
}

function makeSlideXml(shapes = [], bgColor = null) {
  const bgXml = bgColor
    ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgColor.replace('#', '')}"/></a:solidFill></p:bgPr></p:bg>`
    : '';
  return `<?xml version="1.0"?>
<p:sld>
  ${bgXml}
  <p:cSld>
    <p:spTree>
      ${shapes.join('\n')}
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

// ─────────────────────────────────────────────
// extractSlideElements
// ─────────────────────────────────────────────

describe('extractSlideElements', () => {
  it('returns empty elements for null/empty xml', () => {
    const result = extractSlideElements(null, 1);
    expect(result).toEqual({ index: 1, elements: [], background: '#ffffff' });

    const result2 = extractSlideElements('', 2);
    expect(result2).toEqual({ index: 2, elements: [], background: '#ffffff' });
  });

  it('parses a basic text element with correct bounds', () => {
    const xml = makeSlideXml([
      makeShape({ x: 1, y: 2, w: 3, h: 0.5, text: 'Hello World' })
    ]);
    const result = extractSlideElements(xml, 1);

    expect(result.elements).toHaveLength(1);
    const el = result.elements[0];
    expect(el.type).toBe('text');
    expect(el.text).toBe('Hello World');
    expect(el.bounds.x).toBeCloseTo(1, 2);
    expect(el.bounds.y).toBeCloseTo(2, 2);
    expect(el.bounds.w).toBeCloseTo(3, 2);
    expect(el.bounds.h).toBeCloseTo(0.5, 2);
  });

  it('assigns element id using slideIndex', () => {
    const xml = makeSlideXml([makeShape({ text: 'Hi' })]);
    const result = extractSlideElements(xml, 5);
    expect(result.elements[0].id).toMatch(/^slide5-elem/);
  });

  it('extracts font size in points (sz/100)', () => {
    const xml = makeSlideXml([makeShape({ text: 'Big', fontSize: 24 })]);
    const el = extractSlideElements(xml, 1).elements[0];
    expect(el.fontSize).toBe(24);
  });

  it('extracts bold, italic, underline flags', () => {
    const xml = makeSlideXml([
      makeShape({ text: 'Styled', bold: true, italic: true, underline: true })
    ]);
    const el = extractSlideElements(xml, 1).elements[0];
    expect(el.fontBold).toBe(true);
    expect(el.fontItalic).toBe(true);
    expect(el.fontUnderline).toBe(true);
  });

  it('extracts font family', () => {
    const xml = makeSlideXml([makeShape({ text: 'Font', fontFamily: 'Arial' })]);
    const el = extractSlideElements(xml, 1).elements[0];
    expect(el.fontFamily).toBe('Arial');
  });

  it('extracts font color from srgbClr', () => {
    const xml = makeSlideXml([makeShape({ text: 'Colored', fontColor: '#FF0000' })]);
    const el = extractSlideElements(xml, 1).elements[0];
    expect(el.fontColor).toBe('#FF0000');
  });

  it('extracts text alignment', () => {
    const xml = makeSlideXml([makeShape({ text: 'Centered', align: 'ctr' })]);
    const el = extractSlideElements(xml, 1).elements[0];
    expect(el.textAlign).toBe('ctr');
  });

  it('extracts vertical alignment', () => {
    const xml = makeSlideXml([makeShape({ text: 'Bottom', anchor: 'b' })]);
    const el = extractSlideElements(xml, 1).elements[0];
    expect(el.verticalAlign).toBe('b');
  });

  it('extracts shape fill color', () => {
    const xml = makeSlideXml([makeShape({ text: 'Filled', fill: '#AABBCC' })]);
    const el = extractSlideElements(xml, 1).elements[0];
    expect(el.shapeFill).toBe('#AABBCC');
  });

  it('extracts shape border', () => {
    const xml = makeSlideXml([makeShape({ text: 'Bordered', border: { color: '#123456', widthPt: 2 } })]);
    const el = extractSlideElements(xml, 1).elements[0];
    expect(el.shapeBorder).not.toBeNull();
    expect(el.shapeBorder.color).toBe('#123456');
    expect(el.shapeBorder.widthPt).toBeCloseTo(2, 0);
  });

  it('emits a rect element for a shape with fill but no text', () => {
    const xml = makeSlideXml([makeShape({ fill: '#FF0000' })]);
    const result = extractSlideElements(xml, 1);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].type).toBe('rect');
    expect(result.elements[0].shapeFill).toBe('#FF0000');
  });

  it('skips invisible shapes (no text, no fill, no border)', () => {
    const xml = makeSlideXml([makeShape({})]);
    const result = extractSlideElements(xml, 1);
    expect(result.elements).toHaveLength(0);
  });

  it('calculates maxChars from bounds and fontSize', () => {
    // 3-inch wide, 1-inch tall, 12pt font
    // charsPerLine = floor(3 * 72 / (12 * 0.55)) = floor(216/6.6) = 32
    // lines        = floor(1 * 72 / (12 * 1.2))  = floor(72/14.4) = 5
    // maxChars = 32 * 5 = 160
    const xml = makeSlideXml([makeShape({ text: 'X', w: 3, h: 1, fontSize: 12 })]);
    const el = extractSlideElements(xml, 1).elements[0];
    expect(el.maxChars).toBe(160);
  });

  it('parses sRGB background color', () => {
    const xml = makeSlideXml([], '#112233');
    const result = extractSlideElements(xml, 1);
    expect(result.background).toBe('#112233');
  });

  it('maps schemeClr background to a known hex value', () => {
    const xml = `<?xml version="1.0"?>
<p:sld>
  <p:bg><p:bgPr><a:solidFill><a:schemeClr val="dk1"/></a:solidFill></p:bgPr></p:bg>
  <p:cSld><p:spTree></p:spTree></p:cSld>
</p:sld>`;
    const result = extractSlideElements(xml, 1);
    expect(result.background).toBe('#000000');
  });

  it('resolves preset background color', () => {
    const xml = `<?xml version="1.0"?>
<p:sld>
  <p:bg><p:bgPr><a:solidFill><a:prstClr val="red"/></a:solidFill></p:bgPr></p:bg>
  <p:cSld><p:spTree></p:spTree></p:cSld>
</p:sld>`;
    const result = extractSlideElements(xml, 1);
    expect(result.background).toBe('#FF0000');
  });

  it('handles multiple shapes on a slide', () => {
    const xml = makeSlideXml([
      makeShape({ text: 'Shape One', x: 0, y: 0 }),
      makeShape({ text: 'Shape Two', x: 5, y: 5 }),
    ]);
    const result = extractSlideElements(xml, 1);
    expect(result.elements).toHaveLength(2);
    expect(result.elements[0].text).toBe('Shape One');
    expect(result.elements[1].text).toBe('Shape Two');
  });
});

// ─────────────────────────────────────────────
// getPresetColor
// ─────────────────────────────────────────────

describe('getPresetColor', () => {
  it('returns correct hex for known preset names', () => {
    expect(getPresetColor('white')).toBe('#FFFFFF');
    expect(getPresetColor('black')).toBe('#000000');
    expect(getPresetColor('red')).toBe('#FF0000');
    expect(getPresetColor('blue')).toBe('#0000FF');
  });

  it('returns #FFFFFF for unknown preset names', () => {
    expect(getPresetColor('unknown')).toBe('#FFFFFF');
    expect(getPresetColor('')).toBe('#FFFFFF');
  });
});

// ─────────────────────────────────────────────
// replacePlaceholders
// ─────────────────────────────────────────────

describe('replacePlaceholders', () => {
  const makeContent = (key) => `<a:t>{{${key}}}</a:t>`;

  it('replaces an autoGenerate tag with its static value', () => {
    const content = makeContent('title');
    const tags = [{ slideIndex: 1, key: 'title', autoGenerate: true }];
    const jsonData = { static: { title: 'My Title' } };
    const result = replacePlaceholders(content, jsonData, null, tags, 1);
    expect(result).toBe('<a:t>My Title</a:t>');
  });

  it('restores originalText for non-autoGenerate tags', () => {
    const content = makeContent('caption');
    const tags = [{ slideIndex: 1, key: 'caption', autoGenerate: false, originalText: 'Original Caption' }];
    const result = replacePlaceholders(content, {}, null, tags, 1);
    expect(result).toBe('<a:t>Original Caption</a:t>');
  });

  it('leaves untagged text unchanged', () => {
    const content = '<a:t>plain text</a:t>';
    const result = replacePlaceholders(content, {}, null, [], 1);
    expect(result).toBe('<a:t>plain text</a:t>');
  });

  it('XML-escapes ampersands in values', () => {
    const content = makeContent('org');
    const tags = [{ slideIndex: 1, key: 'org', autoGenerate: true }];
    const jsonData = { static: { org: 'Smith & Jones' } };
    const result = replacePlaceholders(content, jsonData, null, tags, 1);
    expect(result).toBe('<a:t>Smith &amp; Jones</a:t>');
  });

  it('XML-escapes < and > in values', () => {
    const content = makeContent('formula');
    const tags = [{ slideIndex: 1, key: 'formula', autoGenerate: true }];
    const jsonData = { static: { formula: 'a < b > c' } };
    const result = replacePlaceholders(content, jsonData, null, tags, 1);
    expect(result).toBe('<a:t>a &lt; b &gt; c</a:t>');
  });

  it('uses contextual entry value when available (takes priority over static)', () => {
    const content = makeContent('desc');
    const tags = [{ slideIndex: 2, key: 'desc', autoGenerate: true }];
    const jsonData = {
      static: { desc: 'Static value' },
      contextual: [
        { slide_index: 2, desc: 'Slide 2 specific value' }
      ]
    };
    const result = replacePlaceholders(content, jsonData, null, tags, 2);
    expect(result).toBe('<a:t>Slide 2 specific value</a:t>');
  });

  it('falls back to static when no contextual entry for this slide', () => {
    const content = makeContent('desc');
    const tags = [{ slideIndex: 3, key: 'desc', autoGenerate: true }];
    const jsonData = {
      static: { desc: 'Static fallback' },
      contextual: [{ slide_index: 2, desc: 'Slide 2 only' }]
    };
    const result = replacePlaceholders(content, jsonData, null, tags, 3);
    expect(result).toBe('<a:t>Static fallback</a:t>');
  });

  it('uses instanceData (recordData) for repeatable slide values', () => {
    const content = makeContent('item_name');
    const tags = [{ slideIndex: 2, key: 'item_name', autoGenerate: true }];
    const instanceData = { structure_type: 'item', item_name: 'Widget A' };
    const result = replacePlaceholders(content, {}, instanceData, tags, 2);
    expect(result).toBe('<a:t>Widget A</a:t>');
  });

  it('outputs empty string when value is missing and autoGenerate is true', () => {
    const content = makeContent('missing_key');
    const tags = [{ slideIndex: 1, key: 'missing_key', autoGenerate: true }];
    const result = replacePlaceholders(content, { static: {} }, null, tags, 1);
    expect(result).toBe('<a:t></a:t>');
  });

  it('only replaces tags belonging to the correct slideIndex', () => {
    const content = makeContent('title');
    // Tag is on slide 2, content is being processed as slide 1
    const tags = [{ slideIndex: 2, key: 'title', autoGenerate: true }];
    const jsonData = { static: { title: 'Should not appear' } };
    const result = replacePlaceholders(content, jsonData, null, tags, 1);
    // No matching tag for slide 1, so the placeholder is left as-is
    expect(result).toBe(makeContent('title'));
  });
});

// ─────────────────────────────────────────────
// detectSharedKeys
// ─────────────────────────────────────────────

describe('detectSharedKeys', () => {
  it('returns empty set when all keys are unique per slide', () => {
    const tags = [
      { slideIndex: 1, key: 'title' },
      { slideIndex: 2, key: 'subtitle' },
    ];
    expect(detectSharedKeys(tags).size).toBe(0);
  });

  it('detects a key shared across two static slides', () => {
    const tags = [
      { slideIndex: 1, key: 'desc' },
      { slideIndex: 2, key: 'desc' },
    ];
    const shared = detectSharedKeys(tags);
    expect(shared.has('desc')).toBe(true);
  });

  it('does not flag a key that appears twice on the same slide', () => {
    const tags = [
      { slideIndex: 1, key: 'title' },
      { slideIndex: 1, key: 'title' },
    ];
    expect(detectSharedKeys(tags).size).toBe(0);
  });

  it('excludes repeatable slide indices from shared-key detection', () => {
    const tags = [
      { slideIndex: 1, key: 'name' },   // static
      { slideIndex: 3, key: 'name' },   // repeatable — should be ignored
    ];
    const repeatableSet = new Set([3]);
    const shared = detectSharedKeys(tags, repeatableSet);
    // Only slide 1 is static, so 'name' appears once — not shared
    expect(shared.has('name')).toBe(false);
  });

  it('handles an empty tags array', () => {
    expect(detectSharedKeys([]).size).toBe(0);
  });
});

// ─────────────────────────────────────────────
// buildRecipe
// ─────────────────────────────────────────────

describe('buildRecipe', () => {
  const staticTag = (key, hint = '', autoGenerate = true) => ({
    slideIndex: 1, key, hint, autoGenerate, maxChars: null
  });

  it('contains STATIC FIELDS section with the provided key', () => {
    const tags = [staticTag('company_name', 'the company name')];
    const recipe = buildRecipe(tags, [], null);
    expect(recipe).toContain('STATIC FIELDS');
    expect(recipe).toContain('"company_name"');
    expect(recipe).toContain('the company name');
  });

  it('includes [AI] marker only for autoGenerate tags', () => {
    const tags = [
      staticTag('auto_field', 'hint', true),
      staticTag('manual_field', 'hint', false),
    ];
    const recipe = buildRecipe(tags, [], null);
    const lines = recipe.split('\n');
    const autoLine = lines.find(l => l.includes('auto_field'));
    const manualLine = lines.find(l => l.includes('manual_field'));
    expect(autoLine).toContain('[AI]');
    expect(manualLine).not.toContain('[AI]');
  });

  it('includes max chars hint when maxChars is set', () => {
    const tags = [{ slideIndex: 1, key: 'summary', hint: 'a summary', autoGenerate: true, maxChars: 120 }];
    const recipe = buildRecipe(tags, [], null);
    expect(recipe).toContain('max 120 chars');
  });

  it('prepends GLOBAL GUIDANCE when globalPrompt is provided', () => {
    const recipe = buildRecipe([staticTag('x')], [], 'Use formal language');
    expect(recipe).toContain('GLOBAL GUIDANCE:');
    expect(recipe).toContain('Use formal language');
    // Global guidance should appear before the GENERATE section
    expect(recipe.indexOf('GLOBAL GUIDANCE:')).toBeLessThan(recipe.indexOf('GENERATE THE FOLLOWING DATA'));
  });

  it('does not include GLOBAL GUIDANCE section when globalPrompt is empty', () => {
    const recipe = buildRecipe([staticTag('x')], [], null);
    expect(recipe).not.toContain('GLOBAL GUIDANCE:');
  });

  it('includes CONTEXTUAL FIELDS section for shared keys', () => {
    const tags = [
      { slideIndex: 1, key: 'desc', hint: 'slide 1 desc', autoGenerate: true, maxChars: null },
      { slideIndex: 2, key: 'desc', hint: 'slide 2 desc', autoGenerate: true, maxChars: null },
    ];
    const recipe = buildRecipe(tags, [], null);
    expect(recipe).toContain('CONTEXTUAL FIELDS');
    expect(recipe).toContain('"desc"');
    expect(recipe).toContain('slide_index');
  });

  it('numbers the REPEATABLE SLIDES section correctly when contextual fields exist', () => {
    const tags = [
      { slideIndex: 1, key: 'desc', hint: '', autoGenerate: true, maxChars: null },
      { slideIndex: 2, key: 'desc', hint: '', autoGenerate: true, maxChars: null },
      { slideIndex: 3, key: 'item_name', hint: '', autoGenerate: true, maxChars: null },
    ];
    const repeatableSlides = [{ slideIndex: 3, structureType: 'item', customPrompt: 'one per initiative' }];
    const recipe = buildRecipe(tags, repeatableSlides, null);
    // With contextual fields present, repeatable is section 3
    expect(recipe).toContain('3. REPEATABLE SLIDES');
  });

  it('numbers the REPEATABLE SLIDES section as 2 when no contextual fields', () => {
    const tags = [
      { slideIndex: 1, key: 'title', hint: '', autoGenerate: true, maxChars: null },
      { slideIndex: 3, key: 'item_name', hint: '', autoGenerate: true, maxChars: null },
    ];
    const repeatableSlides = [{ slideIndex: 3, structureType: 'item', customPrompt: '' }];
    const recipe = buildRecipe(tags, repeatableSlides, null);
    expect(recipe).toContain('2. REPEATABLE SLIDES');
  });

  it('includes structure_type and autoGenerate fields in REPEATABLE SLIDES', () => {
    const tags = [{ slideIndex: 2, key: 'initiative_name', hint: '', autoGenerate: true, maxChars: null }];
    const repeatableSlides = [{ slideIndex: 2, structureType: 'initiative', customPrompt: 'one per initiative' }];
    const recipe = buildRecipe(tags, repeatableSlides, null);
    expect(recipe).toContain('"initiative"');
    expect(recipe).toContain('"structure_type"');
    expect(recipe).toContain('"initiative_name"');
    expect(recipe).toContain('one per initiative');
  });

  it('handles empty tags array without throwing', () => {
    expect(() => buildRecipe([], [], null)).not.toThrow();
  });

  it('embeds the actual originalText of the linked element instead of a key/slide reference', () => {
    const tags = [
      { slideIndex: 2, key: 'scope', hint: 'Scope description', autoGenerate: true, maxChars: null },
      { slideIndex: 3, key: 'scope', hint: 'Scope description', autoGenerate: true, maxChars: null },
      // The linked context element — different text per slide
      { slideIndex: 2, key: 'group_name', hint: '', autoGenerate: false, maxChars: null, originalText: 'Alpha Initiative' },
      { slideIndex: 3, key: 'group_name', hint: '', autoGenerate: false, maxChars: null, originalText: 'Beta Initiative' },
    ];
    const propagations = [{ key: 'scope', mode: 'unique', linkedKey: 'group_name' }];
    const recipe = buildRecipe(tags, [], null, propagations);

    // Must embed the actual text, not a key/slide reference
    expect(recipe).toContain('Context for this slide: "Alpha Initiative"');
    expect(recipe).toContain('Context for this slide: "Beta Initiative"');
    expect(recipe).not.toContain('on slide 2 as context');
    expect(recipe).not.toContain('on slide 3 as context');
    expect(recipe).not.toContain("Use the value of");
  });

  it('omits context suffix when linkedKey tag is not found for a slide', () => {
    const tags = [
      { slideIndex: 2, key: 'scope', hint: 'Scope description', autoGenerate: true, maxChars: null },
      { slideIndex: 3, key: 'scope', hint: 'Scope description', autoGenerate: true, maxChars: null },
      // group_name only exists on slide 2, not slide 3
      { slideIndex: 2, key: 'group_name', hint: '', autoGenerate: false, maxChars: null, originalText: 'Alpha Initiative' },
    ];
    const propagations = [{ key: 'scope', mode: 'unique', linkedKey: 'group_name' }];
    const recipe = buildRecipe(tags, [], null, propagations);

    expect(recipe).toContain('Context for this slide: "Alpha Initiative"');
    // Slide 3 has no linked tag — no suffix emitted
    const slide3Entry = recipe.match(/slide_index.*?3.*?\n/)?.[0] || '';
    expect(slide3Entry).not.toContain('Context for this slide:');
  });

  it('emits consistent maxChars across all slides for a unique contextual field', () => {
    // Simulates: user set maxChars=500 on slide 2, propagation syncs it to slides 3-5
    const tags = [
      { slideIndex: 2, key: 'scope', hint: 'scope slide 2', autoGenerate: true, maxChars: 500 },
      { slideIndex: 3, key: 'scope', hint: 'scope slide 3', autoGenerate: true, maxChars: 500 },
      { slideIndex: 4, key: 'scope', hint: 'scope slide 4', autoGenerate: true, maxChars: 500 },
      { slideIndex: 5, key: 'scope', hint: 'scope slide 5', autoGenerate: true, maxChars: 500 },
    ];
    const propagations = [{ key: 'scope', mode: 'unique', linkedKey: 'initiative_group' }];
    const recipe = buildRecipe(tags, [], null, propagations);

    // Every contextual entry must carry the same max constraint
    const maxMatches = [...recipe.matchAll(/max (\d+) chars/g)].map(m => parseInt(m[1]));
    expect(maxMatches.length).toBe(4);
    expect(maxMatches.every(n => n === 500)).toBe(true);
  });

  it('emits consistent maxChars for a non-unique (static) propagated field', () => {
    const tags = [
      { slideIndex: 2, key: 'title', hint: 'the title', autoGenerate: true, maxChars: 80 },
      { slideIndex: 3, key: 'title', hint: 'the title', autoGenerate: true, maxChars: 80 },
    ];
    const propagations = [{ key: 'title', mode: 'non-unique' }];
    const recipe = buildRecipe(tags, [], null, propagations);

    // Non-unique → emitted once as a static field with the correct max
    expect(recipe).toContain('max 80 chars');
    const maxMatches = [...recipe.matchAll(/max (\d+) chars/g)];
    expect(maxMatches.length).toBe(1);
    expect(parseInt(maxMatches[0][1])).toBe(80);
  });
});

// ─────────────────────────────────────────────
// validateJsonData
// ─────────────────────────────────────────────

describe('validateJsonData', () => {
  const tag = (key, slideIndex = 1, autoGenerate = true) => ({ key, slideIndex, autoGenerate });

  it('returns valid:false and error for invalid JSON syntax', () => {
    const result = validateJsonData('{ bad json }', [tag('x')], []);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid JSON syntax');
  });

  it('validates a correct static-only JSON', () => {
    const json = JSON.stringify({ static: { title: 'Hello' } });
    const result = validateJsonData(json, [tag('title')], []);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
    expect(result.foundFields).toContain('title');
  });

  it('reports missing static fields', () => {
    const json = JSON.stringify({ static: {} });
    const result = validateJsonData(json, [tag('title'), tag('subtitle')], []);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('title');
    expect(result.missingFields).toContain('subtitle');
  });

  it('ignores non-autoGenerate tags when validating', () => {
    const json = JSON.stringify({ static: {} });
    const tags = [{ key: 'manual', slideIndex: 1, autoGenerate: false }];
    const result = validateJsonData(json, tags, []);
    // manual field is not autoGenerate so should not be in missingFields
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it('validates contextual fields for shared keys', () => {
    const tags = [tag('desc', 1), tag('desc', 2)];
    const json = JSON.stringify({
      contextual: [
        { slide_index: 1, desc: 'Value 1' },
        { slide_index: 2, desc: 'Value 2' },
      ]
    });
    const result = validateJsonData(json, tags, []);
    expect(result.valid).toBe(true);
    expect(result.foundFields).toContain('desc (slide 1)');
    expect(result.foundFields).toContain('desc (slide 2)');
  });

  it('reports missing contextual field for a specific slide', () => {
    const tags = [tag('desc', 1), tag('desc', 2)];
    const json = JSON.stringify({
      contextual: [
        { slide_index: 1, desc: 'Value 1' }
        // slide 2 missing
      ]
    });
    const result = validateJsonData(json, tags, []);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('desc (slide 2)');
  });

  it('validates repeatable slides with correct instances', () => {
    const tags = [tag('item_name', 3)];
    const repeatableSlides = [{ slideIndex: 3, structureType: 'item' }];
    const json = JSON.stringify({
      slides: {
        item: [
          { structure_type: 'item', item_name: 'Widget A' },
          { structure_type: 'item', item_name: 'Widget B' },
        ]
      }
    });
    const result = validateJsonData(json, tags, repeatableSlides);
    expect(result.valid).toBe(true);
    expect(result.instanceCount).toBe(2);
  });

  it('reports missing repeatable structure type', () => {
    const tags = [tag('item_name', 3)];
    const repeatableSlides = [{ slideIndex: 3, structureType: 'item' }];
    const json = JSON.stringify({ slides: {} });
    const result = validateJsonData(json, tags, repeatableSlides);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('item (no instances)');
  });

  it('reports missing structure_type field inside an instance', () => {
    const tags = [tag('item_name', 3)];
    const repeatableSlides = [{ slideIndex: 3, structureType: 'item' }];
    const json = JSON.stringify({
      slides: {
        item: [{ item_name: 'Widget A' }] // missing structure_type
      }
    });
    const result = validateJsonData(json, tags, repeatableSlides);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('structure_type (item instance 1)');
  });

  it('reports missing autoGenerate field within an instance', () => {
    const tags = [tag('item_name', 3)];
    const repeatableSlides = [{ slideIndex: 3, structureType: 'item' }];
    const json = JSON.stringify({
      slides: {
        item: [{ structure_type: 'item' }] // item_name missing
      }
    });
    const result = validateJsonData(json, tags, repeatableSlides);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('item_name (item instance 1)');
  });

  it('returns instanceCount = 0 when there are no repeatable instances', () => {
    const json = JSON.stringify({ static: { x: 'y' } });
    const result = validateJsonData(json, [tag('x')], []);
    expect(result.instanceCount).toBe(0);
  });

  it('accepts flat JSON (no static wrapper) for static fields', () => {
    const json = JSON.stringify({ title: 'Hello' });
    const result = validateJsonData(json, [tag('title')], []);
    expect(result.valid).toBe(true);
  });
});
