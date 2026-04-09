const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");
const ThemeManager = require("../utils/theme");
const { loadJSONFile, getField, ensureDirectory, formatTimestamp } = require("../utils/fileUtils");

// ====================== CONFIG ======================
const INPUT_JSON = path.resolve(__dirname, "..", "data", "input.json");
const TEMPLATE_JSON = path.resolve(__dirname, "..", "data", "slide_templates.json");
const THEME_JSON = path.resolve(__dirname, "..", "data", "theme.json");
const OUTPUT_DIR = path.resolve(__dirname, "..", "output");
const OUTPUT_PREFIX = "Solon_Roadmap_SteerCo_2026";

// Initialize theme manager
const theme = new ThemeManager();

function addSlideHeader(slide, pres, title, subtitle) {
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.05, fill: { color: theme.getColor('darkTeal') } });
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.08, h: 1.05, fill: { color: theme.getColor('coral') } });
  slide.addText(title, { x: 0.2, y: 0.07, w: 7, h: 0.55, fontSize: 20, bold: true, color: theme.getColor('white'), fontFace: theme.getFontFace('heading') });
  if (subtitle) {
    slide.addText(subtitle, { x: 0.2, y: 0.6, w: 9, h: 0.38, fontSize: 11, color: theme.getColor('lightTeal'), fontFace: theme.getFontFace() });
  }
  slide.addText("Netcompany", { x: 7.5, y: 0.08, w: 2.3, h: 0.4, fontSize: 12, bold: true, color: theme.getColor('lightTeal'), fontFace: theme.getFontFace(), align: "right" });
}

function addFooter(slide, pres, pageNum) {
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.45, w: 10, h: 0.175, fill: { color: theme.getColor('darkTeal') } });
  slide.addText("Solon Tax Product Roadmap 2026 | SteerCo", {
    x: 0.15, y: 5.44, w: 7, h: 0.18, fontSize: 8, color: theme.getColor('bgGrey'), fontFace: theme.getFontFace()
  });
  if (pageNum) slide.addText(String(pageNum), { x: 9.5, y: 5.44, w: 0.4, h: 0.18, fontSize: 8, color: theme.getColor('bgGrey'), fontFace: theme.getFontFace(), align: "right" });
}

function addKpiCard(slide, pres, x, y, w, h, value, label, unit) {
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: theme.getColor('darkTeal') }, line: { color: theme.getColor('medTeal') }, shadow: theme.getShadow() });
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.06, h, fill: { color: theme.getColor('coral') } });
  slide.addText(String(value), { x: x + 0.1, y: y + 0.1, w: w - 0.2, h: h * 0.48, fontSize: 22, bold: true, color: theme.getColor('white'), fontFace: theme.getFontFace(), align: "center" });
  if (unit) {
    slide.addText(unit, { x: x + 0.1, y: y + h * 0.52, w: w - 0.2, h: 0.22, fontSize: 9, color: theme.getColor('gold'), fontFace: theme.getFontFace(), align: "center" });
  }
  slide.addText(label, { x: x + 0.05, y: y + h * 0.68, w: w - 0.1, h: 0.36, fontSize: 9, color: theme.getColor('bgGrey'), fontFace: theme.getFontFace(), align: "center", wrap: true });
}

function renderShape(slide, pres, component) {
  const shapeType = pres.shapes[component.shape?.toUpperCase()] || pres.shapes.RECTANGLE;
  const opts = {
    x: component.x,
    y: component.y,
    w: component.w,
    h: component.h,
    fill: { color: theme.getColor(component.fill) || component.fill || theme.getColor('white') }
  };
  if (component.line) {
    opts.line = { color: theme.getColor(component.line.color) || component.line.color, width: component.line.width || 0.5 };
  }
  slide.addShape(shapeType, opts);
}

function renderText(slide, component, data) {
  const value = component.staticText ?? getField(data, component.bind);
  if (value === undefined || value === null) return;
  slide.addText(String(value), {
    x: component.x,
    y: component.y,
    w: component.w,
    h: component.h,
    fontSize: component.fontSize || 10,
    bold: component.bold || false,
    italic: component.italic || false,
    color: theme.getColor(component.color) || component.color || theme.getColor('nearBlack'),
    fontFace: theme.getFontFace(component.font || 'body'),
    align: component.align,
    wrap: component.wrap !== false,
    valign: component.valign,
    margin: component.margin
  });
}

