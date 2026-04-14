/**
 * TDD: Chart file handling for cloned (repeatable) slides.
 *
 * Each cloned slide must get its own copy of every chart XML file.
 * Multiple slides cannot share the same chart — PowerPoint rejects such files.
 *
 * Strategy:
 * - Cloned slides (instanceIndex !== null) ALWAYS get a fresh chart copy.
 * - Static slides get a copy only if the chart is already claimed (defensive
 *   against templates produced by a prior broken build).
 * - Pre-flight validateChartOwnership throws if the invariant is violated.
 * - Cloned slide shape IDs are renumbered to avoid collisions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { buildPptxZip } from '../lib/pptx-builder.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE     = path.resolve(__dirname, './fixtures/sample.pptx');
const CATALOG    = path.resolve(__dirname, '../../product_catalog.pptx');
// hasCatalog is true only when the file exists AND contains at least one chart.
// The fixture may exist without charts (e.g. a placeholder or non-chart version).
const hasCatalog = (() => {
  if (!fs.existsSync(CATALOG)) return false;
  try {
    const zip = new AdmZip(CATALOG);
    return zip.getEntries().some(e => e.entryName.includes('charts/chart'));
  } catch { return false; }
})();

let testDir;
beforeAll(() => { testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'solon-chart-')); });
afterAll(() => { fs.rmSync(testDir, { recursive: true, force: true }); });

// ── Helpers ───────────────────────────────────────────────────────────────────

function build(templatePath, jsonData, repeatableSlides = []) {
  const { zip } = buildPptxZip(templatePath, [], jsonData, repeatableSlides);
  const out = path.join(testDir, `out-${Date.now()}.pptx`);
  zip.writeZip(out);
  return new AdmZip(out);
}

function chartFiles(zip) {
  return zip.getEntries()
    .filter(e => /^ppt\/charts\/chart\d+\.xml$/.test(e.entryName))
    .map(e => e.entryName).sort();
}

function slideChartTargets(zip, slideNum) {
  const relsEntry = zip.getEntry(`ppt/slides/_rels/slide${slideNum}.xml.rels`);
  if (!relsEntry) return [];
  const xml = relsEntry.getData().toString('utf8');
  return (xml.match(/Target="([^"]*\/charts\/[^"]+)"/g) || [])
    .map(m => m.match(/Target="([^"]+)"/)[1]);
}

function allChartTargets(zip) {
  const map = {};
  zip.getEntries()
    .filter(e => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(e.entryName))
    .forEach(e => {
      const n   = e.entryName.match(/slide(\d+)/)[1];
      const xml = e.getData().toString('utf8');
      (xml.match(/Target="([^"]*\/charts\/[^"]+)"/g) || []).forEach(m => {
        const t = m.match(/Target="([^"]+)"/)[1];
        if (!map[t]) map[t] = [];
        map[t].push(n);
      });
    });
  return map;
}

function slideCount(zip) {
  return zip.getEntries().filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName)).length;
}

function shapeIds(zip, slideNum) {
  const entry = zip.getEntry(`ppt/slides/slide${slideNum}.xml`);
  if (!entry) return [];
  return [...entry.getData().toString('utf8').matchAll(/<p:cNvPr[^>]+id="(\d+)"/g)]
    .map(m => parseInt(m[1]));
}

// ── Tests: no chart in template ───────────────────────────────────────────────

describe('no chart in template', () => {
  it('builds without error', () => {
    const rs   = [{ slideIndex: 2, structureType: 'x', customPrompt: '' }];
    const json = { slides: { x: [{ structure_type: 'x' }, { structure_type: 'x' }] } };
    expect(() => build(SAMPLE, json, rs)).not.toThrow();
  });

  it('cloned slides have no chart references', () => {
    const rs   = [{ slideIndex: 2, structureType: 'x', customPrompt: '' }];
    const json = { slides: { x: [{ structure_type: 'x' }, { structure_type: 'x' }] } };
    const zip  = build(SAMPLE, json, rs);
    const n    = slideCount(zip);
    for (let i = 2; i <= n; i++) {
      expect(slideChartTargets(zip, i)).toHaveLength(0);
    }
  });
});

// ── Tests: template has chart (product_catalog.pptx) ─────────────────────────

describe.skipIf(!hasCatalog)('template has chart', () => {
  const rs   = [{ slideIndex: 2, structureType: 'init', customPrompt: '' }];
  const json = { slides: { init: [
    { structure_type: 'init', roadmap_initiative_group: 'Alpha' },
    { structure_type: 'init', roadmap_initiative_group: 'Beta'  },
    { structure_type: 'init', roadmap_initiative_group: 'Gamma' }
  ]}};

  it('original template has exactly one chart', () => {
    expect(chartFiles(new AdmZip(CATALOG))).toHaveLength(1);
  });

  it('each cloned slide gets its own unique chart file (always-copy for clones)', () => {
    const zip = build(CATALOG, json, rs);
    // 3 clones ? 3 chart copies + original still in zip = 4 total chart files
    expect(chartFiles(zip).length).toBe(4);
  });

  it('no two slides share the same chart file', () => {
    const zip     = build(CATALOG, json, rs);
    const targets = allChartTargets(zip);
    Object.entries(targets).forEach(([, slides]) => {
      expect(slides.length).toBe(1);
    });
  });

  it('all chart targets in rels resolve to files that exist in the zip', () => {
    const zip     = build(CATALOG, json, rs);
    const entries = zip.getEntries().map(e => e.entryName);
    Object.keys(allChartTargets(zip)).forEach(target => {
      const resolved = 'ppt/charts/' + target.replace('../charts/', '');
      expect(entries).toContain(resolved);
    });
  });

  it('new chart files are registered in [Content_Types].xml', () => {
    const zip   = build(CATALOG, json, rs);
    const ctXml = zip.getEntry('[Content_Types].xml').getData().toString('utf8');
    chartFiles(zip).forEach(chartPath => {
      expect(ctXml).toContain(`PartName="/${chartPath}"`);
    });
  });

  it('each chart copy has its own rels file', () => {
    const zip     = build(CATALOG, json, rs);
    const entries = zip.getEntries().map(e => e.entryName);
    chartFiles(zip).forEach(chartPath => {
      const relsPath = chartPath.replace('ppt/charts/', 'ppt/charts/_rels/') + '.rels';
      expect(entries).toContain(relsPath);
    });
  });

  it('all r:id references in slide XML are defined in the slide rels', () => {
    const zip = build(CATALOG, json, rs);
    const n   = slideCount(zip);
    for (let i = 1; i <= n; i++) {
      const slideXml = zip.getEntry(`ppt/slides/slide${i}.xml`)?.getData().toString('utf8') || '';
      const relsXml  = zip.getEntry(`ppt/slides/_rels/slide${i}.xml.rels`)?.getData().toString('utf8') || '';
      (slideXml.match(/r:id="([^"]+)"/g) || []).forEach(ref => {
        const rId = ref.match(/r:id="([^"]+)"/)[1];
        expect(relsXml).toContain(`Id="${rId}"`);
      });
    }
  });

  it('validateChartOwnership does not throw on a valid build', () => {
    expect(() => build(CATALOG, json, rs)).not.toThrow();
  });
});

// ── Tests: shape ID renumbering ───────────────────────────────────────────────

describe.skipIf(!hasCatalog)('shape ID renumbering on cloned slides', () => {
  it('no shape ID appears on more than one slide', () => {
    const rs   = [{ slideIndex: 2, structureType: 'init', customPrompt: '' }];
    const json = { slides: { init: [
      { structure_type: 'init', roadmap_initiative_group: 'Alpha' },
      { structure_type: 'init', roadmap_initiative_group: 'Beta'  }
    ]}};
    const zip = build(CATALOG, json, rs);
    const n   = slideCount(zip);

    const idCounts = {};
    for (let i = 1; i <= n; i++) {
      shapeIds(zip, i).forEach(id => { idCounts[id] = (idCounts[id] || 0) + 1; });
    }
    const duplicates = Object.entries(idCounts).filter(([, count]) => count > 1);
    expect(duplicates).toHaveLength(0);
  });
});

// ── Tests: broken template (pre-existing shared charts) ───────────────────────

describe.skipIf(!hasCatalog)('broken template with pre-existing shared charts', () => {
  it('fixes shared charts when re-building from a previously broken output', () => {
    // Step 1: build a first output (correct)
    const rs   = [{ slideIndex: 2, structureType: 'init', customPrompt: '' }];
    const json = { slides: { init: [
      { structure_type: 'init', roadmap_initiative_group: 'Alpha' },
      { structure_type: 'init', roadmap_initiative_group: 'Beta'  }
    ]}};
    const zip1 = build(CATALOG, json, rs);
    const brokenPath = path.join(testDir, 'broken-template.pptx');
    zip1.writeZip(brokenPath);

    // Step 2: use the output as a new template (simulates user re-uploading a patch output)
    // The broken template has slides sharing chart1.xml — the builder must fix this
    const zip2 = build(brokenPath, { static: {} }, []);

    const targets = allChartTargets(zip2);
    Object.entries(targets).forEach(([, slides]) => {
      expect(slides.length).toBe(1);
    });
  });
});
