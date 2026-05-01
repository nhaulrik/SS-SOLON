/**
 * Tests for server/lib/selections-to-zones.js
 *
 * Covers selectionsToZones and resolveConflicts.
 */

import { describe, it, expect } from 'vitest';
import { selectionsToZones, resolveConflicts } from '../lib/zones/selections-to-zones.js';

// ── Factories ─────────────────────────────────────────────────────────────────

const leafSel = (nodeId, key, opts = {}) => ({
  nodeId,
  slideIndex:   opts.slideIndex   ?? 1,
  zoneType:     'leaf',
  key,
  hint:         opts.hint         ?? 'a hint',
  prompt:       '',
  autoGenerate: opts.autoGenerate ?? true,
  type:         opts.type         ?? 'text',
});

const blockSel = (nodeId, key, opts = {}) => ({
  nodeId,
  slideIndex:   opts.slideIndex ?? 1,
  zoneType:     'block',
  key,
  hint:         opts.hint   ?? 'a prompt',
  prompt:       opts.prompt ?? 'a prompt',
  autoGenerate: true,
  type:         'block',
});

// ─────────────────────────────────────────────────────────────────────────────
// selectionsToZones
// ─────────────────────────────────────────────────────────────────────────────

describe('selectionsToZones', () => {
  it('returns an empty array for empty selections', () => {
    expect(selectionsToZones([])).toHaveLength(0);
  });

  it('converts a leaf selection to a block zone', () => {
    const zones = selectionsToZones([leafSel('div.title', 'title')]);
    expect(zones).toHaveLength(1);
    expect(zones[0].zoneType).toBe('block');
    expect(zones[0].key).toBe('title');
    expect(zones[0].type).toBe('block');
  });

  it('converts a block selection to a block zone', () => {
    const zones = selectionsToZones([blockSel('div.table', 'my_table', { prompt: 'Fill it' })]);
    expect(zones).toHaveLength(1);
    expect(zones[0].zoneType).toBe('block');
    expect(zones[0].key).toBe('my_table');
    expect(zones[0].type).toBe('block');
    expect(zones[0].prompt).toBe('Fill it');
    expect(zones[0].autoGenerate).toBe(true);
  });

  it('preserves nodeId on each zone', () => {
    const zones = selectionsToZones([leafSel('div.body>p.text', 'body')]);
    expect(zones[0].nodeId).toBe('div.body>p.text');
  });

  it('preserves slideIndex', () => {
    const zones = selectionsToZones([leafSel('p.x', 'x', { slideIndex: 3 })]);
    expect(zones[0].slideIndex).toBe(3);
  });

  it('sets elementOrder from array position', () => {
    const zones = selectionsToZones([
      leafSel('p.a', 'a'),
      leafSel('p.b', 'b'),
      leafSel('p.c', 'c'),
    ]);
    expect(zones[0].elementOrder).toBe(0);
    expect(zones[1].elementOrder).toBe(1);
    expect(zones[2].elementOrder).toBe(2);
  });

  it('respects autoGenerate:false on block zones', () => {
    const zones = selectionsToZones([leafSel('p.x', 'x', { autoGenerate: false })]);
    expect(zones[0].autoGenerate).toBe(true);
  });

  it('always sets autoGenerate:true on block zones', () => {
    const sel  = { ...blockSel('div.t', 'tbl'), autoGenerate: false }; // override
    const zones = selectionsToZones([sel]);
    expect(zones[0].autoGenerate).toBe(true);
  });

  it('always sets type:block for leaf zones regardless of selection type', () => {
    const zones = selectionsToZones([leafSel('span.count', 'count', { type: 'number' })]);
    expect(zones[0].type).toBe('block');
  });

  it('always sets type:block for block zones regardless of selection type', () => {
    const sel  = { ...blockSel('div.t', 'tbl'), type: 'text' }; // wrong type
    const zones = selectionsToZones([sel]);
    expect(zones[0].type).toBe('block');
  });

  it('sets isRepeatable:false and repeatableKey:null for all zones', () => {
    const zones = selectionsToZones([leafSel('p.x', 'x'), blockSel('div.y', 'y')]);
    for (const z of zones) {
      expect(z.isRepeatable).toBe(false);
      expect(z.repeatableKey).toBeNull();
    }
  });

  it('preserves hint on leaf zones', () => {
    const zones = selectionsToZones([leafSel('p.x', 'x', { hint: 'My hint' })]);
    expect(zones[0].hint).toBe('My hint');
  });

  it('converts multiple selections in order', () => {
    const sels  = [leafSel('p.a', 'a'), blockSel('table.t', 'tbl'), leafSel('p.b', 'b')];
    const zones = selectionsToZones(sels);
    expect(zones.map(z => z.key)).toEqual(['a', 'tbl', 'b']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// selectionsToZones — exampleHtml propagation
// ─────────────────────────────────────────────────────────────────────────────

describe('selectionsToZones — exampleHtml', () => {
  it('propagates exampleHtml from a block selection to the zone', () => {
    const sel   = { ...blockSel('div.header', 'header'), exampleHtml: '<span>Revenue</span>' };
    const zones = selectionsToZones([sel]);
    expect(zones[0].exampleHtml).toBe('<span>Revenue</span>');
  });

  it('exampleHtml is undefined on a block zone when not present on selection', () => {
    const zones = selectionsToZones([blockSel('div.t', 'table')]);
    expect(zones[0].exampleHtml).toBeUndefined();
  });

  it('exampleHtml is undefined on a block zone when selection has empty string', () => {
    const sel   = { ...blockSel('div.t', 'table'), exampleHtml: '' };
    const zones = selectionsToZones([sel]);
    expect(zones[0].exampleHtml).toBeUndefined();
  });

  it('exampleHtml is preserved on leaf zones when provided', () => {
    const sel   = { ...leafSel('p.x', 'x'), exampleHtml: '<b>example content</b>' };
    const zones = selectionsToZones([sel]);
    expect(zones[0].exampleHtml).toBe('<b>example content</b>');
  });

  it('preserves multiline HTML in exampleHtml', () => {
    const html  = '<tbody>\n  <tr><td class="name">X</td></tr>\n</tbody>';
    const sel   = { ...blockSel('table.t', 'rows'), exampleHtml: html };
    const zones = selectionsToZones([sel]);
    expect(zones[0].exampleHtml).toBe(html);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveConflicts
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveConflicts', () => {
  it('returns unchanged selections when there are no conflicts', () => {
    const sels = [
      leafSel('div.header>p.title', 'title'),
      leafSel('div.body>p.body', 'body'),
    ];
    const { resolved, removed } = resolveConflicts(sels);
    expect(resolved).toHaveLength(2);
    expect(removed).toHaveLength(0);
  });

  it('removes a leaf zone that is a descendant of a block zone', () => {
    const sels = [
      blockSel('div.value-col',             'value_block'),
      leafSel( 'div.value-col>ul.bullets',  'business_value'),
    ];
    const { resolved, removed } = resolveConflicts(sels);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].key).toBe('value_block');
    expect(removed).toHaveLength(1);
    expect(removed[0].key).toBe('business_value');
  });

  it('keeps the block zone itself', () => {
    const sels = [
      blockSel('div.box', 'box'),
      leafSel( 'div.box>p.text', 'text'),
    ];
    const { resolved } = resolveConflicts(sels);
    expect(resolved.some(s => s.zoneType === 'block' && s.key === 'box')).toBe(true);
  });

  it('does not remove a sibling leaf zone (same prefix but not descendant)', () => {
    const sels = [
      blockSel('div.col',       'col_block'),
      leafSel( 'div.col[1]>p.text', 'sibling_text'),
    ];
    const { resolved, removed } = resolveConflicts(sels);
    // 'div.col[1]>p.text' does NOT start with 'div.col>' so it is NOT a descendant
    expect(removed).toHaveLength(0);
    expect(resolved).toHaveLength(2);
  });

  it('removes multiple descendants of a single block zone', () => {
    const sels = [
      blockSel('div.box',              'box'),
      leafSel( 'div.box>p.title',      'title'),
      leafSel( 'div.box>ul.bullets',   'bullets'),
      leafSel( 'div.box>span.count',   'count'),
    ];
    const { resolved, removed } = resolveConflicts(sels);
    expect(resolved).toHaveLength(1);
    expect(removed).toHaveLength(3);
  });

  it('handles multiple block zones each superseding their own descendants', () => {
    const sels = [
      blockSel('div.col',          'col_a'),
      leafSel( 'div.col>ul.list',  'list_a'),
      blockSel('div.col[1]',           'col_b'),
      leafSel( 'div.col[1]>ul.list',   'list_b'),
    ];
    const { resolved, removed } = resolveConflicts(sels);
    expect(resolved).toHaveLength(2);
    expect(resolved.map(s => s.key)).toEqual(expect.arrayContaining(['col_a', 'col_b']));
    expect(removed).toHaveLength(2);
  });

  it('does not remove a leaf zone at the same level as the block zone', () => {
    const sels = [
      blockSel('div.col',     'col'),
      leafSel( 'div.header',  'header'),
    ];
    const { resolved } = resolveConflicts(sels);
    expect(resolved).toHaveLength(2);
  });

  it('returns empty resolved and removed for empty input', () => {
    const { resolved, removed } = resolveConflicts([]);
    expect(resolved).toHaveLength(0);
    expect(removed).toHaveLength(0);
  });

  it('keeps all selections when there are only leaf zones', () => {
    const sels = [leafSel('p.a', 'a'), leafSel('p.b', 'b')];
    const { resolved, removed } = resolveConflicts(sels);
    expect(resolved).toHaveLength(2);
    expect(removed).toHaveLength(0);
  });

  it('keeps all selections when there are only block zones', () => {
    const sels = [blockSel('div.a', 'a'), blockSel('div.b', 'b')];
    const { resolved, removed } = resolveConflicts(sels);
    expect(resolved).toHaveLength(2);
    expect(removed).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// selectionsToZones — ignored field
// ─────────────────────────────────────────────────────────────────────────────

describe('selectionsToZones — ignored field', () => {
  it('should preserve ignored=true from selection to zone', () => {
    const sel   = { ...leafSel('p.x', 'x'), ignored: true };
    const zones = selectionsToZones([sel]);
    expect(zones[0].ignored).toBe(true);
  });

  it('should preserve ignored=false from selection to zone', () => {
    const sel   = { ...leafSel('p.x', 'x'), ignored: false };
    const zones = selectionsToZones([sel]);
    expect(zones[0].ignored).toBe(false);
  });

  it('should default ignored to false when not provided', () => {
    const zones = selectionsToZones([leafSel('p.x', 'x')]);
    expect(zones[0].ignored).toBe(false);
  });

  it('should preserve ignored field for block zones', () => {
    const sel   = { ...blockSel('div.t', 'table'), ignored: true };
    const zones = selectionsToZones([sel]);
    expect(zones[0].ignored).toBe(true);
  });

  it('should handle mixed ignored and non-ignored zones', () => {
    const sels = [
      { ...leafSel('p.a', 'a'), ignored: true },
      { ...leafSel('p.b', 'b'), ignored: false },
      { ...blockSel('div.t', 'tbl'), ignored: true }
    ];
    const zones = selectionsToZones(sels);
    expect(zones[0].ignored).toBe(true);
    expect(zones[1].ignored).toBe(false);
    expect(zones[2].ignored).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// selectionsToZones — repeatableSlides integration
// ─────────────────────────────────────────────────────────────────────────────

describe('selectionsToZones — repeatableSlides', () => {
  const repSlides = [{ slideIndex: 2, key: 'brand_slide', prompt: 'one per brand' }];

  it('marks zones on repeatable slides as isRepeatable:true', () => {
    const sels  = [leafSel('p.title', 'title', { slideIndex: 2 })];
    const zones = selectionsToZones(sels, repSlides);
    expect(zones[0].isRepeatable).toBe(true);
  });

  it('leaves zones on static slides as isRepeatable:false', () => {
    const sels  = [leafSel('p.title', 'title', { slideIndex: 1 })];
    const zones = selectionsToZones(sels, repSlides);
    expect(zones[0].isRepeatable).toBe(false);
  });

  it('propagates unique:true from selection (default)', () => {
    const sels  = [leafSel('p.title', 'title', { slideIndex: 2 })];
    const zones = selectionsToZones(sels, repSlides);
    expect(zones[0].unique).toBe(true);
  });

  it('propagates unique:false from selection', () => {
    const sels  = [{ ...leafSel('p.footer', 'footer', { slideIndex: 2 }), unique: false }];
    const zones = selectionsToZones(sels, repSlides);
    expect(zones[0].unique).toBe(false);
  });

  it('zones on static slides have unique:undefined (not applicable)', () => {
    const sels  = [leafSel('p.title', 'title', { slideIndex: 1 })];
    const zones = selectionsToZones(sels, repSlides);
    expect(zones[0].unique).toBeUndefined();
  });

  it('handles empty repeatableSlides array', () => {
    const sels  = [leafSel('p.title', 'title', { slideIndex: 1 })];
    const zones = selectionsToZones(sels, []);
    expect(zones[0].isRepeatable).toBe(false);
    expect(zones[0].unique).toBeUndefined();
  });

  it('handles missing repeatableSlides argument (backward compat)', () => {
    const sels  = [leafSel('p.title', 'title', { slideIndex: 1 })];
    const zones = selectionsToZones(sels);
    expect(zones[0].isRepeatable).toBe(false);
  });

  it('mixed slide: some zones repeatable, some static', () => {
    const sels = [
      leafSel('p.deck_title', 'deck_title', { slideIndex: 1 }),
      leafSel('p.brand_name', 'brand_name', { slideIndex: 2 }),
      { ...leafSel('p.footer', 'footer', { slideIndex: 2 }), unique: false },
    ];
    const zones = selectionsToZones(sels, repSlides);
    expect(zones[0].isRepeatable).toBe(false);
    expect(zones[0].unique).toBeUndefined();
    expect(zones[1].isRepeatable).toBe(true);
    expect(zones[1].unique).toBe(true);
    expect(zones[2].isRepeatable).toBe(true);
    expect(zones[2].unique).toBe(false);
  });
});
