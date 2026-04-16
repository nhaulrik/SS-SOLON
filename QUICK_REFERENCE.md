# SOLON Quick Reference Card

**Application URL**: http://localhost:5174

---

## 5-Minute Quick Start

### 1. Create Project
```
Click "Start New Project" → Enter name → Click "Create Project"
```

### 2. Upload Template
```
Click "+ Upload Template" → Select HTML file → Upload
```

### 3. Create Flow
```
Click "+ New Flow" on template → Enter flow name → Click "Create"
```

### 4. Complete Flow
```
Click flow name → Follow steps:
  Step 1: HTML Upload (tree displayed)
  Step 2: Recipe Generation (AI prompt)
  Step 3: Paste AI Response (validate JSON)
  Step 4: Preview Output (see result)
  Step 5: Metadata Assignment (save)
```

### 5. Export Slides
```
After flow completion → Click "Export" → Enter export name → "Generate Export"
```

### 6. Create Structure
```
Click "Structures" tab → "+ Create Structure" → Select export → Review → Create
```

### 7. Build Relationships
```
In RelationshipBuilder:
  - Click slide in right panel to select
  - Click "+ Add Node" to add to tree
  - Drag nodes to reorganize
  - Click "×" on hover to delete
  - Click "Save Structure" when done
```

### 8. Create Package
```
Click "Packages" tab → "+ Create Package" → Follow 4 steps:
  Step 1: Select structure
  Step 2: Configure options
  Step 3: Enter metadata
  Step 4: Review & create
```

### 9. Download Package
```
In package card → Click "⬇ Download" → ZIP file downloads
```

---

## Dashboard Tabs

| Tab | Purpose | Actions |
|-----|---------|---------|
| **Templates & Flows** | Manage templates and flows | Upload, Create, Open |
| **Structures** | Build hierarchies | Create, Edit, Delete |
| **Packages** | Create distributions | Create, Download, Delete |

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open DevTools | F12 |
| Refresh Page | Ctrl+R |
| Go Back | Alt+← |
| Go Forward | Alt+→ |

---

## File Downloads

When you download a package, you get:
```
package-name.zip
├── package.json          # Metadata
├── README.md             # Documentation
├── MANIFEST.json         # Structure info
├── metadata.json         # Statistics
└── slides/               # Organized slides
    ├── 01-section-1/
    │   ├── slide.html
    │   └── metadata.json
    └── 02-section-2/
        └── slide.html
```

---

## Common Actions

### Upload a Template
1. Go to Templates & Flows tab
2. Click "+ Upload Template"
3. Select HTML file
4. Wait for upload

### Add a Node to Structure
1. Select slide from right panel
2. Click "+ Add Node"
3. Enter node name
4. Click "Add"

### Move a Node
1. Click and drag node in tree
2. Drop on new parent
3. Node moves if valid

### Delete a Node
1. Hover over node
2. Click "×" button
3. Node is deleted

### Download Package
1. Find package card
2. Click "⬇ Download"
3. ZIP file downloads

---

## Status Indicators

| Indicator | Meaning |
|-----------|---------|
| ✓ Checkmark | Selected/Completed |
| × Button | Delete/Close |
| ⬇ Arrow | Download |
| 📊 Chart | View Details |
| 🗑 Trash | Delete |
| → Arrow | Next/Open |
| ← Arrow | Back |

---

## Tips

- **Drag & Drop**: You can drag nodes in the tree to reorganize
- **Hover Actions**: Hover over nodes to see delete button
- **Validation**: Forms will tell you what's required
- **Auto-save**: Data is saved automatically
- **Responsive**: Works on desktop, tablet, and mobile
- **Tabs**: Click tab names to switch between views

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Page won't load | Refresh (Ctrl+R) or check URL |
| Button not responding | Try clicking again or refresh |
| Can't upload file | Ensure it's valid HTML |
| Can't create structure | Ensure you have exports first |
| Download failed | Try again or check browser settings |

---

## Data Flow

```
Upload Template
    ↓
Create Flow
    ↓
Complete Flow (AI Generation)
    ↓
Export Slides
    ↓
Create Structure
    ↓
Build Relationships
    ↓
Create Package
    ↓
Download ZIP
```

---

## What You Can Do

✅ Create multiple projects  
✅ Upload multiple templates  
✅ Create multiple flows  
✅ Generate slides with AI  
✅ Export in multiple formats  
✅ Create complex hierarchies  
✅ Build multiple packages  
✅ Download and distribute  

---

## Browser Console

If you encounter issues, check the browser console (F12 → Console tab) for error messages.

Common errors will show:
- API errors
- Validation errors
- Network issues
- JavaScript errors

---

**Last Updated**: 2026-04-16  
**Version**: 1.0
