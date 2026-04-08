const pptxgen = require("pptxgenjs");

// Netcompany Brand Colors
const NC = {
  darkTeal: "123836",      // accent1 - primary dark
  deepGreen: "0A2422",     // darker teal for headers
  medTeal: "1B5E52",       // mid teal
  lightTeal: "73AA87",     // accent3 - soft green
  coral: "FF6359",         // accent5 - highlight/alert red-coral
  gold: "FFD282",          // accent6 - warm accent
  slate: "718886",         // accent2 - muted teal-grey
  bgGrey: "D0D7D7",        // lt2 - light background
  white: "FFFFFF",
  nearBlack: "141E1E",     // dk1
  textGrey: "4A5C5A",
  lightBg: "EEF3F2",       // very light teal bg
  tableBorder: "718886",
};

// ── Helper: shadow factory (never reuse same object) ──
const mkShadow = () => ({ type: "outer", blur: 4, offset: 2, angle: 135, color: "000000", opacity: 0.12 });

// ── Helper: add slide header bar ──
function addSlideHeader(slide, pres, title, subtitle) {
  // Dark header band
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 1.05,
    fill: { color: NC.darkTeal }, line: { color: NC.darkTeal }
  });
  // Coral accent left bar
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.08, h: 1.05,
    fill: { color: NC.coral }, line: { color: NC.coral }
  });
  // Title
  slide.addText(title, {
    x: 0.2, y: 0.07, w: 7, h: 0.55,
    fontSize: 20, bold: true, color: NC.white, fontFace: "Calibri",
    margin: 0
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.2, y: 0.6, w: 9, h: 0.38,
      fontSize: 11, color: NC.lightTeal, fontFace: "Calibri", margin: 0
    });
  }
  // Netcompany label top right
  slide.addText("Netcompany", {
    x: 7.5, y: 0.08, w: 2.3, h: 0.4,
    fontSize: 12, bold: true, color: NC.lightTeal, fontFace: "Calibri",
    align: "right", margin: 0
  });
}

// ── Helper: add footer ──
function addFooter(slide, pres, pageNum) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.45, w: 10, h: 0.175,
    fill: { color: NC.darkTeal }, line: { color: NC.darkTeal }
  });
  slide.addText("Solon Tax Product Roadmap 2026 | SteerCo", {
    x: 0.15, y: 5.44, w: 7, h: 0.18,
    fontSize: 8, color: NC.bgGrey, fontFace: "Calibri", margin: 0
  });
  if (pageNum) {
    slide.addText(String(pageNum), {
      x: 9.5, y: 5.44, w: 0.4, h: 0.18,
      fontSize: 8, color: NC.bgGrey, fontFace: "Calibri", align: "right", margin: 0
    });
  }
}

// ── Helper: KPI card ──
function addKpiCard(slide, pres, x, y, w, h, value, label, unit) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: NC.darkTeal }, line: { color: NC.medTeal }, shadow: mkShadow()
  });
  // Coral accent top border
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h: 0.06,
    fill: { color: NC.coral }, line: { color: NC.coral }
  });
  slide.addText(String(value), {
    x: x + 0.1, y: y + 0.1, w: w - 0.2, h: h * 0.48,
    fontSize: 22, bold: true, color: NC.white, fontFace: "Calibri",
    align: "center", margin: 0
  });
  if (unit) {
    slide.addText(unit, {
      x: x + 0.1, y: y + h * 0.52, w: w - 0.2, h: 0.22,
      fontSize: 9, color: NC.gold, fontFace: "Calibri", align: "center", margin: 0
    });
  }
  slide.addText(label, {
    x: x + 0.05, y: y + h * 0.68, w: w - 0.1, h: 0.36,
    fontSize: 9, color: NC.bgGrey, fontFace: "Calibri", align: "center",
    wrap: true, margin: 0
  });
}

