const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

// ====================== CONFIG ======================
const INPUT_JSON = "input.json";
const THEME_JSON = "theme.json";
const OUTPUT_PPTX = "Solon_Roadmap_SteerCo_2026.pptx";

// Netcompany Brand Colors
const NC = {
  darkTeal: "123836", deepGreen: "0A2422", medTeal: "1B5E52", lightTeal: "73AA87",
  coral: "FF6359", gold: "FFD282", slate: "718886", bgGrey: "D0D7D7",
  white: "FFFFFF", nearBlack: "141E1E", textGrey: "4A5C5A", lightBg: "EEF3F2",
};

let THEME_FONTS = { heading: "Calibri", body: "Calibri" };

function applyTheme(themeData) {
  if (!themeData) return;
  if (themeData.colors && typeof themeData.colors === 'object') {
    Object.assign(NC, themeData.colors);
  }
  if (themeData.fonts && typeof themeData.fonts === 'object') {
    THEME_FONTS = { ...THEME_FONTS, ...themeData.fonts };
  }
}

function getFontFace(type = 'body') {
  return THEME_FONTS[type] || THEME_FONTS.body || 'Calibri';
}

// ── Helpers ──
const mkShadow = () => ({ type: "outer", blur: 4, offset: 2, angle: 135, color: "000000", opacity: 0.12 });

function addSlideHeader(slide, pres, title, subtitle) {
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.05, fill: { color: NC.darkTeal } });
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.08, h: 1.05, fill: { color: NC.coral } });
  slide.addText(title, { x: 0.2, y: 0.07, w: 7, h: 0.55, fontSize: 20, bold: true, color: NC.white, fontFace: getFontFace('heading') });
  if (subtitle) {
    slide.addText(subtitle, { x: 0.2, y: 0.6, w: 9, h: 0.38, fontSize: 11, color: NC.lightTeal, fontFace: getFontFace() });
  }
  slide.addText("Netcompany", { x: 7.5, y: 0.08, w: 2.3, h: 0.4, fontSize: 12, bold: true, color: NC.lightTeal, fontFace: getFontFace(), align: "right" });
}

function addFooter(slide, pres, pageNum) {
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.45, w: 10, h: 0.175, fill: { color: NC.darkTeal } });
  slide.addText("Solon Tax Product Roadmap 2026 | SteerCo", {
    x: 0.15, y: 5.44, w: 7, h: 0.18, fontSize: 8, color: NC.bgGrey, fontFace: getFontFace()
  });
  if (pageNum) slide.addText(String(pageNum), { x: 9.5, y: 5.44, w: 0.4, h: 0.18, fontSize: 8, color: NC.bgGrey, fontFace: getFontFace(), align: "right" });
}

function addKpiCard(slide, pres, x, y, w, h, value, label, unit) {
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: NC.darkTeal }, line: { color: NC.medTeal }, shadow: mkShadow() });
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h: 0.06, fill: { color: NC.coral } });
  slide.addText(String(value), { x: x+0.1, y: y+0.1, w: w-0.2, h: h*0.48, fontSize: 22, bold: true, color: NC.white, fontFace: getFontFace(), align: "center" });
  if (unit) {
    slide.addText(unit, { x: x+0.1, y: y+h*0.52, w: w-0.2, h: 0.22, fontSize: 9, color: NC.gold, fontFace: getFontFace(), align: "center" });
  }
  slide.addText(label, { x: x+0.05, y: y+h*0.68, w: w-0.1, h: 0.36, fontSize: 9, color: NC.bgGrey, fontFace: getFontFace(), align: "center", wrap: true });
}

