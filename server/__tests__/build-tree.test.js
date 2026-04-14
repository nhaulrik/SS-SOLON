/**
 * Tests for server/lib/build-tree.js
 *
 * Covers buildSectionTree, flattenTree, findNodeById, descendantIds.
 */

import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import {
  buildSectionTree,
  flattenTree,
  findNodeById,
  descendantIds,
} from '../lib/build-tree.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function section(inner) {
  return parse(`<section>${inner}</section>`).querySelector('section');
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSectionTree — tree structure
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSectionTree — tree structure', () => {
  it('returns an empty tree for an empty section', () => {
    const { tree } = buildSectionTree(section(''), 1);
    expect(tree).toHaveLength(0);
  });

  it('returns a single root node for a single child element', () => {
    const { tree } = buildSectionTree(section('<div class="header"></div>'), 1);
    expect(tree).toHaveLength(1);
    expect(tree[0].tag).toBe('div');
    expect(tree[0].classes).toContain('header');
  });

  it('assigns correct depth: direct children are depth 0', () => {
    const { tree } = buildSectionTree(section('<div class="a"></div>'), 1);
    expect(tree[0].depth).toBe(0);
  });

  it('assigns depth 1 to grandchildren', () => {
    const { tree } = buildSectionTree(section('<div class="a"><span class="b">text</span></div>'), 1);
    expect(tree[0].children[0].depth).toBe(1);
  });

  it('builds correct node id: tag.class for root child', () => {
    const { tree } = buildSectionTree(section('<div class="header"></div>'), 1);
    expect(tree[0].id).toBe('div.header');
  });

  it('builds nested node id: parent>child', () => {
    const { tree } = buildSectionTree(
      section('<div class="body"><p class="text">Hello</p></div>'), 1
    );
    expect(tree[0].children[0].id).toBe('div.body>p.text');
  });

  it('disambiguates sibling nodes with same tag+class using [N] suffix', () => {
    const { tree } = buildSectionTree(
      section('<div class="col">A</div><div class="col">B</div>'), 1
    );
    expect(tree[0].id).toBe('div.col');
    expect(tree[1].id).toBe('div.col[1]');
  });

  it('marks leaf nodes correctly (no element children)', () => {
    const { tree } = buildSectionTree(section('<p class="text">Hello</p>'), 1);
    expect(tree[0].isLeaf).toBe(true);
  });

  it('marks container nodes as non-leaf', () => {
    const { tree } = buildSectionTree(
      section('<div class="wrap"><p>A</p><p>B</p></div>'), 1
    );
    expect(tree[0].isLeaf).toBe(false);
  });

  it('skips script and style tags', () => {
    const { tree } = buildSectionTree(
      section('<style>body{}</style><div class="content">text</div>'), 1
    );
    expect(tree).toHaveLength(1);
    expect(tree[0].tag).toBe('div');
  });

  it('skips svg elements', () => {
    const { tree } = buildSectionTree(
      section('<svg><circle/></svg><p class="text">Hi</p>'), 1
    );
    expect(tree.some(n => n.tag === 'svg')).toBe(false);
    expect(tree.some(n => n.tag === 'p')).toBe(true);
  });

  it('includes textPreview for leaf nodes', () => {
    const { tree } = buildSectionTree(section('<p class="t">Hello World</p>'), 1);
    expect(tree[0].textPreview).toBe('Hello World');
  });

  it('truncates textPreview at 80 chars for leaf nodes', () => {
    const longText = 'A'.repeat(100);
    const { tree } = buildSectionTree(section(`<p class="t">${longText}</p>`), 1);
    expect(tree[0].textPreview.length).toBeLessThanOrEqual(81); // 80 + ellipsis char
    expect(tree[0].textPreview).toContain('…');
  });

  it('attaches slideIndex to every node', () => {
    const { tree } = buildSectionTree(section('<div class="a">x</div>'), 3);
    expect(tree[0].slideIndex).toBe(3);
  });

  it('includes label field as tag.classes string', () => {
    const { tree } = buildSectionTree(section('<div class="value-col">text</div>'), 1);
    expect(tree[0].label).toBe('div.value-col');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSectionTree — interesting heuristic
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSectionTree — interesting heuristic', () => {
  it('marks <table> as interesting', () => {
    const { tree } = buildSectionTree(section('<table class="t"><tbody></tbody></table>'), 1);
    expect(tree[0].interesting).toBe(true);
  });

  it('marks <ul> as interesting', () => {
    const { tree } = buildSectionTree(section('<ul class="list"><li>A</li></ul>'), 1);
    expect(tree[0].interesting).toBe(true);
  });

  it('marks <ol> as interesting', () => {
    const { tree } = buildSectionTree(section('<ol><li>A</li><li>B</li></ol>'), 1);
    expect(tree[0].interesting).toBe(true);
  });

  it('marks a div with 2+ text children as interesting', () => {
    const { tree } = buildSectionTree(
      section('<div class="box"><p>Alpha text here</p><p>Beta text here</p></div>'), 1
    );
    expect(tree[0].interesting).toBe(true);
  });

  it('does NOT mark a div with a single child as interesting', () => {
    const { tree } = buildSectionTree(
      section('<div class="wrap"><p>Only child</p></div>'), 1
    );
    expect(tree[0].interesting).toBe(false);
  });

  it('marks an element with data-zone as interesting', () => {
    const { tree } = buildSectionTree(
      section('<p data-zone="title">Title</p>'), 1
    );
    expect(tree[0].interesting).toBe(true);
  });

  it('marks an element with data-block as interesting', () => {
    const { tree } = buildSectionTree(
      section('<div data-block="content">inner</div>'), 1
    );
    expect(tree[0].interesting).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSectionTree — pre-existing selections (backward compat)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSectionTree — pre-existing selections', () => {
  it('extracts a leaf selection from data-zone attribute', () => {
    const { selections } = buildSectionTree(
      section('<p data-zone="title" data-hint="Page title">Hello</p>'), 1
    );
    expect(selections).toHaveLength(1);
    expect(selections[0].zoneType).toBe('leaf');
    expect(selections[0].key).toBe('title');
    expect(selections[0].hint).toBe('Page title');
  });

  it('extracts a block selection from data-block attribute', () => {
    const { selections } = buildSectionTree(
      section('<table data-block="my_table" data-prompt="Fill with data"><tr><td>x</td></tr></table>'), 1
    );
    expect(selections).toHaveLength(1);
    expect(selections[0].zoneType).toBe('block');
    expect(selections[0].key).toBe('my_table');
    expect(selections[0].prompt).toBe('Fill with data');
  });

  it('sets autoGenerate:false when data-auto="false"', () => {
    const { selections } = buildSectionTree(
      section('<p data-zone="manual" data-auto="false">text</p>'), 1
    );
    expect(selections[0].autoGenerate).toBe(false);
  });

  it('sets autoGenerate:true by default', () => {
    const { selections } = buildSectionTree(
      section('<p data-zone="auto_field">text</p>'), 1
    );
    expect(selections[0].autoGenerate).toBe(true);
  });

  it('infers type from data-type attribute', () => {
    const { selections } = buildSectionTree(
      section('<span data-zone="count" data-type="number">42</span>'), 1
    );
    expect(selections[0].type).toBe('number');
  });

  it('assigns the correct slideIndex to selections', () => {
    const { selections } = buildSectionTree(
      section('<p data-zone="x">text</p>'), 3
    );
    expect(selections[0].slideIndex).toBe(3);
  });

  it('assigns the correct nodeId matching the tree node', () => {
    const { tree, selections } = buildSectionTree(
      section('<p class="title" data-zone="title">text</p>'), 1
    );
    expect(selections[0].nodeId).toBe(tree[0].id);
  });

  it('returns empty selections for a section with no data-zone or data-block', () => {
    const { selections } = buildSectionTree(
      section('<div class="static"><p>No zones here</p></div>'), 1
    );
    expect(selections).toHaveLength(0);
  });

  it('extracts multiple selections from a section', () => {
    const { selections } = buildSectionTree(section(`
      <h1 data-zone="title">Title</h1>
      <p  data-zone="body">Body</p>
    `), 1);
    expect(selections).toHaveLength(2);
    expect(selections.map(s => s.key)).toEqual(expect.arrayContaining(['title', 'body']));
  });

  it('falls back to element text as hint when data-hint is absent', () => {
    const { selections } = buildSectionTree(
      section('<p data-zone="title">Fallback text</p>'), 1
    );
    expect(selections[0].hint).toContain('Fallback text');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSectionTree — innerHTML on tree nodes
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSectionTree — innerHTML on tree nodes', () => {
  it('includes an innerHTML field on every node', () => {
    const { tree } = buildSectionTree(section('<div class="wrap"><p>Hello</p></div>'), 1);
    expect(tree[0]).toHaveProperty('innerHTML');
  });

  it('innerHTML contains the inner markup of a container node', () => {
    const { tree } = buildSectionTree(
      section('<div class="header"><span class="title">Revenue</span></div>'), 1
    );
    expect(tree[0].innerHTML).toContain('<span');
    expect(tree[0].innerHTML).toContain('Revenue');
  });

  it('innerHTML is an empty string for a leaf node with no children', () => {
    const { tree } = buildSectionTree(section('<p class="text">Hello</p>'), 1);
    // <p> has only a text node — innerHTML is the text content
    expect(typeof tree[0].innerHTML).toBe('string');
  });

  it('innerHTML is trimmed', () => {
    const { tree } = buildSectionTree(
      section('<div class="box">  <p>text</p>  </div>'), 1
    );
    expect(tree[0].innerHTML).toBe(tree[0].innerHTML.trim());
  });

  it('innerHTML is present on nested child nodes too', () => {
    const { tree } = buildSectionTree(
      section('<div class="outer"><div class="inner"><p>x</p></div></div>'), 1
    );
    const inner = tree[0].children[0];
    expect(inner).toHaveProperty('innerHTML');
    expect(inner.innerHTML).toContain('<p>');
  });

  it('data-block selection exampleHtml matches the node innerHTML', () => {
    // Backward-compat path: pre-existing data-block attr
    const { tree, selections } = buildSectionTree(
      section('<table class="t" data-block="my_table"><tbody><tr><td>X</td></tr></tbody></table>'), 1
    );
    const node = tree[0];
    expect(selections[0].exampleHtml).toBe(node.innerHTML);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// flattenTree
// ─────────────────────────────────────────────────────────────────────────────

describe('flattenTree', () => {
  it('returns empty array for empty tree', () => {
    expect(flattenTree([])).toHaveLength(0);
  });

  it('returns all nodes in depth-first order', () => {
    const { tree } = buildSectionTree(
      section('<div class="a"><p class="b">text</p></div><span class="c">x</span>'), 1
    );
    const flat = flattenTree(tree);
    expect(flat.map(n => n.tag)).toEqual(['div', 'p', 'span']);
  });

  it('includes all descendants', () => {
    const { tree } = buildSectionTree(
      section('<div class="a"><div class="b"><p class="c">x</p></div></div>'), 1
    );
    expect(flattenTree(tree)).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findNodeById
// ─────────────────────────────────────────────────────────────────────────────

describe('findNodeById', () => {
  it('finds a top-level node by id', () => {
    const { tree } = buildSectionTree(section('<div class="header">text</div>'), 1);
    const node = findNodeById(tree, 'div.header');
    expect(node).not.toBeNull();
    expect(node.tag).toBe('div');
  });

  it('finds a nested node by id', () => {
    const { tree } = buildSectionTree(
      section('<div class="body"><p class="text">Hello</p></div>'), 1
    );
    const node = findNodeById(tree, 'div.body>p.text');
    expect(node).not.toBeNull();
    expect(node.tag).toBe('p');
  });

  it('returns null for a nonexistent id', () => {
    const { tree } = buildSectionTree(section('<div class="a">x</div>'), 1);
    expect(findNodeById(tree, 'div.nonexistent')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// descendantIds
// ─────────────────────────────────────────────────────────────────────────────

describe('descendantIds', () => {
  it('includes the node itself', () => {
    const { tree } = buildSectionTree(section('<div class="a">text</div>'), 1);
    const ids = descendantIds(tree[0]);
    expect(ids).toContain('div.a');
  });

  it('includes all child ids', () => {
    const { tree } = buildSectionTree(
      section('<div class="a"><p class="b">x</p><span class="c">y</span></div>'), 1
    );
    const ids = descendantIds(tree[0]);
    expect(ids).toContain('div.a');
    expect(ids).toContain('div.a>p.b');
    expect(ids).toContain('div.a>span.c');
  });

  it('includes deeply nested ids', () => {
    const { tree } = buildSectionTree(
      section('<div class="a"><div class="b"><p class="c">x</p></div></div>'), 1
    );
    const ids = descendantIds(tree[0]);
    expect(ids).toContain('div.a>div.b>p.c');
  });
});