// ================================================================
// BUILD PRESENTATION
// ================================================================
async function buildPresentation() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = "Solon Tax Product Roadmap 2026 – Feature Catalog";
  pres.author = "Nikolaj";

  let pageNum = 1;

  // ════════════════════════════════════════════════════
  // SLIDE 1: Title / Cover
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: NC.darkTeal };

    // Large coral accent bar
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.12, h: 5.625,
      fill: { color: NC.coral }, line: { color: NC.coral }
    });

    // Bottom dark band
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 4.7, w: 10, h: 0.925,
      fill: { color: NC.deepGreen }, line: { color: NC.deepGreen }
    });

    s.addText("Solon Tax Product Roadmap 2026", {
      x: 0.5, y: 1.2, w: 8.5, h: 0.85,
      fontSize: 36, bold: true, color: NC.white, fontFace: "Calibri", margin: 0
    });
    s.addText("Feature Catalog for SteerCo", {
      x: 0.5, y: 2.05, w: 8, h: 0.55,
      fontSize: 22, color: NC.lightTeal, fontFace: "Calibri", margin: 0
    });
    s.addText("Executive Steering Committee | 29 April 2026", {
      x: 0.5, y: 2.65, w: 8, h: 0.4,
      fontSize: 14, color: NC.bgGrey, fontFace: "Calibri", margin: 0
    });
    s.addText("Prepared by: Nikolaj", {
      x: 0.5, y: 3.15, w: 8, h: 0.35,
      fontSize: 12, color: NC.slate, fontFace: "Calibri", margin: 0
    });

    s.addText("Netcompany", {
      x: 7, y: 4.75, w: 2.8, h: 0.4,
      fontSize: 16, bold: true, color: NC.lightTeal, fontFace: "Calibri",
      align: "right", margin: 0
    });
    s.addText("netcompany.com", {
      x: 7, y: 5.1, w: 2.8, h: 0.3,
      fontSize: 10, color: NC.slate, fontFace: "Calibri", align: "right", margin: 0
    });
  }

  // ════════════════════════════════════════════════════
  // SLIDE 2: Agenda / Overview
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: "F4F6F6" };
    addSlideHeader(s, pres, "Agenda", "Solon Tax Product Roadmap 2026 — SteerCo Session");
    addFooter(s, pres, ++pageNum);

    const groups = [
      { num: "01", title: "Core Revenue Management Capabilities", sub: "Registration · Taxpayer Accounting · Billing · Exemptions · Penalty & Interest · Tax Accounts" },
      { num: "02", title: "Core Supporting Capabilities", sub: "Supporting functions enabling the tax administration platform" },
      { num: "03", title: "Non-Functional Requirement Coverage", sub: "Performance, security, reliability and compliance standards" },
      { num: "04", title: "Reference Implementations", sub: "Baseline modules and reusable implementation patterns" },
      { num: "05", title: "Core Self Service Capabilities", sub: "Taxpayer-facing portal and self-service functionality" },
      { num: "06", title: "Core Data Hub Capabilities", sub: "Data integration, analytics and reporting infrastructure" },
    ];

    groups.forEach((g, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 0.25 + col * 5;
      const y = 1.15 + row * 1.35;

      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 4.7, h: 1.2,
        fill: { color: NC.white }, line: { color: NC.bgGrey }, shadow: mkShadow()
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 0.06, h: 1.2,
        fill: { color: NC.coral }, line: { color: NC.coral }
      });
      s.addText(g.num, {
        x: x + 0.12, y: y + 0.08, w: 0.5, h: 0.4,
        fontSize: 20, bold: true, color: NC.lightTeal, fontFace: "Calibri", margin: 0
      });
      s.addText(g.title, {
        x: x + 0.12, y: y + 0.42, w: 4.45, h: 0.38,
        fontSize: 11, bold: true, color: NC.darkTeal, fontFace: "Calibri", margin: 0
      });
      s.addText(g.sub, {
        x: x + 0.12, y: y + 0.78, w: 4.45, h: 0.35,
        fontSize: 8.5, color: NC.slate, fontFace: "Calibri", margin: 0
      });
    });
  }

  // ════════════════════════════════════════════════════
  // SLIDE 3: GROUP SUMMARY — Core Revenue Management Capabilities
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: "F4F6F6" };
    addSlideHeader(s, pres, "Core Revenue Management Capabilities", "Group Summary | Roadmap Initiative Overview");
    addFooter(s, pres, ++pageNum);

    // ── KPI Cards (top row) ──
    const kpis = [
      { v: "~23,200", l: "Total Estimated Effort", u: "Hours" },
      { v: "6", l: "Roadmap Initiatives", u: "Count" },
      { v: "15", l: "Features in Scope", u: "Count" },
      { v: "PI28", l: "Primary PI Window", u: "Program Increment" },
    ];
    kpis.forEach((k, i) => addKpiCard(s, pres, 0.25 + i * 2.39, 1.1, 2.2, 1.05, k.v, k.l, k.u));

    // ── Business Scope (left column) ──
    const leftX = 0.25, contentY = 2.3, colW = 3.6;

    s.addText("Business Scope", {
      x: leftX, y: contentY, w: colW, h: 0.28,
      fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0
    });
    s.addText("Covers the foundational tax administration functions enabling tax authorities to manage the full lifecycle of taxpayer obligations — from registration and filing through billing, assessment, accounting, and penalty management.", {
      x: leftX, y: contentY + 0.3, w: colW, h: 0.85,
      fontSize: 10, color: NC.nearBlack, fontFace: "Calibri", wrap: true, margin: 0
    });

    s.addText("Market Needs & Investment Benefits", {
      x: leftX, y: contentY + 1.2, w: colW, h: 0.28,
      fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0
    });
    const benefits = [
      "End-to-end taxpayer lifecycle management reduces administrative burden and manual errors",
      "Automated penalty and interest calculations improve collection rates and reduce revenue leakage",
      "Modular capability design allows onboarding of new tax types with minimal reconfiguration",
      "Streamlined registration and billing processes reduce case handling time for tax officers",
      "Supports regulatory compliance including audit trails and operational reporting",
    ];
    s.addText(benefits.map((b, i) => ({
      text: b,
      options: { bullet: true, breakLine: i < benefits.length - 1 }
    })), {
      x: leftX, y: contentY + 1.52, w: colW, h: 1.55,
      fontSize: 9, color: NC.textGrey, fontFace: "Calibri", wrap: true
    });

    // ── Donut Chart: Status Distribution ──
    const chartX = 3.95, chartY = 2.3, chartW = 2.7, chartH = 2.0;
    s.addText("Status Distribution", {
      x: chartX, y: chartY, w: chartW, h: 0.28,
      fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0
    });
    s.addChart(pres.charts.DOUGHNUT, [{
      name: "Status",
      labels: ["To Do", "In Progress", "Done"],
      values: [85, 10, 5]
    }], {
      x: chartX, y: chartY + 0.3, w: chartW, h: chartH - 0.3,
      chartColors: ["FF6359", "FFD282", "73AA87"],
      chartArea: { fill: { color: "F4F6F6" } },
      showLegend: true, legendPos: "b",
      legendFontSize: 8, legendColor: NC.textGrey,
      holeSize: 55,
      showPercent: true,
      dataLabelFontSize: 9,
    });

    // ── Initiative Summary Table ──
    const tX = 6.75, tY = 2.3;
    s.addText("Roadmap Initiatives at a Glance", {
      x: tX, y: tY, w: 3.0, h: 0.28,
      fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0
    });

    const tHdr = [
      { text: "Initiative", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, fontSize: 8 } },
      { text: "Effort (H)", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, fontSize: 8, align: "center" } },
      { text: "Feats", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, fontSize: 8, align: "center" } },
      { text: "PI", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, fontSize: 8, align: "center" } },
      { text: "Prio", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, fontSize: 8, align: "center" } },
    ];

    const rows = [
      ["Registration", "11,866", "6", "PI27-29", "P1"],
      ["Taxpayer Accounting", "8,064", "4", "PI28-29", "P1"],
      ["Billing & Assessments", "2,880", "3", "PI28-29", "P1-2"],
      ["Exemptions", "390", "1", "PI28", "P2"],
      ["Penalty & Interest", "TBD", "1", "PI28-29", "P2"],
      ["Tax Accounts", "TBD", "1", "PI28-29", "P1"],
    ];

    const tableData = [tHdr, ...rows.map((r, ri) => r.map((cell, ci) => ({
      text: cell,
      options: {
        fontSize: 8,
        color: NC.nearBlack,
        fill: { color: ri % 2 === 0 ? NC.white : NC.lightBg },
        align: ci === 0 ? "left" : "center"
      }
    })))];

    s.addTable(tableData, {
      x: tX, y: tY + 0.32, w: 3.0, h: 2.9,
      colW: [1.25, 0.62, 0.38, 0.42, 0.33],
      border: { pt: 0.5, color: NC.bgGrey },
      fontFace: "Calibri",
    });
  }

  // ════════════════════════════════════════════════════
  // SLIDE 4: INITIATIVE DETAIL — Registration
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: "F4F6F6" };
    addSlideHeader(s, pres, "Registration", "Core Revenue Management Capabilities | Initiative Detail");
    addFooter(s, pres, ++pageNum);

    // ── KPI Cards ──
    const kpis = [
      { v: "~11,900", l: "Total Estimated Effort", u: "Hours" },
      { v: "6", l: "Features in Scope", u: "Count" },
      { v: "P1", l: "Primary Priority", u: "Must Have" },
      { v: "PI27–PI29", l: "Planned PI Window", u: "Program Increments" },
    ];
    kpis.forEach((k, i) => addKpiCard(s, pres, 0.25 + i * 2.39, 1.1, 2.2, 1.0, k.v, k.l, k.u));

    // ── ROW A: Left = Scope+Benefits, Centre = Bar chart, Right = Priority donut ──
    const lx = 0.25, topY = 2.15, colW = 3.0;

    // Left: scope + benefits
    s.addText("Business Scope", { x: lx, y: topY, w: colW, h: 0.25, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    s.addText("Enables tax authorities to manage the complete registration lifecycle — including party creation, identifier management, historical data tracking, and organisational hierarchy. Supports natural persons and legal entities with full audit traceability.", {
      x: lx, y: topY + 0.27, w: colW, h: 0.75, fontSize: 9, color: NC.nearBlack, fontFace: "Calibri", wrap: true, margin: 0
    });
    s.addText("Key Investment Benefits", { x: lx, y: topY + 1.07, w: colW, h: 0.22, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    const benefits = [
      "Faster taxpayer onboarding reduces overhead and improves service delivery",
      "Flexible party model supports VAT, CIT, and PAYE with full audit traceability",
      "Structured identifiers and validation rules improve data quality across tax types",
    ];
    s.addText(benefits.map((b, i) => ({ text: b, options: { bullet: true, breakLine: i < benefits.length - 1 } })), {
      x: lx, y: topY + 1.32, w: colW, h: 0.82, fontSize: 9, color: NC.textGrey, fontFace: "Calibri", wrap: true
    });

    // Centre: Effort bar chart (shorter)
    const cx = 3.4;
    s.addText("Estimated Effort by Feature Area", { x: cx, y: topY, w: 3.3, h: 0.25, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    s.addChart(pres.charts.BAR, [{
      name: "Hours",
      labels: ["Party Identifiers", "Org. Hierarchy View", "Search Enhancements", "Data Area Enhancements", "Historical Data View", "Additional Name Elems"],
      values: [3200, 2800, 2100, 1900, 1100, 766]
    }], {
      x: cx, y: topY + 0.27, w: 3.3, h: 2.0,
      barDir: "bar",
      chartColors: [NC.medTeal],
      chartArea: { fill: { color: "F4F6F6" } },
      catAxisLabelColor: NC.textGrey, catAxisLabelFontSize: 7,
      valAxisLabelColor: NC.textGrey, valAxisLabelFontSize: 7,
      valGridLine: { color: "E0E8E7", size: 0.5 }, catGridLine: { style: "none" },
      showValue: true, dataLabelFontSize: 7, dataLabelColor: NC.white, showLegend: false,
    });

    // Right: Priority + Stakeholder donuts (compact)
    const rx = 6.85;
    s.addText("Priority Distribution", { x: rx, y: topY, w: 2.9, h: 0.25, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    s.addChart(pres.charts.DOUGHNUT, [{
      name: "Priority",
      labels: ["P1 – Must Have", "P2 – Should Have", "P3 – Nice to Have"],
      values: [70, 20, 10]
    }], {
      x: rx, y: topY + 0.27, w: 2.9, h: 1.0,
      chartColors: [NC.darkTeal, NC.medTeal, NC.lightTeal],
      chartArea: { fill: { color: "F4F6F6" } },
      holeSize: 55, showLegend: true, legendPos: "r",
      legendFontSize: 7, showPercent: true, dataLabelFontSize: 7,
    });
    s.addText("Stakeholder Split", { x: rx, y: topY + 1.34, w: 2.9, h: 0.22, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    s.addChart(pres.charts.PIE, [{
      name: "Requesters",
      labels: ["Greek Project (GRC)", "Go-To-Market (GTM)", "Other"],
      values: [80, 10, 10]
    }], {
      x: rx, y: topY + 1.58, w: 2.9, h: 0.68,
      chartColors: [NC.darkTeal, NC.coral, NC.slate],
      chartArea: { fill: { color: "F4F6F6" } },
      showLegend: true, legendPos: "r", legendFontSize: 7, showPercent: true, dataLabelFontSize: 7,
    });

    // ── ROW B: PI planning as compact colour-coded note boxes ──
    const piY = 4.25;
    s.addText("PI Planning", { x: lx, y: piY, w: 1.0, h: 0.22, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });

    const piNotes = [
      { pi: "PI27", note: "Party Identifiers · Historical Data View · Additional Name Elements (3 features)", color: NC.darkTeal, textColor: NC.white },
      { pi: "PI28", note: "Data Area Enhancements · Search Enhancements (2 features) — confirm capacity now", color: NC.medTeal, textColor: NC.white },
      { pi: "PI29", note: "Organisational Hierarchy View — GRC team alignment required before scoping", color: NC.slate, textColor: NC.white },
    ];
    piNotes.forEach((n, i) => {
      const bx = lx + i * 3.17;
      s.addShape(pres.shapes.RECTANGLE, { x: bx, y: piY + 0.25, w: 3.0, h: 0.72, fill: { color: n.color }, line: { color: n.color } });
      s.addText(n.pi, { x: bx + 0.1, y: piY + 0.28, w: 0.55, h: 0.22, fontSize: 10, bold: true, color: NC.gold, fontFace: "Calibri", margin: 0 });
      s.addText(n.note, { x: bx + 0.68, y: piY + 0.27, w: 2.25, h: 0.44, fontSize: 8, color: n.textColor, fontFace: "Calibri", wrap: true, margin: 0 });
    });
  }

  // ════════════════════════════════════════════════════
  // SLIDE 5: INITIATIVE DETAIL — Taxpayer Accounting
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: "F4F6F6" };
    addSlideHeader(s, pres, "Taxpayer Accounting", "Core Revenue Management Capabilities | Initiative Detail");
    addFooter(s, pres, ++pageNum);

    const kpis = [
      { v: "~8,064", l: "Total Estimated Effort", u: "Hours" },
      { v: "4", l: "Features in Scope", u: "Count" },
      { v: "P1", l: "Primary Priority", u: "Must Have" },
      { v: "PI28–PI29", l: "Planned PI Window", u: "Program Increments" },
    ];
    kpis.forEach((k, i) => addKpiCard(s, pres, 0.25 + i * 2.39, 1.1, 2.2, 1.0, k.v, k.l, k.u));

    const lx5 = 0.25, topY5 = 2.18, colW5 = 3.0;

    // Left: scope + benefits
    s.addText("Business Scope", { x: lx5, y: topY5, w: colW5, h: 0.25, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    s.addText("Provides tax authorities with a unified financial ledger for each taxpayer, recording all transactions including payments, credits, adjustments, and write-offs. Ensures accurate account balances and supports reconciliation across all tax types.", {
      x: lx5, y: topY5 + 0.27, w: colW5, h: 0.72, fontSize: 9, color: NC.nearBlack, fontFace: "Calibri", wrap: true, margin: 0
    });
    s.addText("Key Investment Benefits", { x: lx5, y: topY5 + 1.04, w: colW5, h: 0.22, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    const benefits5 = [
      "Real-time balance visibility reduces disputes and improves taxpayer trust",
      "Automated reconciliation eliminates manual posting errors",
      "Single ledger supports multi-tax-type accounting for all periods",
    ];
    s.addText(benefits5.map((b, i) => ({ text: b, options: { bullet: true, breakLine: i < benefits5.length - 1 } })), {
      x: lx5, y: topY5 + 1.28, w: colW5, h: 0.9, fontSize: 9, color: NC.textGrey, fontFace: "Calibri", wrap: true
    });

    // Centre: Effort bar chart
    const cx5 = 3.4;
    s.addText("Estimated Effort by Feature Area", { x: cx5, y: topY5, w: 3.1, h: 0.25, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    s.addChart(pres.charts.BAR, [{
      name: "Hours",
      labels: ["General Ledger Core", "Transaction Processing", "Account Reconciliation", "Balance Management"],
      values: [2800, 2400, 1664, 1200]
    }], {
      x: cx5, y: topY5 + 0.27, w: 3.1, h: 2.0, barDir: "bar",
      chartColors: [NC.medTeal],
      chartArea: { fill: { color: "F4F6F6" } },
      catAxisLabelColor: NC.textGrey, catAxisLabelFontSize: 7,
      valAxisLabelColor: NC.textGrey, valAxisLabelFontSize: 7,
      valGridLine: { color: "E0E8E7", size: 0.5 }, catGridLine: { style: "none" },
      showValue: true, dataLabelFontSize: 7, dataLabelColor: NC.white, showLegend: false,
    });

    // Right: Priority donut + talking points
    const rx5 = 6.85;
    s.addText("Priority Distribution", { x: rx5, y: topY5, w: 2.9, h: 0.25, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    s.addChart(pres.charts.DOUGHNUT, [{ name: "Priority", labels: ["P1 – Must Have", "P2 – Should Have"], values: [75, 25] }], {
      x: rx5, y: topY5 + 0.27, w: 2.9, h: 1.15,
      chartColors: [NC.darkTeal, NC.medTeal],
      chartArea: { fill: { color: "F4F6F6" } },
      holeSize: 55, showLegend: true, legendPos: "r", legendFontSize: 7, showPercent: true, dataLabelFontSize: 7,
    });
    s.addText("Key Talking Points", { x: rx5, y: topY5 + 1.49, w: 2.9, h: 0.22, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    const talkPoints5 = [
      "Second-largest investment — foundational to revenue assurance",
      "PI28 delivery critical — capacity must be confirmed now",
      "All P1/P2 — no descoping without revenue risk",
    ];
    s.addText(talkPoints5.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < talkPoints5.length - 1 } })), {
      x: rx5, y: topY5 + 1.74, w: 2.9, h: 0.75, fontSize: 9, color: NC.textGrey, fontFace: "Calibri", wrap: true
    });

    // Full-width PI planning note boxes
    const piY5 = 4.25;
    s.addText("PI Planning", { x: lx5, y: piY5, w: 1.0, h: 0.22, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });

    const piNotes5 = [
      { pi: "PI27", note: "No features", color: NC.bgGrey, textColor: NC.slate },
      { pi: "PI28", note: "General Ledger Core · Transaction Processing", color: NC.darkTeal, textColor: NC.white },
      { pi: "PI29", note: "Account Reconciliation · Balance Management", color: NC.medTeal, textColor: NC.white },
    ];
    piNotes5.forEach((n, i) => {
      const bx = lx5 + i * 3.17;
      s.addShape(pres.shapes.RECTANGLE, { x: bx, y: piY5 + 0.25, w: 3.0, h: 0.62, fill: { color: n.color }, line: { color: n.color } });
      s.addText(n.pi, { x: bx + 0.1, y: piY5 + 0.28, w: 0.55, h: 0.22, fontSize: 10, bold: true, color: n.pi === "PI27" ? NC.textGrey : NC.gold, fontFace: "Calibri", margin: 0 });
      s.addText(n.note, { x: bx + 0.68, y: piY5 + 0.27, w: 2.25, h: 0.34, fontSize: 8, color: n.textColor, fontFace: "Calibri", wrap: true, margin: 0 });
    });

    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.05, w: 10, h: 0.38, fill: { color: NC.darkTeal }, line: { color: NC.darkTeal } });
    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.05, w: 0.08, h: 0.38, fill: { color: NC.gold }, line: { color: NC.gold } });
    s.addText("Key Talking Points for SteerCo:", { x: 0.15, y: 5.05, w: 2.1, h: 0.38, fontSize: 8, bold: true, color: NC.gold, fontFace: "Calibri", valign: "middle", margin: 0 });
    s.addText("Second-largest investment — foundational to revenue assurance   ·   PI28 delivery must be confirmed   ·   All features P1/P2 — no descoping without revenue risk", {
      x: 2.3, y: 5.05, w: 7.55, h: 0.38, fontSize: 7.5, color: NC.bgGrey, fontFace: "Calibri", valign: "middle", margin: 0
    });
  }

  // ════════════════════════════════════════════════════
  // SLIDE 6: INITIATIVE DETAIL — Billing, Assessments & Installments
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: "F4F6F6" };
    addSlideHeader(s, pres, "Billing, Assessments & Installments", "Core Revenue Management Capabilities | Initiative Detail");
    addFooter(s, pres, ++pageNum);

    const kpis = [
      { v: "~2,880", l: "Total Estimated Effort", u: "Hours" },
      { v: "3", l: "Features in Scope", u: "Count" },
      { v: "P1–P2", l: "Primary Priority", u: "Must/Should Have" },
      { v: "PI28–PI29", l: "Planned PI Window", u: "Program Increments" },
    ];
    kpis.forEach((k, i) => addKpiCard(s, pres, 0.25 + i * 2.39, 1.1, 2.2, 1.0, k.v, k.l, k.u));

    const lx = 0.25, contentY = 2.2, colW = 4.5;
    s.addText("Business Scope", { x: lx, y: contentY, w: colW, h: 0.25, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    s.addText("Manages the generation, issuance, and tracking of tax bills and formal assessments, alongside configurable installment plan management. Enables revenue authorities to systematically collect outstanding liabilities while offering structured repayment arrangements to taxpayers.", {
      x: lx, y: contentY + 0.27, w: colW, h: 0.9,
      fontSize: 9.5, color: NC.nearBlack, fontFace: "Calibri", wrap: true, margin: 0
    });
    s.addText("Key Investment Benefits", { x: lx, y: contentY + 1.22, w: colW, h: 0.25, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    const benefits = [
      "Automated billing reduces manual officer workload and accelerates revenue collection cycles",
      "Structured installment plans increase voluntary compliance and recovery rates",
      "Formal assessment workflows create enforceable legal liability records",
      "Reduces revenue leakage by ensuring all liabilities are captured and tracked",
    ];
    s.addText(benefits.map((b, i) => ({ text: b, options: { bullet: true, breakLine: i < benefits.length - 1 } })), {
      x: lx, y: contentY + 1.5, w: colW, h: 1.35, fontSize: 9, color: NC.textGrey, fontFace: "Calibri", wrap: true
    });

    const rx = 4.9;
    s.addText("Feature Breakdown & PI Planning", { x: rx, y: contentY, w: 4.85, h: 0.25, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    const piHeader = [
      { text: "Feature", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, fontSize: 9 } },
      { text: "Effort (H)", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, fontSize: 9, align: "center" } },
      { text: "Priority", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, fontSize: 9, align: "center" } },
      { text: "PI28", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, fontSize: 9, align: "center" } },
      { text: "PI29", options: { bold: true, color: NC.white, fill: { color: NC.darkTeal }, fontSize: 9, align: "center" } },
    ];
    const featRows = [
      ["Bill Generation & Issuance", "1,280", "P1", "✓", ""],
      ["Formal Assessment Management", "1,040", "P1", "✓", ""],
      ["Installment Plan Configuration", "560", "P2", "", "✓"],
    ];
    const featTable = [piHeader, ...featRows.map((r, ri) => r.map((cell, ci) => ({
      text: cell, options: { fontSize: 9, fontFace: "Calibri", color: cell === "✓" ? NC.darkTeal : NC.nearBlack, bold: cell === "✓", fill: { color: ri % 2 === 0 ? NC.white : NC.lightBg }, align: ci === 0 ? "left" : "center" }
    })))];
    s.addTable(featTable, { x: rx, y: contentY + 0.28, w: 4.85, h: 1.1, colW: [2.1, 0.85, 0.7, 0.6, 0.6], border: { pt: 0.5, color: NC.bgGrey }, fontFace: "Calibri" });

    s.addText("Priority Distribution", { x: rx, y: contentY + 1.48, w: 2.3, h: 0.25, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    s.addChart(pres.charts.DOUGHNUT, [{ name: "Priority", labels: ["P1 – Must Have", "P2 – Should Have"], values: [67, 33] }], {
      x: rx, y: contentY + 1.75, w: 2.3, h: 1.5,
      chartColors: [NC.darkTeal, NC.lightTeal],
      chartArea: { fill: { color: "F4F6F6" } },
      holeSize: 55, showLegend: true, legendPos: "b", legendFontSize: 7, showPercent: true, dataLabelFontSize: 9,
    });

    s.addText("Key Talking Points", { x: rx + 2.5, y: contentY + 1.48, w: 2.35, h: 0.25, fontSize: 10, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
    const pts = [
      "Billing and assessments are prerequisites for collections — sequence with Registration PI delivery",
      "Installment plan scope is small and can provide quick win value in PI29",
      "No features currently started — PI28 kickoff planning required immediately",
    ];
    s.addText(pts.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < pts.length - 1 } })), {
      x: rx + 2.5, y: contentY + 1.75, w: 2.35, h: 1.7, fontSize: 8.5, color: NC.textGrey, fontFace: "Calibri", wrap: true
    });

    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.05, w: 10, h: 0.38, fill: { color: NC.darkTeal }, line: { color: NC.darkTeal } });
    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.05, w: 0.08, h: 0.38, fill: { color: NC.gold }, line: { color: NC.gold } });
    s.addText("Key Talking Points for SteerCo:", { x: 0.15, y: 5.05, w: 2.1, h: 0.38, fontSize: 8, bold: true, color: NC.gold, fontFace: "Calibri", valign: "middle", margin: 0 });
    s.addText("Prerequisite for collections — sequence with Registration   ·   Installment plans = quick win in PI29   ·   No work started — PI28 kickoff required now", {
      x: 2.3, y: 5.05, w: 7.55, h: 0.38, fontSize: 7.5, color: NC.bgGrey, fontFace: "Calibri", valign: "middle", margin: 0
    });
  }

  // ════════════════════════════════════════════════════
  // SLIDE 7: Remaining Initiatives Summary
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: "F4F6F6" };
    addSlideHeader(s, pres, "Remaining Initiatives — Core Revenue Management", "Exemptions | Penalty & Interest | Tax Accounts");
    addFooter(s, pres, ++pageNum);

    const initiatives = [
      {
        title: "Exemptions", effort: "~390H", features: "1", priority: "P2", pi: "PI28",
        scope: "Manages the application, approval, and recording of tax exemptions for qualifying taxpayers or transactions. Ensures audit-traceable decisions and supports statutory compliance for exemption schemes.",
        benefits: ["Reduces manual exemption handling and processing backlogs", "Audit-ready exemption records reduce compliance risk", "Configurable exemption rules support multiple tax types"],
        talking: "Small scope — good candidate for early delivery to demonstrate value to GRC stakeholders in PI28."
      },
      {
        title: "Penalty & Interest", effort: "TBD", features: "1", priority: "P2", pi: "PI28–PI29",
        scope: "Automates the calculation and application of statutory penalties and interest charges on overdue tax liabilities. Ensures accurate and consistent enforcement of late payment rules across all tax types.",
        benefits: ["Automated calculations eliminate manual errors and officer inconsistency", "Increases voluntary compliance by ensuring consistent enforcement", "Supports configurable penalty schedules per tax type and jurisdiction"],
        talking: "Effort not yet estimated — scope clarification required before PI28 planning can be confirmed."
      },
      {
        title: "Tax Accounts", effort: "TBD", features: "1", priority: "P1", pi: "PI28–PI29",
        scope: "Provides a structured account management layer for individual tax obligations, enabling authorities to track, manage, and report on each taxpayer's account position across multiple tax types and periods.",
        benefits: ["Unified account view simplifies officer case management and reduces error rates", "Supports multi-period and multi-tax-type account tracking in a single view", "Foundation for advanced debt management and compliance analytics"],
        talking: "P1 priority but effort TBD — requires immediate scoping to avoid PI28 planning risk."
      },
    ];

    initiatives.forEach((init, col) => {
      const x = 0.2 + col * 3.27;
      const y = 1.12;
      const w = 3.1;

      // Card background
      s.addShape(pres.shapes.RECTANGLE, { x, y, w, h: 4.22, fill: { color: NC.white }, line: { color: NC.bgGrey }, shadow: mkShadow() });
      s.addShape(pres.shapes.RECTANGLE, { x, y, w, h: 0.06, fill: { color: NC.coral }, line: { color: NC.coral } });

      // Title
      s.addText(init.title, { x: x + 0.12, y: y + 0.1, w: w - 0.24, h: 0.35, fontSize: 13, bold: true, color: NC.darkTeal, fontFace: "Calibri", margin: 0 });

      // Mini KPI row
      const mkpis = [
        { v: init.effort, l: "Effort" }, { v: init.features, l: "Features" }, { v: init.priority, l: "Priority" }, { v: init.pi, l: "PI Window" }
      ];
      mkpis.forEach((mk, mi) => {
        const kx = x + 0.07 + mi * 0.76;
        s.addShape(pres.shapes.RECTANGLE, { x: kx, y: y + 0.5, w: 0.7, h: 0.6, fill: { color: NC.darkTeal }, line: { color: NC.medTeal } });
        s.addText(mk.v, { x: kx, y: y + 0.5, w: 0.7, h: 0.37, fontSize: 7.5, bold: true, color: NC.white, fontFace: "Calibri", align: "center", valign: "bottom", margin: 0 });
        s.addText(mk.l, { x: kx, y: y + 0.87, w: 0.7, h: 0.22, fontSize: 6.5, color: NC.gold, fontFace: "Calibri", align: "center", margin: 0 });
      });

      // Scope
      s.addText("Scope", { x: x + 0.12, y: y + 1.18, w: w - 0.24, h: 0.22, fontSize: 9, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
      s.addText(init.scope, { x: x + 0.12, y: y + 1.4, w: w - 0.24, h: 0.9, fontSize: 8.5, color: NC.nearBlack, fontFace: "Calibri", wrap: true, margin: 0 });

      // Benefits
      s.addText("Benefits", { x: x + 0.12, y: y + 2.35, w: w - 0.24, h: 0.22, fontSize: 9, bold: true, color: NC.coral, fontFace: "Calibri", margin: 0 });
      s.addText(init.benefits.map((b, i) => ({ text: b, options: { bullet: true, breakLine: i < init.benefits.length - 1 } })), {
        x: x + 0.12, y: y + 2.58, w: w - 0.24, h: 0.9, fontSize: 8, color: NC.textGrey, fontFace: "Calibri", wrap: true
      });

      // Talking point
      s.addShape(pres.shapes.RECTANGLE, { x: x + 0.12, y: y + 3.54, w: w - 0.24, h: 0.58, fill: { color: NC.lightBg }, line: { color: NC.bgGrey } });
      s.addText(init.talking, { x: x + 0.18, y: y + 3.57, w: w - 0.36, h: 0.52, fontSize: 8, color: NC.darkTeal, fontFace: "Calibri", italic: true, wrap: true, margin: 0 });
    });
  }

  // ════════════════════════════════════════════════════
  // SLIDE 8: Next Steps & SteerCo Decision Points
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: NC.darkTeal };

    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 5.625, fill: { color: NC.coral }, line: { color: NC.coral } });
    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 4.85, w: 10, h: 0.775, fill: { color: NC.deepGreen }, line: { color: NC.deepGreen } });

    s.addText("Next Steps & Decision Points", {
      x: 0.35, y: 0.3, w: 9.3, h: 0.65,
      fontSize: 28, bold: true, color: NC.white, fontFace: "Calibri", margin: 0
    });
    s.addText("Solon Tax Product Roadmap 2026 | SteerCo Session — 29 April 2026", {
      x: 0.35, y: 0.95, w: 9.3, h: 0.35,
      fontSize: 13, color: NC.lightTeal, fontFace: "Calibri", margin: 0
    });

    const decisions = [
      { num: "01", action: "Confirm PI28 Capacity", detail: "Validate delivery team capacity for Registration, Taxpayer Accounting, and Billing features planned in PI28. Flag any resource constraints to product leadership." },
      { num: "02", action: "Estimate Penalty & Interest + Tax Accounts", detail: "Both initiatives are P1/P2 with TBD effort estimates. Scope clarification sessions must be scheduled before PI28 planning begins." },
      { num: "03", action: "Approve PI29 Scope for Registration", detail: "Organisational Hierarchy View feature requires SteerCo alignment on priority and GRC team availability for PI29 delivery confirmation." },
      { num: "04", action: "Advance Exemptions as Quick Win", detail: "Small scope, P2 initiative with clear value. Recommend advancing delivery to PI28 to demonstrate early value to Greek Project stakeholders." },
    ];

    decisions.forEach((d, i) => {
      const y = 1.45 + i * 0.82;
      s.addShape(pres.shapes.RECTANGLE, {
        x: 0.35, y, w: 9.3, h: 0.72,
        fill: { color: NC.medTeal }, line: { color: "1E4A44" }
      });
      s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y, w: 0.06, h: 0.72, fill: { color: NC.gold }, line: { color: NC.gold } });
      s.addText(d.num, { x: 0.45, y: y + 0.08, w: 0.4, h: 0.5, fontSize: 18, bold: true, color: NC.gold, fontFace: "Calibri", margin: 0 });
      s.addText(d.action, { x: 0.9, y: y + 0.1, w: 8.5, h: 0.28, fontSize: 11, bold: true, color: NC.white, fontFace: "Calibri", margin: 0, shrinkText: true });
      s.addText(d.detail, { x: 0.9, y: y + 0.4, w: 8.5, h: 0.28, fontSize: 9, color: NC.bgGrey, fontFace: "Calibri", wrap: true, margin: 0 });
    });

    s.addText("Netcompany | netcompany.com", {
      x: 0.35, y: 4.9, w: 9.3, h: 0.3,
      fontSize: 9, color: NC.slate, fontFace: "Calibri", align: "center", margin: 0
    });
  }

  // ── Write file to the same directory as the script ──
  const outputFileName = "Solon_Roadmap_SteerCo_2026.pptx";

  await pres.writeFile({ fileName: outputFileName });
  console.log(`✅ Presentation successfully generated!`);
  console.log(`📁 File saved as: ${outputFileName}`);
  console.log(`📍 Location: ${process.cwd()}`);
}

buildPresentation().catch(err => { 
  console.error("❌ Failed to generate presentation:", err.message); 
  process.exit(1); 
});