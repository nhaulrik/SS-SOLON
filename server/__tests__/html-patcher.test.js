/**
 * Tests for server/lib/html-patcher.js
 *
 * Covers applyHtmlContent for:
 *   - leaf zone text replacement
 *   - block zone innerHTML replacement
 *   - label zone replacement
 *   - non-autoGenerate zones are left untouched
 *   - repeatable slides: cloned once per instance
 *   - data-zone / data-block / data-prompt attributes stripped from output
 *   - contextual (shared-key) fields applied per slide
 */

import { describe, it, expect } from 'vitest';
import { applyHtmlContent } from '../lib/html/html-patcher.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

// All zones are now block zones
const zone = (key, slideIndex = 1, autoGenerate = true, nodeId = null) => ({
  zoneType: 'block', key, slideIndex, type: 'block', autoGenerate,
  isRepeatable: false, repeatableKey: null, ignored: false, nodeId,
});

const repZone = (key, slideIndex = 2, unique = true, nodeId = null) => ({
  zoneType: 'block', key, slideIndex, type: 'block', autoGenerate: true,
  isRepeatable: true, repeatableKey: null, unique, ignored: false, nodeId,
});

// ─────────────────────────────────────────────────────────────────────────────
// Block zones (formerly called "leaf zones" - now all zones are block zones)
// ─────────────────────────────────────────────────────────────────────────────