function renderBulletList(slide, component, data) {
  const list = getField(data, component.bind);
  if (!Array.isArray(list) || !list.length) return;
  slide.addText(list.map(item => ({ text: item, options: { bullet: true } })), {
    x: component.x,
    y: component.y,
    w: component.w,
    h: component.h,
    fontSize: component.fontSize || 9,
    color: theme.getColor(component.color) || component.color || theme.getColor('textGrey'),
    fontFace: theme.getFontFace(component.font || 'body'),
    wrap: true
  });
}

function renderKpiRow(slide, pres, component, data) {
  const items = getField(data, component.bind);
  if (!Array.isArray(items)) return;
  const cardW = component.cardWidth || 2.2;
  const cardH = component.cardHeight || 1.05;
  const gap = component.gap !== undefined ? component.gap : 0.19;
  items.forEach((item, index) => {
    const x = component.x + index * (cardW + gap);
    addKpiCard(slide, pres, x, component.y, cardW, cardH, item.value, item.label, item.unit);
  });
}

function renderTable(slide, pres, component, data) {
  const table = getField(data, component.bind);
  if (!table || !Array.isArray(table.rows)) return;
  const title = component.title || table.title;
  if (title) {
    slide.addText(title, { x: component.x, y: component.y, w: component.w, h: 0.28, fontSize: component.titleFontSize || 9, bold: true, color: theme.getColor('coral'), fontFace: theme.getFontFace(component.font || 'heading') });
  }
  const rows = table.rows || [];
  const columns = component.columns || [];
  const header = columns.map(col => ({
    text: col.label,
    options: {
      bold: true,
      color: theme.getColor('white'),
      fill: { color: theme.getColor('darkTeal') },
      align: col.align || 'left',
      fontSize: component.fontSize || 9
    }
  }));
  const body = rows.map(row => columns.map(col => ({
    text: String(getField(row, col.key) ?? ''),
    options: {
      align: col.align || 'left',
      fontSize: component.fontSize || 9
    }
  })));
  const tableY = component.y + (title ? 0.32 : 0);
  slide.addTable([header, ...body], {
    x: component.x,
    y: tableY,
    w: component.w,
    h: component.h,
    colW: component.colW,
    border: { pt: component.borderPt || 0.5, color: theme.getColor('bgGrey') }
  });
}

function renderBarChart(slide, pres, component, data) {
  const chart = getField(data, component.bind);
  if (!chart || !Array.isArray(chart.features)) return;
  slide.addText(component.title || chart.title || '', { x: component.x, y: component.y, w: component.w, h: 0.25, fontSize: component.titleFontSize || 10, bold: true, color: theme.getColor('coral'), fontFace: theme.getFontFace(component.font || 'heading') });
  slide.addChart(pres.charts.BAR, [{
    name: component.seriesName || 'Hours',
    labels: chart.features.map(f => f.name),
    values: chart.features.map(f => f.hours)
  }], {
    x: component.x,
    y: component.y + 0.27,
    w: component.w,
    h: component.h,
    barDir: component.barDir || 'bar',
    chartColors: [theme.getColor(component.color) || theme.getColor('medTeal')],
    showValue: component.showValue !== false,
    dataLabelFontSize: component.dataLabelFontSize || 7
  });
}

function renderDonutChart(slide, pres, component, data) {
  const chart = getField(data, component.bind);
  if (!chart || !Array.isArray(chart.segments)) return;
  slide.addText(component.title || chart.title || '', { x: component.x, y: component.y, w: component.w, h: 0.25, fontSize: component.titleFontSize || 10, bold: true, color: theme.getColor('coral'), fontFace: theme.getFontFace(component.font || 'heading') });
  slide.addChart(pres.charts.DOUGHNUT, [{
    name: component.seriesName || 'Series',
    labels: chart.segments.map(seg => seg.label),
    values: chart.segments.map(seg => seg.value)
  }], {
    x: component.x,
    y: component.y + 0.27,
    w: component.w,
    h: component.h,
    holeSize: component.holeSize || 55,
    showLegend: component.showLegend !== false,
    legendPos: component.legendPos || 'b',
    showPercent: component.showPercent !== false,
    chartColors: chart.segments.map(seg => theme.getColor(seg.color) || seg.color || theme.getColor('coral'))
  });
}

