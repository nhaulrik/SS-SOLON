# SOLON - PowerPoint Slide Generator

## Motivation

SOLON is a Node.js-based tool designed to automate the generation of PowerPoint presentations from structured JSON data. It addresses the need for consistent, repeatable slide creation in professional environments, such as product roadmaps, reports, and presentations. By separating content from design through templates and themes, SOLON enables rapid iteration and customization without manual slide editing.

Key problems it solves:
- Eliminates repetitive manual slide creation
- Ensures brand consistency across presentations
- Allows non-technical users to generate professional slides via JSON input
- Provides a visual editor for template customization

## Capabilities

- **Automated Slide Generation**: Creates PowerPoint (.pptx) files from JSON data using predefined templates
- **Template System**: Modular slide templates with components like text, shapes, tables, and charts
- **Theme Support**: Customizable color palettes and fonts via theme files
- **Visual Template Editor**: Web-based UI for editing templates with live preview
- **Multiple Slide Types**: Support for cover slides, agenda grids, KPI summaries, initiative details, and closing slides
- **Timestamped Outputs**: Automatically prefixes generated files with date-time stamps for uniqueness
- **Dark Theme UI**: Modern, dark-themed editor interface

## Installation

### Prerequisites
- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Setup
1. Clone or download the project files
2. Navigate to the project directory
3. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Generating Slides

1. Prepare your input data in `input.json` (see format below)
2. Customize themes in `theme.json` if needed
3. Run the generator:
   ```bash
   npm run generate
   ```
   or
   ```bash
   node generate_slides.js
   ```

The generated PowerPoint file will be saved in the `output` folder with a timestamp prefix (e.g., `output/2026-04-09_10-30-45_Solon_Roadmap_SteerCo_2026.pptx`)

### Editing Templates

1. Start the template editor server:
   ```bash
   npm run edit-template
   ```
   or
   ```bash
   node src/template_editor.js
   ```

2. Open your browser and navigate to `http://localhost:3000`

3. Use the web interface to:
   - View and edit theme colors and fonts
   - Modify slide templates and component positions
   - Preview changes in real-time
   - Save changes back to JSON files

### Input Data Format

The `input.json` file contains:
- **metadata**: Presentation title, author, version info
- **design_tokens**: Color and font definitions
- **slide_types**: Reference guide for available slide types
- **slides**: Array of slide objects with content data

Example slide object:
```json
{
  "slide_type": "cover",
  "title": "Solon Tax Product Roadmap 2026",
  "subtitle": "Feature Catalog for SteerCo",
  "audience_line": "SteerCo Review",
  "author": "Nikolaj"
}
```

### Template Structure

Templates in `slide_templates.json` define slide layouts with components:
- **background**: Theme color token for slide background
- **components**: Array of UI elements (text, shapes, tables, etc.) with positioning and binding info

Example component:
```json
{
  "type": "text",
  "bind": "title",
  "x": 0.5,
  "y": 1.2,
  "w": 8.5,
  "h": 0.85,
  "fontSize": 36,
  "bold": true,
  "color": "white"
}
```

### Theme Customization

Edit `theme.json` to customize:
- **colors**: Hex color values for brand tokens
- **fonts**: Font family names for headings and body text
- **defaults**: Default colors for various slide elements

## Project Structure

```
SOLON/
├── src/
│   ├── generate_slides.js      # Main PowerPoint generation script
│   └── template_editor.js      # Web server for template editor
├── utils/
│   ├── theme.js                # Theme management utilities
│   └── fileUtils.js            # File and data utilities
├── data/
│   ├── input.json              # Input data for slide generation
│   ├── slide_templates.json    # Slide template definitions
│   └── theme.json              # Color and font theme definitions
├── public/
│   ├── editor.html             # HTML interface for template editor
│   └── editor.css              # Styles for the editor UI (dark theme)
├── output/                     # Generated PowerPoint files
├── package.json                # Node.js dependencies and scripts
└── README.md                   # This documentation file
```

## Dependencies

- **pptxgenjs**: PowerPoint file generation library
- **Node.js built-ins**: fs, path, http for file operations and web server

## Contributing

As the project evolves, update this README to reflect new features, changes in file structure, or modifications to the workflow. Keep the documentation current to maintain usability.

## License

ISC License