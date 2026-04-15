/**
 * Tests for server/lib/html-recipe-builder.js
 *
 * Covers buildHtmlRecipe and validateHtmlJson for:
 *   - leaf zones (static, contextual)
 *   - block zones (static, repeatable)
 *   - mixed leaf + block
 *   - repeatable slides
 *   - global prompt
 *   - section numbering
 */

import { describe, it, expect } from 'vitest';
import { buildHtmlRecipe, generateFullSlideRecipe, validateHtmlJson } from '../lib/html-recipe-builder.js';

// ── Zone factories ─────────────────────────────────────────────────────────────

// All zones are now block zones
const zone = (key, prompt = '', slideIndex = 1, exampleHtml = '', autoGenerate = true) => ({
  zoneType: 'block', key, hint: prompt, prompt, exampleHtml, slideIndex,
  type: 'block', autoGenerate, isRepeatable: false, repeatableKey: null, ignored: false,
});

// Repeatable zones — unique (different per instance)
const repZone = (key, prompt = '', slideIndex = 2, exampleHtml = '', unique = true) => ({
  zoneType: 'block', key, hint: prompt, prompt, exampleHtml, slideIndex,
  type: 'block', autoGenerate: true, isRepeatable: true, repeatableKey: null, unique, ignored: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// buildHtmlRecipe
// ─────────────────────────────────────────────────────────────────────────────

describe('buildHtmlRecipe', () => {
  it('contains INSTRUCTIONS header', () => {
    const recipe = buildHtmlRecipe([zone('title')]);
    expect(recipe).toContain('INSTRUCTIONS');
    expect(recipe).toContain('Return ONLY valid JSON');
  });

  it('includes BLOCK ZONES section for leaf zones (converted to block)', () => {
    const recipe = buildHtmlRecipe([zone('company_name', 'the company')]);
    expect(recipe).toContain('BLOCK ZONES');
    expect(recipe).toContain('"company_name"');
    expect(recipe).toContain('the company');
  });

  it('excludes non-autoGenerate leaf zones', () => {
    const zones  = [zone('manual', 'hint', 1, '', false), zone('auto', 'hint', 1, '', true)];
    const recipe = buildHtmlRecipe(zones);
    expect(recipe).toContain('"auto"');
    expect(recipe).not.toContain('"manual"');
  });

  it('deduplicates block keys that appear on multiple non-repeatable slides', () => {
    const zones  = [zone('header', 'h', 1), zone('header', 'h', 2)];
    // Both slides share the key → single block zone
    const recipe = buildHtmlRecipe(zones);
    expect(recipe).toContain('BLOCK ZONES');
    expect(recipe).toContain('"header"');
  });

  it('handles block zones for shared keys across slides', () => {
    const zones  = [zone('desc', 'slide 1 desc', 1), zone('desc', 'slide 2 desc', 2)];
    const recipe = buildHtmlRecipe(zones);
    expect(recipe).toContain('BLOCK ZONES');
    expect(recipe).toContain('"desc"');
  });

  it('includes BLOCK ZONES section for block zones', () => {
    const zones  = [zone('initiatives_table', 'Populate with Q3 data')];
    const recipe = buildHtmlRecipe(zones);
    expect(recipe).toContain('BLOCK ZONES');
    expect(recipe).toContain('[HTML BLOCK]');
    expect(recipe).toContain('"initiatives_table"');
    expect(recipe).toContain('Populate with Q3 data');
  });

  it('includes example HTML in block zone entry when available', () => {
    const zones  = [zone('my_table', 'fill it', 1, '<tr><td>Row</td></tr>')];
    const recipe = buildHtmlRecipe(zones);
    expect(recipe).toContain('<tr>');
  });

  it('includes REPEATABLE SLIDE section for repeatable leaf zones', () => {
    const repSlides = [{ slideIndex: 2, key: 'item', prompt: 'one per item' }];
    const zones     = [zone('title', 'page title', 1), repZone('item_name', 'name', 2, '', true)];
    const recipe    = buildHtmlRecipe(zones, '', repSlides);
    expect(recipe).toContain('REPEATABLE SLIDE');
    expect(recipe).toContain('item');
    expect(recipe).toContain('"item_name"');
  });

  it('includes repeatable block zones inside REPEATABLE SLIDE section', () => {
    const repSlides = [{ slideIndex: 2, key: 'slide', prompt: 'one per slide' }];
    const zones     = [repZone('table_block', 'generate rows', 2, '', true)];
    const recipe    = buildHtmlRecipe(zones, '', repSlides);
    expect(recipe).toContain('REPEATABLE SLIDE');
    expect(recipe).toContain('"table_block"');
    expect(recipe).toContain('HTML BLOCK');
  });

  it('prepends GLOBAL GUIDANCE when provided', () => {
    const recipe = buildHtmlRecipe([zone('x')], 'Use formal language');
    expect(recipe).toContain('GLOBAL GUIDANCE');
    expect(recipe).toContain('Use formal language');
    expect(recipe.indexOf('GLOBAL GUIDANCE')).toBeLessThan(recipe.indexOf('GENERATE THE FOLLOWING DATA'));
  });

  it('omits GLOBAL GUIDANCE when not provided', () => {
    const recipe = buildHtmlRecipe([zone('x')]);
    expect(recipe).not.toContain('GLOBAL GUIDANCE');
  });

  it('numbers sections sequentially: only BLOCK ZONES', () => {
    const zones  = [zone('title', '', 1), zone('table', '', 1)];
    const recipe = buildHtmlRecipe(zones);
    expect(recipe).toContain('1. BLOCK ZONES');
    expect(recipe).not.toContain('2. BLOCK ZONES');
  });

  it('numbers sections sequentially: block=1, repeatable=2', () => {
    const repSlides = [{ slideIndex: 3, key: 'item', prompt: 'one per item' }];
    const zones     = [zone('desc', '', 1), zone('desc', '', 2), repZone('name', '', 3, '', true)];
    const recipe    = buildHtmlRecipe(zones, '', repSlides);
    expect(recipe).toContain('1. BLOCK ZONES');
    expect(recipe).toContain('2. REPEATABLE SLIDE');
  });

  it('numbers sections: block=1, repeatable=2', () => {
    const repSlides = [{ slideIndex: 3, key: 'item', prompt: 'one per item' }];
    const zones = [
      zone('header', '', 1),                       // block
      zone('desc', '', 1), zone('desc', '', 2),    // block
      zone('table', '', 1),                        // block
      repZone('item_name', '', 3, '', true),       // repeatable
    ];
    const recipe = buildHtmlRecipe(zones, '', repSlides);
    expect(recipe).toContain('1. BLOCK ZONES');
    expect(recipe).toContain('2. REPEATABLE SLIDE');
  });

  it('handles empty zone list without throwing', () => {
    expect(() => buildHtmlRecipe([])).not.toThrow();
  });

  it('includes IMPORTANT footer', () => {
    const recipe = buildHtmlRecipe([zone('x')]);
    expect(recipe).toContain('IMPORTANT');
    expect(recipe).toContain('blocks');
    expect(recipe).toContain('slides');
  });

  it('should exclude ignored leaf zones from recipe', () => {
    const zones = [
      zone('zone1', 'hint1'),
      { ...zone('zone2', 'hint2'), ignored: true },
      zone('zone3', 'hint3')
    ];
    const recipe = buildHtmlRecipe(zones);
    expect(recipe).toContain('"zone1"');
    expect(recipe).not.toContain('"zone2"');
    expect(recipe).toContain('"zone3"');
  });

  it('should exclude ignored block zones from recipe', () => {
    const zones = [
      zone('table1', 'fill it'),
      { ...zone('table2', 'fill it'), ignored: true },
      zone('table3', 'fill it')
    ];
    const recipe = buildHtmlRecipe(zones);
    expect(recipe).toContain('"table1"');
    expect(recipe).not.toContain('"table2"');
    expect(recipe).toContain('"table3"');
  });

  it('should exclude ignored zones from block zones', () => {
    const zones = [
      zone('desc', 'desc1', 1),
      { ...zone('desc', 'desc2', 2), ignored: true }
    ];
    const recipe = buildHtmlRecipe(zones);
    // The non-ignored zone should appear
    expect(recipe).toContain('"desc"');
    expect(recipe).toContain('BLOCK ZONES');
  });

  it('should handle mixed ignored and non-ignored repeatable zones', () => {
    const repSlides = [{ slideIndex: 2, key: 'item', prompt: 'one per item' }];
    const zones = [
      repZone('item_name', 'name', 2, '', true),
      { ...repZone('item_desc', 'desc', 2, '', true), ignored: true }
    ];
    const recipe = buildHtmlRecipe(zones, '', repSlides);
    expect(recipe).toContain('"item_name"');
    expect(recipe).not.toContain('"item_desc"');
  });

  it('should treat child zones as ignored when parent is ignored', () => {
    const zones = [
      { ...zone('parent_block', 'parent'), ignored: true, nodeId: 'div.parent' },
      { ...zone('child_leaf', 'child', 1, '', true), nodeId: 'div.parent>p.child' }
    ];
    const recipe = buildHtmlRecipe(zones);
    // Both parent and child should be excluded from recipe
    expect(recipe).not.toContain('"parent_block"');
    expect(recipe).not.toContain('"child_leaf"');
  });

  it('should exclude deeply nested children of ignored parent', () => {
    const zones = [
      { ...zone('root', 'root'), ignored: true, nodeId: 'div.root' },
      { ...zone('level1', 'level1', 1, '', true), nodeId: 'div.root>div.level1' },
      { ...zone('level2', 'level2', 1, '', true), nodeId: 'div.root>div.level1>p.level2' }
    ];
    const recipe = buildHtmlRecipe(zones);
    // All should be excluded because root is ignored
    expect(recipe).not.toContain('"root"');
    expect(recipe).not.toContain('"level1"');
    expect(recipe).not.toContain('"level2"');
  });

  it('should only exclude children of ignored parent, not siblings', () => {
    const zones = [
      { ...zone('ignored_parent', 'ignored', 1, '', true), ignored: true, nodeId: 'div.parent1' },
      { ...zone('child_of_ignored', 'child', 1, '', true), nodeId: 'div.parent1>p.child' },
      { ...zone('sibling_parent', 'sibling', 1, '', true), ignored: false, nodeId: 'div.parent2' },
      { ...zone('child_of_sibling', 'sibling_child', 1, '', true), nodeId: 'div.parent2>p.child' }
    ];
    const recipe = buildHtmlRecipe(zones);
    // Ignored parent and its child should be excluded
    expect(recipe).not.toContain('"ignored_parent"');
    expect(recipe).not.toContain('"child_of_ignored"');
    // Sibling parent and its child should be included
    expect(recipe).toContain('"sibling_parent"');
    expect(recipe).toContain('"child_of_sibling"');
  });

  it('should list ignored zones in ZONES_TO_PRESERVE section with their nodeId', () => {
    const zones = [
      { ...zone('header', 'header content'), nodeId: 'div.header', ignored: false },
      { ...zone('footer', 'footer content'), nodeId: 'div.footer', ignored: true },
      { ...zone('body', 'body content'), nodeId: 'div.body', ignored: false }
    ];
    const recipe = buildHtmlRecipe(zones);
    
    // Should have ZONES_TO_PRESERVE section
    expect(recipe).toContain('ZONES_TO_PRESERVE');
    
    // Should list the ignored zone (footer)
    expect(recipe).toContain('div.footer');
    expect(recipe).toContain('preserve as-is');
    
    // Should NOT list non-ignored zones in ZONES_TO_PRESERVE
    expect(recipe).not.toContain('div.header');
    expect(recipe).not.toContain('div.body');
    
    // Should NOT contain "undefined"
    expect(recipe).not.toContain('- undefined');
  });

  it('should not have ZONES_TO_PRESERVE section when no zones are ignored', () => {
    const zones = [
      zone('header', 'header content'),
      zone('body', 'body content')
    ];
    const recipe = buildHtmlRecipe(zones);
    
    // Should not have ZONES_TO_PRESERVE section
    expect(recipe).not.toContain('ZONES_TO_PRESERVE');
  });

  it('should list multiple ignored zones correctly', () => {
    const zones = [
      { ...zone('header', 'header'), nodeId: 'div.header', ignored: true },
      { ...zone('footer', 'footer'), nodeId: 'div.footer', ignored: true },
      { ...zone('body', 'body'), nodeId: 'div.body', ignored: false }
    ];
    const recipe = buildHtmlRecipe(zones);
    
    expect(recipe).toContain('ZONES_TO_PRESERVE');
    expect(recipe).toContain('div.header');
    expect(recipe).toContain('div.footer');
    expect(recipe).not.toContain('div.body');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateHtmlJson
// ─────────────────────────────────────────────────────────────────────────────

describe('validateHtmlJson', () => {
  it('returns valid:false for invalid JSON syntax', () => {
    const result = validateHtmlJson('{bad json', [zone('x')]);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/syntax/i);
  });

  it('validates a correct static-only JSON', () => {
    const zones  = [zone('title', 'page title')];
    const json   = JSON.stringify({ blocks: { title: 'Hello' } });
    const result = validateHtmlJson(json, zones);
    expect(result.valid).toBe(true);
    expect(result.foundFields.some(f => f.includes('title'))).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it('accepts flat JSON without static wrapper for static fields', () => {
    const zones  = [zone('title')];
    const json   = JSON.stringify({ blocks: { title: 'Hello' } });
    const result = validateHtmlJson(json, zones);
    expect(result.valid).toBe(true);
  });

  it('reports missing static fields', () => {
    const zones  = [zone('title'), zone('subtitle')];
    const json   = JSON.stringify({ blocks: { title: 'Hello' } });
    const result = validateHtmlJson(json, zones);
    expect(result.valid).toBe(false);
    expect(result.missingFields.some(f => f.includes('subtitle'))).toBe(true);
  });

  it('ignores non-autoGenerate leaf zones', () => {
    const zones  = [zone('manual', '', 1, '', false), zone('auto', '', 1, '', true)];
    const json   = JSON.stringify({ blocks: { auto: 'val' } });
    const result = validateHtmlJson(json, zones);
    expect(result.valid).toBe(true);
  });

  it('validates contextual fields for shared keys', () => {
    const zones = [zone('desc', '', 1), zone('desc', '', 2)];
    const json  = JSON.stringify({
      blocks: { desc: 'slide 1' }
    });
    const result = validateHtmlJson(json, zones);
    expect(result.valid).toBe(true);
  });

  it('reports missing contextual entry for a slide', () => {
    const zones = [zone('desc', '', 1), zone('desc', '', 2)];
    const json  = JSON.stringify({
      blocks: {}
    });
    const result = validateHtmlJson(json, zones);
    expect(result.valid).toBe(false);
    expect(result.missingFields.some(f => f.includes('desc'))).toBe(true);
  });

  it('validates a correct block zone', () => {
    const zones  = [zone('my_table', 'fill it')];
    const json   = JSON.stringify({ blocks: { my_table: { value: '<tr><td>A</td></tr>' } } });
    const result = validateHtmlJson(json, zones);
    expect(result.valid).toBe(true);
    expect(result.foundFields.some(f => f.includes('my_table'))).toBe(true);
  });

  it('accepts a block zone value as a plain string (not wrapped in {value})', () => {
    const zones  = [zone('my_table')];
    const json   = JSON.stringify({ blocks: { my_table: '<tr><td>A</td></tr>' } });
    const result = validateHtmlJson(json, zones);
    expect(result.valid).toBe(true);
  });

  it('reports missing block zone', () => {
    const zones  = [zone('my_table')];
    const json   = JSON.stringify({ blocks: {} });
    const result = validateHtmlJson(json, zones);
    expect(result.valid).toBe(false);
    expect(result.missingFields.some(f => f.includes('my_table'))).toBe(true);
  });

  it('validates repeatable slides with correct instances', () => {
    const repSlides = [{ slideIndex: 2, key: 'item', prompt: 'one per item' }];
    const zones     = [repZone('item_name', '', 2, '', true), repZone('item_desc', '', 2, '', true)];
    const json      = JSON.stringify({
      slides: {
        item: {
          instances: [
            { item_name: 'Alpha', item_desc: 'desc A' },
            { item_name: 'Beta',  item_desc: 'desc B' },
          ]
        }
      }
    });
    const result = validateHtmlJson(json, zones, repSlides);
    expect(result.valid).toBe(true);
    expect(result.instanceCount).toBe(2);
  });

  it('reports missing repeatable instances', () => {
    const repSlides = [{ slideIndex: 2, key: 'item', prompt: 'one per item' }];
    const zones     = [repZone('item_name', '', 2, '', true)];
    const json      = JSON.stringify({ slides: {} });
    const result    = validateHtmlJson(json, zones, repSlides);
    expect(result.valid).toBe(false);
    expect(result.missingFields.some(f => f.includes('item'))).toBe(true);
  });

  it('reports missing unique key in repeatable instance', () => {
    const repSlides = [{ slideIndex: 2, key: 'item', prompt: 'one per item' }];
    const zones     = [repZone('item_name', '', 2, '', true), repZone('item_desc', '', 2, '', true)];
    const json      = JSON.stringify({
      slides: { item: { instances: [{ item_name: 'Alpha' }] } }  // missing item_desc
    });
    const result = validateHtmlJson(json, zones, repSlides);
    expect(result.valid).toBe(false);
    expect(result.missingFields.some(f => f.includes('item_desc'))).toBe(true);
  });

  it('returns instanceCount = 0 when no repeatable instances', () => {
    const zones  = [zone('title')];
    const json   = JSON.stringify({ blocks: { title: 'Hello' } });
    const result = validateHtmlJson(json, zones);
    expect(result.instanceCount).toBe(0);
  });

  it('validates mixed leaf + block + repeatable correctly', () => {
    const repSlides = [{ slideIndex: 2, key: 'item', prompt: 'one per item' }];
    const zones = [
      zone('header', '', 1),
      zone('table', '', 1),
      repZone('item_name', '', 2, '', true),
    ];
    const json = JSON.stringify({
      blocks:  { header: 'Q3 Report', table: { value: '<tr><td>Row</td></tr>' } },
      slides:  { item: { instances: [{ item_name: 'Alpha' }] } },
    });
    const result = validateHtmlJson(json, zones, repSlides);
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildHtmlRecipe — repeatableSlides with unique/non-unique zones
// ─────────────────────────────────────────────────────────────────────────────

describe('buildHtmlRecipe — repeatableSlides', () => {
  const repSlides = [{ slideIndex: 2, key: 'brand_slide', prompt: 'Generate one slide per car brand' }];

  const zones = [
    zone('deck_title', 'presentation title', 1),
    repZone('brand_name',        'the car brand name',  2, '', true),
    repZone('brand_description', 'brand overview',      2, '', true),
    repZone('model_table',      'fill with model data', 2, '<tbody><tr><td class="name">X</td></tr></tbody>', true),
    { ...repZone('slide_footer', 'confidential note', 2, '', false) },  // non-unique
  ];

  it('emits a REPEATABLE SLIDE section', () => {
    const recipe = buildHtmlRecipe(zones, '', repSlides);
    expect(recipe).toContain('REPEATABLE SLIDE');
  });

  it('embeds the generation prompt', () => {
    const recipe = buildHtmlRecipe(zones, '', repSlides);
    expect(recipe).toContain('Generate one slide per car brand');
  });

  it('emits a SHARED VALUES sub-section for non-unique zones', () => {
    const recipe = buildHtmlRecipe(zones, '', repSlides);
    expect(recipe).toContain('SHARED VALUES');
    expect(recipe).toContain('"slide_footer"');
  });

  it('emits an INSTANCE VALUES sub-section for unique zones', () => {
    const recipe = buildHtmlRecipe(zones, '', repSlides);
    expect(recipe).toContain('INSTANCE VALUES');
    expect(recipe).toContain('"brand_name"');
    expect(recipe).toContain('"brand_description"');
  });

  it('unique zones do NOT appear in shared sub-section', () => {
    const recipe = buildHtmlRecipe(zones, '', repSlides);
    // Find shared section — brand_name should not be in it
    const sharedIdx  = recipe.indexOf('SHARED VALUES');
    const instanceIdx = recipe.indexOf('INSTANCE VALUES');
    const sharedSection = recipe.slice(sharedIdx, instanceIdx);
    expect(sharedSection).not.toContain('"brand_name"');
  });

  it('non-unique zones do NOT appear in the instance structure definition', () => {
    const recipe = buildHtmlRecipe(zones, '', repSlides);
    // The instance structure block ("Each instance must follow this structure:")
    // should list only unique keys. Find that block specifically.
    const instanceIdx  = recipe.indexOf('Each instance must follow this structure exactly:');
    const returnIdx    = recipe.indexOf('Return the full structure as:');
    expect(instanceIdx).toBeGreaterThan(-1);
    const instanceStructure = recipe.slice(instanceIdx, returnIdx);
    expect(instanceStructure).not.toContain('"slide_footer"');
    expect(instanceStructure).toContain('"brand_name"');
  });

  it('includes full exampleHtml for block zones (no truncation)', () => {
    const longHtml = '<tbody>' + '<tr><td class="col">Data</td></tr>'.repeat(20) + '</tbody>';
    const zonesWithLong = [
      repZone('big_table', 'fill it', 2, longHtml, true),
    ];
    const recipe = buildHtmlRecipe(zonesWithLong, '', repSlides);
    // Full HTML must appear — not truncated
    expect(recipe).toContain(longHtml);
  });

  it('emits the { shared, instances } JSON structure', () => {
    const recipe = buildHtmlRecipe(zones, '', repSlides);
    expect(recipe).toContain('"shared"');
    expect(recipe).toContain('"instances"');
  });

  it('block zones are unaffected by repeatableSlides', () => {
    const recipe = buildHtmlRecipe(zones, '', repSlides);
    expect(recipe).toContain('BLOCK ZONES');
    expect(recipe).toContain('"deck_title"');
  });

  it('handles a slide where all zones are unique (no shared sub-section)', () => {
    const allUnique = [
      repZone('brand_name', 'brand', 2, '', true),
      repZone('brand_desc', 'desc',  2, '', true),
    ];
    const recipe = buildHtmlRecipe(allUnique, '', repSlides);
    expect(recipe).not.toContain('SHARED VALUES');
    expect(recipe).toContain('INSTANCE VALUES');
  });

  it('handles a slide where all zones are non-unique (no instances sub-section)', () => {
    const allShared = [
      { ...repZone('footer', 'footer', 2, '', false) },
      { ...repZone('note',   'note',   2, '', false) },
    ];
    const recipe = buildHtmlRecipe(allShared, '', repSlides);
    expect(recipe).toContain('SHARED VALUES');
    expect(recipe).not.toContain('INSTANCE VALUES');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateHtmlJson — repeatableSlides with shared + instances
// ─────────────────────────────────────────────────────────────────────────────

describe('validateHtmlJson — repeatableSlides', () => {
  const repSlides = [{ slideIndex: 2, key: 'brand_slide', prompt: 'one per brand' }];

  const zones = [
    zone('deck_title', '', 1),
    repZone('brand_name',  '', 2, '', true),
    repZone('brand_desc',  '', 2, '', true),
    { ...repZone('footer', '', 2, '', false) },  // non-unique
  ];

  const validJson = JSON.stringify({
    blocks: { deck_title: 'Deck' },
    slides: {
      brand_slide: {
        shared:    { footer: 'Confidential' },
        instances: [
          { brand_name: 'BMW',      brand_desc: 'German luxury' },
          { brand_name: 'Mercedes', brand_desc: 'Stuttgart icon' },
        ],
      },
    },
  });

  it('returns valid:true for correct shared + instances JSON', () => {
    const result = validateHtmlJson(validJson, zones, repSlides);
    expect(result.valid).toBe(true);
  });

  it('returns instanceCount = 2', () => {
    const result = validateHtmlJson(validJson, zones, repSlides);
    expect(result.instanceCount).toBe(2);
  });

  it('returns valid:false when slides[key] is missing', () => {
    const json = JSON.stringify({ static: { deck_title: 'D' }, slides: {} });
    const result = validateHtmlJson(json, zones, repSlides);
    expect(result.valid).toBe(false);
    expect(result.missingFields.some(f => f.includes('brand_slide'))).toBe(true);
  });

  it('returns valid:false when shared is missing a non-unique key', () => {
    const json = JSON.stringify({
      static: { deck_title: 'D' },
      slides: {
        brand_slide: {
          shared:    {},  // missing footer
          instances: [{ brand_name: 'BMW', brand_desc: 'x' }],
        },
      },
    });
    const result = validateHtmlJson(json, zones, repSlides);
    expect(result.valid).toBe(false);
    expect(result.missingFields.some(f => f.includes('footer'))).toBe(true);
  });

  it('returns valid:false when instances is missing', () => {
    const json = JSON.stringify({
      static: { deck_title: 'D' },
      slides: { brand_slide: { shared: { footer: 'x' } } },
    });
    const result = validateHtmlJson(json, zones, repSlides);
    expect(result.valid).toBe(false);
  });

  it('returns valid:false when instances is empty', () => {
    const json = JSON.stringify({
      static: { deck_title: 'D' },
      slides: { brand_slide: { shared: { footer: 'x' }, instances: [] } },
    });
    const result = validateHtmlJson(json, zones, repSlides);
    expect(result.valid).toBe(false);
  });

  it('returns valid:false when an instance is missing a unique key', () => {
    const json = JSON.stringify({
      static: { deck_title: 'D' },
      slides: {
        brand_slide: {
          shared:    { footer: 'x' },
          instances: [{ brand_name: 'BMW' }],  // missing brand_desc
        },
      },
    });
    const result = validateHtmlJson(json, zones, repSlides);
    expect(result.valid).toBe(false);
    expect(result.missingFields.some(f => f.includes('brand_desc'))).toBe(true);
  });

  it('missingFields includes instance index for unique key errors', () => {
    const json = JSON.stringify({
      static: { deck_title: 'D' },
      slides: {
        brand_slide: {
          shared:    { footer: 'x' },
          instances: [
            { brand_name: 'BMW', brand_desc: 'x' },
            { brand_name: 'Mercedes' },  // missing brand_desc in instance 2
          ],
        },
      },
    });
    const result = validateHtmlJson(json, zones, repSlides);
    expect(result.valid).toBe(false);
    // Should reference instance index 2
    expect(result.missingFields.some(f => f.includes('[2]') || f.includes('2'))).toBe(true);
  });

  it('accepts missing shared when all zones are unique', () => {
    const allUnique = [
      zone('deck_title', '', 1),
      repZone('brand_name', '', 2, '', true),
    ];
    const json = JSON.stringify({
      blocks: { deck_title: 'D' },
      slides: {
        brand_slide: {
          instances: [{ brand_name: 'BMW' }],
        },
      },
    });
    const result = validateHtmlJson(json, allUnique, repSlides);
    expect(result.valid).toBe(true);
  });

  it('validates repeatable slide zones with legacy array format', () => {
    // Legacy array format: data.slides[key] is an array directly (not { shared, instances })
    const zones = [
      { zoneType: 'block', key: 'item_name', slideIndex: 2, type: 'block',
        autoGenerate: true, isRepeatable: true, repeatableKey: null, unique: true, ignored: false },
    ];
    const json = JSON.stringify({
      slides: { slide_2: [{ item_name: 'Alpha' }] },
    });
    const result = validateHtmlJson(json, zones);
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateFullSlideRecipe
// ─────────────────────────────────────────────────────────────────────────────

describe('generateFullSlideRecipe', () => {
  it('generates recipe with all zones on slide', () => {
    const zones = [
      zone('title', 'title', 1),
      zone('subtitle', 'subtitle', 1),
      zone('body', 'body', 1),
    ];
    const recipe = generateFullSlideRecipe(zones, 1);
    expect(recipe).toContain('GENERATE ALL ZONES FOR THIS SLIDE');
    expect(recipe).toContain('"title"');
    expect(recipe).toContain('"subtitle"');
    expect(recipe).toContain('"body"');
  });

  it('excludes zones from other slides', () => {
    const zones = [
      zone('title', 'title', 1),
      zone('subtitle', 'subtitle', 2),
    ];
    const recipe = generateFullSlideRecipe(zones, 1);
    expect(recipe).toContain('"title"');
    expect(recipe).not.toContain('"subtitle"');
  });

  it('excludes ignored zones', () => {
    const zones = [
      zone('title', 'title', 1),
      { ...zone('ignored_zone', 'ignored', 1), ignored: true },
      zone('body', 'body', 1),
    ];
    const recipe = generateFullSlideRecipe(zones, 1);
    expect(recipe).toContain('"title"');
    expect(recipe).toContain('"body"');
    expect(recipe).not.toContain('"ignored_zone"');
  });

  it('includes repeatable zones in correct format', () => {
    const zones = [
      zone('title', 'title', 1),
      repZone('item_name', 'item name', 1, '', true),
      repZone('item_desc', 'item desc', 1, '', false),
    ];
    const repSlides = [{ slideIndex: 1, key: 'item', prompt: 'one per item' }];
    const recipe = generateFullSlideRecipe(zones, 1, '', repSlides);
    expect(recipe).toContain('REPEATABLE SLIDE');
    expect(recipe).toContain('INSTANCE VALUES');
    expect(recipe).toContain('SHARED VALUES');
  });

  it('returns error message for slide with no zones', () => {
    const zones = [zone('title', 'title', 1)];
    const recipe = generateFullSlideRecipe(zones, 2);
    expect(recipe).toContain('ERROR');
    expect(recipe).toContain('No zones found');
  });

  it('includes global prompt when provided', () => {
    const zones = [zone('title', 'title', 1)];
    const recipe = generateFullSlideRecipe(zones, 1, 'Use professional tone');
    expect(recipe).toContain('GLOBAL GUIDANCE');
    expect(recipe).toContain('Use professional tone');
  });

  it('includes zone prompts and examples', () => {
    const zones = [
      { ...zone('title', 'Main heading', 1), exampleHtml: '<h1>Example Title</h1>' },
    ];
    const recipe = generateFullSlideRecipe(zones, 1);
    expect(recipe).toContain('Main heading');
    expect(recipe).toContain('<h1>Example Title</h1>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateHtmlJson with fullSlide option
// ─────────────────────────────────────────────────────────────────────────────

describe('validateHtmlJson with fullSlide option', () => {
  it('validates all zones are present for full-slide', () => {
    const zones = [
      zone('title', 'title', 1),
      zone('subtitle', 'subtitle', 1),
      zone('body', 'body', 1),
    ];
    const json = JSON.stringify({
      blocks: {
        title: { value: 'Title' },
        subtitle: { value: 'Subtitle' },
        body: { value: 'Body' },
      }
    });
    const result = validateHtmlJson(json, zones, [], { fullSlide: true, slideIndex: 1 });
    expect(result.valid).toBe(true);
  });

  it('fails validation if zones are missing', () => {
    const zones = [
      zone('title', 'title', 1),
      zone('subtitle', 'subtitle', 1),
      zone('body', 'body', 1),
    ];
    const json = JSON.stringify({
      blocks: {
        title: { value: 'Title' },
        // Missing subtitle and body
      }
    });
    const result = validateHtmlJson(json, zones, [], { fullSlide: true, slideIndex: 1 });
    expect(result.valid).toBe(false);
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it('only validates zones on target slide', () => {
    const zones = [
      zone('title', 'title', 1),
      zone('other', 'other', 2),
    ];
    const json = JSON.stringify({
      blocks: {
        title: { value: 'Title' },
        // other zone on slide 2 is not required
      }
    });
    const result = validateHtmlJson(json, zones, [], { fullSlide: true, slideIndex: 1 });
    expect(result.valid).toBe(true);
  });

  it('excludes ignored zones from validation', () => {
    const zones = [
      zone('title', 'title', 1),
      { ...zone('ignored', 'ignored', 1), ignored: true },
    ];
    const json = JSON.stringify({
      blocks: {
        title: { value: 'Title' },
        // ignored zone not required
      }
    });
    const result = validateHtmlJson(json, zones, [], { fullSlide: true, slideIndex: 1 });
    expect(result.valid).toBe(true);
  });

  it('provides clear error message for missing fields', () => {
    const zones = [
      zone('title', 'title', 1),
      zone('subtitle', 'subtitle', 1),
    ];
    const json = JSON.stringify({
      blocks: {
        title: { value: 'Title' },
      }
    });
    const result = validateHtmlJson(json, zones, [], { fullSlide: true, slideIndex: 1 });
    expect(result.error).toContain('Missing fields');
    expect(result.error).toContain('subtitle');
  });

  it('validates repeatable slides in full-slide mode', () => {
    const zones = [
      repZone('item_name', 'item name', 1, '', true),
    ];
    const repSlides = [{ slideIndex: 1, key: 'item', prompt: 'one per item' }];
    const json = JSON.stringify({
      slides: {
        item: {
          instances: [
            { item_name: 'Item 1' },
            { item_name: 'Item 2' },
          ]
        }
      }
    });
    const result = validateHtmlJson(json, zones, repSlides, { fullSlide: true, slideIndex: 1 });
    expect(result.valid).toBe(true);
    expect(result.instanceCount).toBe(2);
  });
});