function renderPiPlanning(slide, pres, component, data) {
  const planning = getField(data, component.bind);
  if (!planning || !Array.isArray(planning.bands)) return;
  slide.addText(component.title || planning.title || 'PI Planning', { x: component.x, y: component.y, w: component.w, h: 0.22, fontSize: component.titleFontSize || 10, bold: true, color: theme.getColor('coral'), fontFace: theme.getFontFace(component.font || 'heading') });
  planning.bands.forEach((band, index) => {
    const bx = component.x + index * (component.bandWidth || 3.17);
    slide.addShape(pres.shapes.RECTANGLE, { x: bx, y: component.y + 0.25, w: component.bandWidth || 3.0, h: component.bandHeight || 0.72, fill: { color: theme.getColor(band.color) || band.color || theme.getColor('medTeal') } });
    slide.addText(band.pi, { x: bx + 0.1, y: component.y + 0.28, w: 0.55, h: 0.22, fontSize: 10, bold: true, color: theme.getColor('gold'), fontFace: theme.getFontFace(component.font || 'heading') });
    slide.addText(band.note, { x: bx + 0.68, y: component.y + 0.27, w: (component.bandWidth || 3.0) - 0.68, h: 0.44, fontSize: component.noteFontSize || 8, color: theme.getColor('white'), wrap: true, fontFace: theme.getFontFace(component.font || 'body') });
  });
}

function renderFooterBanner(slide, pres, component, data) {
  const text = getField(data, component.bind);
  if (!text) return;
  slide.addShape(pres.shapes.RECTANGLE, { x: component.x, y: component.y, w: component.w, h: component.h, fill: { color: theme.getColor(component.fill) || component.fill || theme.getColor('darkTeal') } });
  slide.addShape(pres.shapes.RECTANGLE, { x: component.x, y: component.y, w: component.accentWidth || 0.08, h: component.h, fill: { color: theme.getColor(component.accentColor) || component.accentColor || theme.getColor('gold') } });
  slide.addText(String(text), {
    x: component.x + (component.textInset || 0.15),
    y: component.y,
    w: component.w - (component.textInset || 0.15) - 0.1,
    h: component.h,
    fontSize: component.fontSize || 7.5,
    color: theme.getColor(component.color) || component.color || theme.getColor('bgGrey'),
    wrap: true,
    valign: 'middle',
    fontFace: theme.getFontFace(component.font || 'body')
  });
}

function renderAgendaGrid(slide, pres, component, data) {
  const items = getField(data, component.bind);
  if (!Array.isArray(items)) return;
  items.forEach((item, index) => {
    const col = index % component.columns;
    const row = Math.floor(index / component.columns);
    const x = component.x + col * (component.cardWidth + component.horizontalGap);
    const y = component.y + row * component.rowHeight;
    slide.addShape(pres.shapes.RECTANGLE, { x, y, w: component.cardWidth, h: component.cardHeight, fill: { color: theme.getColor('white') }, line: { color: theme.getColor('bgGrey') }, shadow: theme.getShadow() });
    slide.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.06, h: component.cardHeight, fill: { color: theme.getColor('coral') } });
    slide.addText(item.num, { x: x+0.12, y: y+0.08, w: 0.5, h: 0.4, fontSize: component.numberFontSize || 20, bold: true, color: theme.getColor('lightTeal') });
    slide.addText(item.title, { x: x+0.12, y: y+0.42, w: component.cardWidth - 0.24, h: 0.38, fontSize: component.titleFontSize || 11, bold: true, color: theme.getColor('darkTeal') });
    slide.addText(item.sub, { x: x+0.12, y: y+0.78, w: component.cardWidth - 0.24, h: 0.35, fontSize: component.bodyFontSize || 8.5, color: theme.getColor('slate'), wrap: true });
  });
}

function renderDecisionList(slide, pres, component, data) {
  const decisions = getField(data, component.bind);
  if (!Array.isArray(decisions)) return;
  decisions.forEach((decision, index) => {
    const y = component.y + index * component.rowHeight;
    slide.addShape(pres.shapes.RECTANGLE, { x: component.x, y, w: component.cardWidth, h: component.cardHeight, fill: { color: theme.getColor('medTeal') } });
    slide.addShape(pres.shapes.RECTANGLE, { x: component.x, y, w: component.accentWidth || 0.06, h: component.cardHeight, fill: { color: theme.getColor('gold') } });
    slide.addText(decision.num, { x: component.x + 0.1, y: y + 0.08, w: 0.4, h: 0.5, fontSize: component.numFontSize || 18, bold: true, color: theme.getColor('gold') });
    slide.addText(decision.action, { x: component.x + 0.55, y: y + 0.1, w: component.cardWidth - 0.6, h: 0.28, fontSize: component.actionFontSize || 11, bold: true, color: theme.getColor('white') });
    slide.addText(decision.detail, { x: component.x + 0.55, y: y + 0.4, w: component.cardWidth - 0.6, h: 0.28, fontSize: component.detailFontSize || 9, color: theme.getColor('bgGrey'), wrap: true });
  });
}