// ================================================================
// BUILD PRESENTATION
// ================================================================
async function buildPresentation() {
  const inputPath = path.join(process.cwd(), INPUT_JSON);
  const themePath = path.join(process.cwd(), THEME_JSON);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ ${INPUT_JSON} not found!`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  } catch (err) {
    console.error(`❌ Failed to parse ${INPUT_JSON}:`, err.message);
    process.exit(1);
  }

  if (fs.existsSync(themePath)) {
    try {
      applyTheme(JSON.parse(fs.readFileSync(themePath, 'utf8')));
    } catch (err) {
      console.warn(`⚠️ Could not parse ${THEME_JSON}, using defaults.`);
    }
  } else if (data.slide_recipe?.design_tokens) {
    applyTheme(data.slide_recipe.design_tokens);
  } else if (data.design_tokens) {
    applyTheme(data.design_tokens);
  }

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

    if (type === "cover") {
      const s = pres.addSlide();
      s.background = { color: NC.darkTeal };
      s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 5.625, fill: { color: NC.coral } });
      s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 4.7, w: 10, h: 0.925, fill: { color: NC.deepGreen } });

      s.addText(sData.title || "", { x: 0.5, y: 1.2, w: 8.5, h: 0.85, fontSize: 36, bold: true, color: NC.white, fontFace: getFontFace('heading') });
      s.addText(sData.subtitle || "", { x: 0.5, y: 2.05, w: 8, h: 0.55, fontSize: 22, color: NC.lightTeal, fontFace: getFontFace() });
      s.addText(sData.audience_line || "", { x: 0.5, y: 2.65, w: 8, h: 0.4, fontSize: 14, color: NC.bgGrey, fontFace: getFontFace() });
      s.addText(sData.author || "", { x: 0.5, y: 3.15, w: 8, h: 0.35, fontSize: 12, color: NC.slate, fontFace: getFontFace() });

      s.addText("Netcompany", { x: 7, y: 4.75, w: 2.8, h: 0.4, fontSize: 16, bold: true, color: NC.lightTeal, align: "right" });
      s.addText("netcompany.com", { x: 7, y: 5.1, w: 2.8, h: 0.3, fontSize: 10, color: NC.slate, align: "right" });
    }

    else if (type === "agenda") {
      const s = pres.addSlide();
      s.background = { color: "F4F6F6" };
      addSlideHeader(s, pres, sData.header_title || "Agenda", sData.header_subtitle);
      addFooter(s, pres, ++pageNum);

      (sData.groups || []).forEach((g, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 0.25 + col * 5, y = 1.15 + row * 1.35;

        s.addShape(pres.shapes.RECTANGLE, { x, y, w: 4.7, h: 1.2, fill: { color: NC.white }, line: { color: NC.bgGrey }, shadow: mkShadow() });
        s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.06, h: 1.2, fill: { color: NC.coral } });
        s.addText(g.num, { x: x+0.12, y: y+0.08, w: 0.5, h: 0.4, fontSize: 20, bold: true, color: NC.lightTeal });
        s.addText(g.title, { x: x+0.12, y: y+0.42, w: 4.45, h: 0.38, fontSize: 11, bold: true, color: NC.darkTeal });
        s.addText(g.sub, { x: x+0.12, y: y+0.78, w: 4.45, h: 0.35, fontSize: 8.5, color: NC.slate });
      });
    }

    else if (type === "group_summary") {
      const s = pres.addSlide();
      s.background = { color: "F4F6F6" };
      addSlideHeader(s, pres, sData.header_title, sData.header_subtitle);
      addFooter(s, pres, ++pageNum);

      // KPI Cards
      (sData.kpis || []).forEach((k, i) => {
        addKpiCard(s, pres, 0.25 + i * 2.39, 1.1, 2.2, 1.05, k.value, k.label, k.unit);
      });

      const leftX = 0.25, contentY = 2.3, colW = 3.6;

      s.addText("Business Scope", { x: leftX, y: contentY, w: colW, h: 0.28, fontSize: 10, bold: true, color: NC.coral });
      s.addText(sData.business_scope || "", { x: leftX, y: contentY + 0.3, w: colW, h: 0.85, fontSize: 10, color: NC.nearBlack, wrap: true });

      s.addText("Market Needs & Investment Benefits", { x: leftX, y: contentY + 1.2, w: colW, h: 0.28, fontSize: 10, bold: true, color: NC.coral });
      s.addText((sData.market_needs_and_benefits || []).map(b => ({ text: b, options: { bullet: true } })), {
        x: leftX, y: contentY + 1.52, w: colW, h: 1.55, fontSize: 9, color: NC.textGrey, wrap: true
      });

      // Status Donut
      const chartX = 3.95, chartY = 2.3;
      s.addText(sData.status_donut?.title || "Status Distribution", { x: chartX, y: chartY, w: 2.7, h: 0.28, fontSize: 10, bold: true, color: NC.coral });
      s.addChart(pres.charts.DOUGHNUT, [{
        name: "Status",
        labels: (sData.status_donut?.segments || []).map(seg => seg.label),
        values: (sData.status_donut?.segments || []).map(seg => seg.value)
      }], {
        x: chartX, y: chartY + 0.3, w: 2.7, h: 1.7,
        chartColors: (sData.status_donut?.segments || []).map(seg => seg.color || "FF6359"),
        holeSize: 55, showLegend: true, legendPos: "b", showPercent: true
      });

      // Initiative Table
      const tX = 6.75, tY = 2.3;
      s.addText(sData.initiative_table?.title || "Roadmap Initiatives at a Glance", { x: tX, y: tY, w: 3, h: 0.28, fontSize: 10, bold: true, color: NC.coral });

      const rows = sData.initiative_table?.rows || [];
      const tableData = [
        [{ text: "Initiative", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal } } },
         { text: "Effort (H)", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, align: "center" } },
         { text: "Feats", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, align: "center" } },
         { text: "PI", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, align: "center" } },
         { text: "Prio", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, align: "center" } }]
      ];

      rows.forEach(r => {
        tableData.push([
          { text: r.initiative || "" },
          { text: r.effort_h || "", options: { align: "center" } },
          { text: r.features || "", options: { align: "center" } },
          { text: r.pi_window || "", options: { align: "center" } },
          { text: r.priority || "", options: { align: "center" } }
        ]);
      });

      s.addTable(tableData, { x: tX, y: tY + 0.32, w: 3, h: 2.9, colW: [1.25, 0.62, 0.38, 0.42, 0.33], border: { pt: 0.5, color: NC.bgGrey } });
    }

    else if (type === "initiative_detail") {
      // This is the most complex one – I kept it as close as possible to original
      const s = pres.addSlide();
      s.background = { color: "F4F6F6" };
      addSlideHeader(s, pres, sData.header_title, sData.header_subtitle);
      addFooter(s, pres, ++pageNum);

      (sData.kpis || []).forEach((k, i) => addKpiCard(s, pres, 0.25 + i*2.39, 1.1, 2.2, 1.0, k.value, k.label, k.unit));

      const lx = 0.25, topY = 2.15, colW = 3.0;

      // Left: Scope + Benefits
      s.addText("Business Scope", { x: lx, y: topY, w: colW, h: 0.25, fontSize: 10, bold: true, color: NC.coral });
      s.addText(sData.business_scope || "", { x: lx, y: topY+0.27, w: colW, h: 0.75, fontSize: 9, color: NC.nearBlack, wrap: true });

      s.addText("Key Investment Benefits", { x: lx, y: topY+1.07, w: colW, h: 0.22, fontSize: 10, bold: true, color: NC.coral });
      s.addText((sData.key_investment_benefits || []).map(b => ({ text: b, options: { bullet: true } })), {
        x: lx, y: topY+1.32, w: colW, h: 0.82, fontSize: 9, color: NC.textGrey, wrap: true
      });

      // Effort Bar Chart
      const cx = 3.4;
      s.addText(sData.effort_bar_chart?.title || "Estimated Effort by Feature Area", { x: cx, y: topY, w: 3.3, h: 0.25, fontSize: 10, bold: true, color: NC.coral });
      s.addChart(pres.charts.BAR, [{
        name: "Hours",
        labels: (sData.effort_bar_chart?.features || []).map(f => f.name),
        values: (sData.effort_bar_chart?.features || []).map(f => f.hours)
      }], {
        x: cx, y: topY+0.27, w: 3.3, h: 2.0, barDir: "bar", chartColors: [NC.medTeal],
        showValue: true, dataLabelFontSize: 7
      });

      // Priority Donut + optional stakeholder / talking points
      const rx = 6.85;
      s.addText(sData.priority_donut?.title || "Priority Distribution", { x: rx, y: topY, w: 2.9, h: 0.25, fontSize: 10, bold: true, color: NC.coral });
      s.addChart(pres.charts.DOUGHNUT, [{
        name: "Priority",
        labels: (sData.priority_donut?.segments || []).map(seg => seg.label),
        values: (sData.priority_donut?.segments || []).map(seg => seg.value)
      }], {
        x: rx, y: topY+0.27, w: 2.9, h: 1.0, holeSize: 55, showLegend: true, legendPos: "r",
        chartColors: (sData.priority_donut?.segments || []).map(seg => seg.color)
      });

      // PI Planning boxes
      const piY = 4.25;
      s.addText("PI Planning", { x: lx, y: piY, w: 1, h: 0.22, fontSize: 10, bold: true, color: NC.coral });
      (sData.pi_planning?.bands || []).forEach((band, i) => {
        const bx = lx + i * 3.17;
        s.addShape(pres.shapes.RECTANGLE, { x: bx, y: piY + 0.25, w: 3.0, h: 0.72, fill: { color: NC[band.color] || band.color || NC.medTeal } });
        s.addText(band.pi, { x: bx + 0.1, y: piY + 0.28, w: 0.55, h: 0.22, fontSize: 10, bold: true, color: NC.gold });
        s.addText(band.note, { x: bx + 0.68, y: piY + 0.27, w: 2.25, h: 0.44, fontSize: 8, color: NC.white, wrap: true });
      });

      // Optional steerco footer banner
      if (sData.steerco_footer) {
        s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.05, w: 10, h: 0.38, fill: { color: NC.darkTeal } });
        s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.05, w: 0.08, h: 0.38, fill: { color: NC.gold } });
        s.addText(sData.steerco_footer, { x: 0.15, y: 5.05, w: 9.7, h: 0.38, fontSize: 7.5, color: NC.bgGrey, valign: "middle" });
      }
    }

    else if (type === "initiative_cards") {
      const s = pres.addSlide();
      s.background = { color: "F4F6F6" };
      addSlideHeader(s, pres, sData.header_title, sData.header_subtitle);
      addFooter(s, pres, ++pageNum);

      (sData.initiatives || []).forEach((init, col) => {
        const x = 0.2 + col * 3.27, y = 1.12, w = 3.1;
        s.addShape(pres.shapes.RECTANGLE, { x, y, w, h: 4.22, fill: { color: NC.white }, line: { color: NC.bgGrey }, shadow: mkShadow() });
        s.addShape(pres.shapes.RECTANGLE, { x, y, w, h: 0.06, fill: { color: NC.coral } });

        s.addText(init.title, { x: x+0.12, y: y+0.1, w: w-0.24, h: 0.35, fontSize: 13, bold: true, color: NC.darkTeal });

        // Mini KPIs (simplified)
        const mkpis = [
          {v: init.effort, l: "Effort"}, {v: init.features, l: "Features"},
          {v: init.priority, l: "Priority"}, {v: init.pi, l: "PI"}
        ];
        mkpis.forEach((mk, mi) => {
          const kx = x + 0.07 + mi * 0.76;
          s.addShape(pres.shapes.RECTANGLE, { x: kx, y: y+0.5, w: 0.7, h: 0.6, fill: { color: NC.darkTeal } });
          s.addText(mk.v, { x: kx, y: y+0.5, w: 0.7, h: 0.37, fontSize: 7.5, bold: true, color: NC.white, align: "center", valign: "bottom" });
          s.addText(mk.l, { x: kx, y: y+0.87, w: 0.7, h: 0.22, fontSize: 6.5, color: NC.gold, align: "center" });
        });

        s.addText("Scope", { x: x+0.12, y: y+1.18, w: w-0.24, h: 0.22, fontSize: 9, bold: true, color: NC.coral });
        s.addText(init.scope, { x: x+0.12, y: y+1.4, w: w-0.24, h: 0.9, fontSize: 8.5, color: NC.nearBlack, wrap: true });

        s.addText("Benefits", { x: x+0.12, y: y+2.35, w: w-0.24, h: 0.22, fontSize: 9, bold: true, color: NC.coral });
        s.addText((init.benefits || []).map(b => ({ text: b, options: { bullet: true } })), {
          x: x+0.12, y: y+2.58, w: w-0.24, h: 0.9, fontSize: 8, color: NC.textGrey, wrap: true
        });

        s.addShape(pres.shapes.RECTANGLE, { x: x+0.12, y: y+3.54, w: w-0.24, h: 0.58, fill: { color: NC.lightBg } });
        s.addText(init.steerco_note || "", { x: x+0.18, y: y+3.57, w: w-0.36, h: 0.52, fontSize: 8, color: NC.darkTeal, italic: true, wrap: true });
      });
    }

    else if (type === "next_steps") {
      const s = pres.addSlide();
      s.background = { color: NC.darkTeal };
      s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 5.625, fill: { color: NC.coral } });
      s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 4.85, w: 10, h: 0.775, fill: { color: NC.deepGreen } });

      s.addText(sData.title || "Next Steps & Decision Points", { x: 0.35, y: 0.3, w: 9.3, h: 0.65, fontSize: 28, bold: true, color: NC.white });
      s.addText(sData.subtitle || "", { x: 0.35, y: 0.95, w: 9.3, h: 0.35, fontSize: 13, color: NC.lightTeal });

      (sData.decisions || []).forEach((d, i) => {
        const y = 1.45 + i * 0.82;
        s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y, w: 9.3, h: 0.72, fill: { color: NC.medTeal } });
        s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y, w: 0.06, h: 0.72, fill: { color: NC.gold } });
        s.addText(d.num, { x: 0.45, y: y+0.08, w: 0.4, h: 0.5, fontSize: 18, bold: true, color: NC.gold });
        s.addText(d.action, { x: 0.9, y: y+0.1, w: 8.5, h: 0.28, fontSize: 11, bold: true, color: NC.white });
        s.addText(d.detail, { x: 0.9, y: y+0.4, w: 8.5, h: 0.28, fontSize: 9, color: NC.bgGrey, wrap: true });
      });
    }

    else {
      console.warn(`⚠️  Unknown slide type: "${type}" – skipping`);
    }
  }

  await pres.writeFile({ fileName: OUTPUT_PPTX });
  console.log(`✅ Presentation successfully generated!`);
  console.log(`📁 File saved as: ${OUTPUT_PPTX}`);
}

buildPresentation().catch(err => {
  console.error("❌ Failed to generate presentation:", err.message);
  process.exit(1);
});