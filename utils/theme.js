// utils/theme.js - Theme management utilities
const fs = require('fs');
const path = require('path');

class ThemeManager {
  constructor() {
    this.colors = {};
    this.fonts = { heading: "Calibri", body: "Calibri" };
  }

  loadFromFile(themePath) {
    try {
      const themeData = JSON.parse(fs.readFileSync(themePath, 'utf8'));
      this.applyTheme(themeData);
    } catch (error) {
      console.warn(`Warning: Could not load theme from ${themePath}, using defaults`);
    }
  }

  applyTheme(themeData) {
    if (!themeData) return;

    if (themeData.colors && typeof themeData.colors === "object") {
      this.colors = { ...this.colors, ...themeData.colors };
    }

    if (themeData.fonts && typeof themeData.fonts === "object") {
      this.fonts = { ...this.fonts, ...themeData.fonts };
    }
  }

  getColor(token) {
    return this.colors[token] || token; // Return token if not found (allows hex codes)
  }

  getFontFace(type = "body") {
    return this.fonts[type] || this.fonts.body || "Calibri";
  }

  getShadow() {
    return { type: "outer", blur: 4, offset: 2, angle: 135, color: "000000", opacity: 0.12 };
  }
}

module.exports = ThemeManager;