function renderComponent(slide, pres, component, data) {
  switch (component.type) {
    case 'shape': return renderShape(slide, pres, component);
    case 'header': return renderHeader(slide, pres, component, data);
    case 'text': return renderText(slide, component, data);
    case 'bullet_list': return renderBulletList(slide, component, data);
    case 'kpi_row': return renderKpiRow(slide, pres, component, data);
    case 'table': return renderTable(slide, pres, component, data);
    case 'bar_chart': return renderBarChart(slide, pres, component, data);
    case 'donut_chart': return renderDonutChart(slide, pres, component, data);
    case 'pi_planning': return renderPiPlanning(slide, pres, component, data);
    case 'footer_banner': return renderFooterBanner(slide, pres, component, data);
    case 'agenda_grid': return renderAgendaGrid(slide, pres, component, data);
    case 'decision_list': return renderDecisionList(slide, pres, component, data);
    default:
      console.warn(`⚠️ Unknown component type: ${component.type}`);
  }
}

function renderHeader(slide, pres, component, data) {
  const title = getField(data, component.bind?.title) || component.title;
  const subtitle = getField(data, component.bind?.subtitle) || component.subtitle;
  addSlideHeader(slide, pres, title, subtitle);
}

function loadTemplates() {
  const templatePath = TEMPLATE_JSON;
  if (!fs.existsSync(templatePath)) {
    console.error(`❌ ${TEMPLATE_JSON} not found!`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(templatePath, 'utf8')).templates || {};
  } catch (err) {
    console.error(`❌ Failed to parse ${TEMPLATE_JSON}:`, err.message);
    process.exit(1);
  }
}

async function buildPresentation() {
  const inputPath = INPUT_JSON;
  const themePath = THEME_JSON;
  const templatePath = TEMPLATE_JSON;

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ ${INPUT_JSON} not found!`);
    process.exit(1);
  }
  if (!fs.existsSync(templatePath)) {
    console.error(`❌ ${TEMPLATE_JSON} not found!`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (err) {
    console.error(`❌ Failed to parse ${INPUT_JSON}:`, err.message);
    process.exit(1);
  }

  // Load theme
  theme.loadFromFile(themePath);
  if (data.slide_recipe?.design_tokens) {
    theme.applyTheme(data.slide_recipe.design_tokens);
  } else if (data.design_tokens) {
    theme.applyTheme(data.design_tokens);
  }

  const templates = loadTemplates();
  const slides = data.slide_recipe?.slides || data.slides;
  if (!slides || !Array.isArray(slides)) {
    console.error(`❌ No "slides" array found in ${INPUT_JSON}`);
    process.exit(1);
  }

  console.log(`✅ Loaded ${slides.length} slides from ${INPUT_JSON}`);

  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = "Solon Tax Product Roadmap 2026 – Feature Catalog";
  pres.author = "Nikolaj";
  let pageNum = 1;

  for (const sData of slides) {
    const type = sData.slide_type;
    const template = templates[type];
    if (!template) {
      console.warn(`⚠️ Unknown slide type: "${type}" – skipping`);
      continue;
    }

    const s = pres.addSlide();
    if (template.background) {
      s.background = { color: theme.getColor(template.background) || template.background };
    }

    (template.components || []).forEach(component => renderComponent(s, pres, component, sData));

    if (template.footer) {
      addFooter(s, pres, ++pageNum);
    }
  }

  // Ensure output directory exists
  const outputDir = 'output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const now = new Date();
  const timestamp = now.getFullYear() + '-' + 
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') + '-' +
    String(now.getMinutes()).padStart(2, '0') + '-' +
    String(now.getSeconds()).padStart(2, '0');
  const outputFile = path.join(outputDir, `${timestamp}_${OUTPUT_PREFIX}.pptx`);
  await pres.writeFile({ fileName: outputFile });
  console.log(`✅ Presentation successfully generated!`);
  console.log(`📁 File saved as: ${outputFile}`);
}

buildPresentation().catch(err => {
  console.error("❌ Failed to generate presentation:", err.message);
  process.exit(1);
});