describe('applyHtmlContent — leaf zones', () => {
  it('replaces textContent of a data-zone element', () => {
    const html   = `<section><p data-block="title">Placeholder</p></section>`;
    const data   = { blocks: { title: 'Q3 Report' } };
    const zones  = [zone('title')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Q3 Report');
    expect(result).not.toContain('Placeholder');
  });

  it('accepts flat JSON (no static wrapper) for leaf zones', () => {
    const html   = `<section><p data-block="title">Old</p></section>`;
    const data   = { blocks: { title: 'New Title' } };
    const zones  = [zone('title')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('New Title');
  });

  it('leaves non-autoGenerate zones unchanged', () => {
    const html   = `<section><p data-block="manual">Keep me</p></section>`;
    const data   = { blocks: { manual: 'Should not appear' } };
    const zones  = [zone('manual', 1, false)];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Keep me');
    expect(result).not.toContain('Should not appear');
  });

  it('strips data-zone attributes from output', () => {
    const html   = `<section><p data-block="title">Old</p></section>`;
    const data   = { blocks: { title: 'New' } };
    const zones  = [zone('title')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).not.toContain('data-block');
  });

  it('handles multiple leaf zones on the same slide', () => {
    const html = `<section>
      <h1 data-block="header">H</h1>
      <p data-block="body">B</p>
    </section>`;
    const data  = { blocks: { header: 'Title', body: 'Content' } };
    const zones = [zone('header'), zone('body')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Title');
    expect(result).toContain('Content');
  });

  it('applies block values per slide for shared keys', () => {
    const html = `
      <section><p data-block="desc">A</p></section>
      <section><p data-block="desc">B</p></section>`;
    const data = {
      blocks: {
        desc: 'Slide one text'
      }
    };
    const zones  = [zone('desc', 1), zone('desc', 2)];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Slide one text');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block zones
// ─────────────────────────────────────────────────────────────────────────────

describe('applyHtmlContent — block zones', () => {
  it('replaces innerHTML of a data-block element', () => {
    const html   = `<section><table data-block="my_table"><tr><td>Old row</td></tr></table></section>`;
    const data   = { blocks: { my_table: { value: '<tr><td>New row</td></tr>' } } };
    const zones  = [zone('my_table')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('New row');
    expect(result).not.toContain('Old row');
  });

  it('accepts block value as a plain string', () => {
    const html   = `<section><div data-block="content">old</div></section>`;
    const data   = { blocks: { content: '<p>Fresh content</p>' } };
    const zones  = [zone('content')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Fresh content');
  });

  it('strips data-block and data-prompt attributes', () => {
    const html   = `<section><table data-block="t" data-prompt="fill it"><tr><td>x</td></tr></table></section>`;
    const data   = { blocks: { t: { value: '<tr><td>y</td></tr>' } } };
    const zones  = [zone('t')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).not.toContain('data-block');
    expect(result).not.toContain('data-prompt');
  });

  it('preserves surrounding HTML structure around the block element', () => {
    const html   = `<section><h1 data-block="title">T</h1><table data-block="tbl">old</table></section>`;
    const data   = { blocks: { title: 'Report', tbl: { value: '<tr><td>Row</td></tr>' } } };
    const zones  = [zone('title'), zone('tbl')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('<h1');
    expect(result).toContain('Report');
    expect(result).toContain('Row');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block zones — nodeId path (user-assigned, no data-block attribute)
// ─────────────────────────────────────────────────────────────────────────────

describe('applyHtmlContent — block zones via nodeId', () => {
  // Helper: build a block zone with a nodeId (user-assigned, no data-block attr)
  const nodeIdBlock = (key, nodeId, slideIndex = 1) => ({
    zoneType: 'block', key, nodeId, slideIndex, type: 'block', autoGenerate: true,
    isRepeatable: false, repeatableKey: null, ignored: false,
  });

  it('replaces innerHTML of an element matched by nodeId', () => {
    const html = `<section><div class="header"><span>Old content</span></div></section>`;
    const data = { blocks: { header: { value: '<span>New content</span>' } } };
    const zones = [nodeIdBlock('header', 'div.header')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('New content');
    expect(result).not.toContain('Old content');
  });

  it('resolves a nested nodeId path (parent>child)', () => {
    const html = `<section><div class="header"><div class="header-left"><span>Old</span></div></div></section>`;
    const data = { blocks: { headerleft: { value: '<span>New</span>' } } };
    const zones = [nodeIdBlock('headerleft', 'div.header>div.header-left')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('New');
    expect(result).not.toContain('Old');
  });

  it('resolves a nodeId with a sibling disambiguator [N]', () => {
    const html = `<section>
      <div class="col">First</div>
      <div class="col">Second</div>
    </section>`;
    const data = { blocks: { col2: { value: 'Replaced' } } };
    const zones = [nodeIdBlock('col2', 'div.col[1]')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Replaced');
    expect(result).toContain('First'); // first sibling untouched
  });

  it('accepts a plain string block value (no {value} wrapper)', () => {
    const html = `<section><div class="header"><span>Old</span></div></section>`;
    const data = { blocks: { header: '<span>Plain</span>' } };
    const zones = [nodeIdBlock('header', 'div.header')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Plain');
  });

  it('leaves element unchanged when no matching value in data', () => {
    const html = `<section><div class="header"><span>Original</span></div></section>`;
    const data = { blocks: {} };
    const zones = [nodeIdBlock('header', 'div.header')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Original');
  });

  it('leaves element unchanged when nodeId does not match any element', () => {
    const html = `<section><div class="header"><span>Original</span></div></section>`;
    const data = { blocks: { missing: { value: '<span>New</span>' } } };
    const zones = [nodeIdBlock('missing', 'div.nonexistent')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Original');
  });

  it('preserves surrounding structure when patching by nodeId', () => {
    const html = `<section>
      <div class="top-bar"></div>
      <div class="header"><span>Old header</span></div>
      <div class="body"><p>Body content</p></div>
    </section>`;
    const data = { blocks: { header: { value: '<span>New header</span>' } } };
    const zones = [nodeIdBlock('header', 'div.header')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('New header');
    expect(result).toContain('Body content');
    expect(result).toContain('top-bar');
  });

  it('nodeId block zone coexists with data-block zones on the same slide', () => {
    const html = `<section>
      <p data-block="title">Old title</p>
      <div class="header"><span>Old header</span></div>
    </section>`;
    const data = {
      blocks: { title: 'New title', header: { value: '<span>New header</span>' } },
    };
    const zones = [
      zone('title'),
      nodeIdBlock('header', 'div.header'),
    ];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('New title');
    expect(result).toContain('New header');
    expect(result).not.toContain('Old title');
    expect(result).not.toContain('Old header');
  });
});

// Label zones are no longer supported in block-only model
// All zones are now block zones

// ─────────────────────────────────────────────────────────────────────────────
// Repeatable slides
// ─────────────────────────────────────────────────────────────────────────────

describe('applyHtmlContent — repeatable slides', () => {
  const repSlides = [{ slideIndex: 2, key: 'item', prompt: 'one per item' }];

  it('clones the repeatable section once per instance', () => {
    const html  = `<section><p data-block="title">T</p></section><section><p data-block="item_name">N</p></section>`;
    const data  = {
      blocks: { title: 'Report' },
      slides: {
        item: {
          instances: [
            { item_name: 'Alpha' },
            { item_name: 'Beta'  },
          ]
        }
      }
    };
    const zones = [zone('title', 1), repZone('item_name', 2, true)];
    const result = applyHtmlContent(html, data, zones, repSlides);
    expect(result).toContain('Alpha');
    expect(result).toContain('Beta');
    const matches = result.match(/<section/g) || [];
    expect(matches.length).toBe(3); // 1 static + 2 clones
  });

  it('fills block zones inside repeatable slides per instance', () => {
    const rs    = [{ slideIndex: 1, key: 'item', prompt: '' }];
    const html  = `<section><table data-block="rows">old</table></section>`;
    const data  = {
      slides: {
        item: {
          instances: [
            { rows: '<tr><td>Alpha</td></tr>' },
            { rows: '<tr><td>Beta</td></tr>'  },
          ]
        }
      }
    };
    const zones = [repZone('rows', 1, true)];
    const result = applyHtmlContent(html, data, zones, rs);
    expect(result).toContain('Alpha');
    expect(result).toContain('Beta');
    expect(result).not.toContain('old');
  });

  it('removes data-zone from cloned repeatable sections', () => {
    const rs    = [{ slideIndex: 1, key: 'item', prompt: '' }];
    const html  = `<section><p data-block="item_name">N</p></section>`;
    const data  = { slides: { item: { instances: [{ item_name: 'Alpha' }] } } };
    const zones = [repZone('item_name', 1, true)];
    const result = applyHtmlContent(html, data, zones, rs);
    expect(result).not.toContain('data-block');
  });

  it('produces zero clones when instances array is empty', () => {
    const html  = `<section><p data-block="title">T</p></section><section><p data-block="item_name">N</p></section>`;
    const data  = { blocks: { title: 'Report' }, slides: { item: { instances: [] } } };
    const zones = [zone('title', 1), repZone('item_name', 2, true)];
    const result = applyHtmlContent(html, data, zones, repSlides);
    expect(result).toContain('Report');
    expect(result).not.toContain('item_name');
  });

  it('stamps non-unique (shared) zone values identically across all clones', () => {
    const rs    = [{ slideIndex: 1, key: 'item', prompt: '' }];
    const html  = `<section><p data-block="footer">F</p><p data-block="brand">B</p></section>`;
    const data  = {
      slides: {
        item: {
          shared:    { footer: 'Confidential' },
          instances: [
            { brand: 'BMW'      },
            { brand: 'Mercedes' },
          ]
        }
      }
    };
    const zones = [
      { ...repZone('footer', 1, false) },  // non-unique
      repZone('brand', 1, true),           // unique
    ];
    const result = applyHtmlContent(html, data, zones, rs);
    const confidentialMatches = (result.match(/Confidential/g) || []).length;
    expect(confidentialMatches).toBe(2);
    expect(result).toContain('BMW');
    expect(result).toContain('Mercedes');
  });

  it('unique zone values differ across clones', () => {
    const rs    = [{ slideIndex: 1, key: 'item', prompt: '' }];
    const html  = `<section><p data-block="brand">B</p></section>`;
    const data  = {
      slides: {
        item: {
          instances: [
            { brand: 'BMW'      },
            { brand: 'Mercedes' },
            { brand: 'Audi'     },
          ]
        }
      }
    };
    const zones = [repZone('brand', 1, true)];
    const result = applyHtmlContent(html, data, zones, rs);
    expect(result).toContain('BMW');
    expect(result).toContain('Mercedes');
    expect(result).toContain('Audi');
    const sections = result.match(/<section/g) || [];
    expect(sections.length).toBe(3);
  });

  it('static slides before/after repeatable section are preserved', () => {
    const html = `<section><p data-block="intro">I</p></section><section><p data-block="brand">B</p></section><section><p data-block="outro">O</p></section>`;
    const data = {
      blocks: { intro: 'Welcome', outro: 'Goodbye' },
      slides: { item: { instances: [{ brand: 'BMW' }, { brand: 'Audi' }] } }
    };
    const repSlides3 = [{ slideIndex: 2, key: 'item', prompt: 'one per brand' }];
    const zones = [
      zone('intro', 1),
      repZone('brand', 2, true),
      zone('outro', 3),
    ];
    const result = applyHtmlContent(html, data, zones, repSlides3);
    expect(result).toContain('Welcome');
    expect(result).toContain('Goodbye');
    expect(result).toContain('BMW');
    expect(result).toContain('Audi');
    // 1 intro + 2 brand clones + 1 outro = 4 sections
    const sections = result.match(/<section/g) || [];
    expect(sections.length).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ignored zones
// ─────────────────────────────────────────────────────────────────────────────

describe('applyHtmlContent — ignored zones', () => {
  it('should skip patching ignored leaf zones', () => {
    const html   = `<section><p data-block="title">Original</p></section>`;
    const data   = { blocks: { title: 'New Title' } };
    const zones  = [{ ...zone('title'), ignored: true }];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Original');
    expect(result).not.toContain('New Title');
  });

  it('should skip patching ignored block zones', () => {
    const html   = `<div data-block="table">Original HTML</div>`;
    const data   = { blocks: { table: { value: '<tr><td>New</td></tr>' } } };
    const zones  = [{ ...zone('table'), ignored: true }];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Original HTML');
    expect(result).not.toContain('<tr>');
  });

  it('should patch non-ignored zones normally', () => {
    const html   = `<section><p data-block="title">Original</p></section>`;
    const data   = { blocks: { title: 'New Title' } };
    const zones  = [{ ...zone('title'), ignored: false }];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('New Title');
    expect(result).not.toContain('Original');
  });

  it('should handle mixed ignored and non-ignored zones', () => {
    const html = `<section>
      <h1 data-block="header">H</h1>
      <p data-block="body">B</p>
    </section>`;
    const data  = { blocks: { header: 'Title', body: 'Content' } };
    const zones = [
      { ...zone('header'), ignored: false },
      { ...zone('body'), ignored: true }
    ];
    const result = applyHtmlContent(html, data, zones);
    expect(result).toContain('Title');
    expect(result).toContain('B'); // body should remain unchanged
    expect(result).not.toContain('Content');
  });

  it('should strip data-ignore attribute from output', () => {
    const html   = `<section><p data-block="title" data-ignore="true">Content</p></section>`;
    const data   = { blocks: { title: 'New' } };
    const zones  = [zone('title')];
    const result = applyHtmlContent(html, data, zones);
    expect(result).not.toContain('data-ignore');
  });

  it('should handle ignored zones in repeatable slides', () => {
    const html = `
      <section>
        <p data-block="item_name">Item</p>
        <p data-block="item_desc">Desc</p>
      </section>
      <section>
        <p data-block="outro">End</p>
      </section>`;
    const data = {
      slides: {
        item: {
          instances: [
            { item_name: 'Alpha', item_desc: 'Desc A' },
            { item_name: 'Beta', item_desc: 'Desc B' }
          ]
        }
      }
    };
    const repSlides = [{ slideIndex: 1, key: 'item', prompt: 'one per item' }];
    const zones = [
      { ...repZone('item_name', 1, true), ignored: false },
      { ...repZone('item_desc', 1, true), ignored: true },
      zone('outro', 2, true)
    ];
    const result = applyHtmlContent(html, data, zones, repSlides);
    // item_name should be patched, item_desc should remain unchanged
    expect(result).toContain('Alpha');
    expect(result).toContain('Beta');
    expect(result).toContain('Desc'); // original descriptor text
    expect(result).toContain('End');
  });

  it('should skip patching children of ignored parent zone', () => {
    const html = `<section>
      <div data-block="parent">
        <p data-zone="child1">Child 1</p>
        <p data-zone="child2">Child 2</p>
      </div>
    </section>`;
    const data = {
      blocks: { parent: { value: '<div><p>New Child 1</p><p>New Child 2</p></div>' } }
    };
    const zones = [
      { ...zone('parent'), ignored: true },
      { ...zone('child1'), ignored: false },
      { ...zone('child2'), ignored: false }
    ];
    const result = applyHtmlContent(html, data, zones);
    // Parent is ignored, so children should not be patched
    expect(result).toContain('Child 1');
    expect(result).toContain('Child 2');
    expect(result).not.toContain('New Child 1');
  });

  it('should treat child zones as ignored when parent is ignored', () => {
    const html = `<section>
      <div data-block="parent">
        <p>Original content</p>
      </div>
    </section>`;
    const data = {
      blocks: { parent: { value: '<div><p>New content</p></div>' } }
    };
    const zones = [
      { ...zone('parent'), ignored: true }
    ];
    const result = applyHtmlContent(html, data, zones);
    // Parent is ignored, so content should remain unchanged
    expect(result).toContain('Original content');
    expect(result).not.toContain('New content');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Attribute stripping
// ─────────────────────────────────────────────────────────────────────────────

describe('applyHtmlContent — attribute stripping', () => {
  it('strips all authoring attributes from the output', () => {
    const html = `<section>
      <p data-block="x" data-hint="h" data-auto="true" data-type="text">val</p>
      <div data-block="b" data-prompt="p">inner</div>
    </section>`;
    const data  = { blocks: { x: 'val', b: { value: 'new inner' } } };
    const zones = [
      zone('x'),
      zone('b'),
    ];
    const result = applyHtmlContent(html, data, zones);
    const strippedAttrs = ['data-zone', 'data-block', 'data-prompt', 'data-hint',
                           'data-auto', 'data-label-for', 'data-repeatable', 'data-type'];
    strippedAttrs.forEach(attr => {
      expect(result).not.toContain(attr);
    });
  });
});
