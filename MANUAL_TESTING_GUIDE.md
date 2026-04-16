# SOLON Manual Testing Guide

**Application URL**: http://localhost:5174  
**Status**: Ready for manual testing  
**Last Updated**: 2026-04-16

---

## Getting Started

### Access the Application
1. Open your browser
2. Navigate to: **http://localhost:5174**
3. You should see the SOLON landing page

---

## Feature Walkthrough

### Phase 1: Project Management

#### Step 1: Create a Project
1. Click **"Start New Project"** button
2. Enter a project name (e.g., "My Test Project")
3. Click **"Create Project"**
4. You'll be taken to the **Project Dashboard**

**Expected Result**: Project created and dashboard displayed

---

### Phase 2: Template Upload & Flow Management

#### Step 2: Upload a Template
1. In the Project Dashboard, you're on the **"Templates & Flows"** tab
2. Click **"+ Upload Template"** button
3. Select an HTML file from your computer (or use a sample HTML file)
4. The template will be uploaded and appear in the Templates section

**Expected Result**: Template appears in the list with file size and upload date

#### Step 3: Create a Flow
1. In the Templates section, find your uploaded template
2. Click **"+ New Flow"** button on the template card
3. The "Create Flow" dialog will open
4. Enter a flow name (e.g., "Flow 1")
5. Click **"Create"**

**Expected Result**: Flow created and appears under the template

#### Step 4: View Active Flows
1. The newly created flow appears in:
   - The template card under "Active Flows"
   - The "All Flows" section below

**Expected Result**: Flow is listed in both locations

---

### Phase 3: HTML Editing & Generation

#### Step 5: Edit Template (HTML Upload)
1. Click on a flow name to open it
2. You'll be taken to the **HTML Upload** step
3. The template HTML is displayed
4. You can see the structure tree on the left side

**Expected Result**: Template structure is parsed and displayed

#### Step 6: Define Content Zones
1. In the HTML tree, you can click on elements to select them as content zones
2. Elements marked with `data-zone` or `data-block` are pre-selected
3. You can see the element preview on the right

**Expected Result**: Zones are highlighted and previewed

#### Step 7: Generate Recipe (AI Prompt)
1. Click **"Next"** to proceed to the Recipe step
2. You can optionally enter **"Global Guidance"** for the AI
3. Click **"Generate Recipe"** or review the generated recipe
4. The recipe shows all the zones to be filled

**Expected Result**: Recipe is generated with all zones listed

#### Step 8: Paste AI Response
1. Copy the recipe text
2. Paste it into your AI tool (ChatGPT, Claude, etc.)
3. Get the AI response
4. Paste the AI's JSON response back into the dialog
5. Click **"Validate"**

**Expected Result**: Response is validated and shows success/errors

#### Step 9: Preview Output
1. Click **"Next"** to see the preview
2. You can see the generated HTML with all zones filled
3. The preview shows how the output looks

**Expected Result**: Preview displays the patched HTML

#### Step 10: Assign Metadata
1. Click **"Next"** to the Metadata step
2. You can assign metadata to the project
3. Click **"Save Project"**

**Expected Result**: Project is saved with metadata

---

### Phase 3: Export Management

#### Step 11: Export Slides
1. In the Project Dashboard, click on a flow
2. Complete the flow generation (Steps 2-10 above)
3. After saving, you'll see an **"Export"** button
4. Click **"Export"**
5. The Export dialog opens
6. Enter an export name (e.g., "Export 1")
7. Click **"Generate Export"**

**Expected Result**: Export is created with individual slide files

#### Step 12: View Export History
1. In the Project Dashboard, you'll see the **"Export History"** panel
2. It shows all exports created
3. Each export shows:
   - Export ID
   - Number of slides
   - Creation date
   - Status

**Expected Result**: Export appears in history with correct metadata

#### Step 13: Download Export
1. In the Export History panel, click on an export
2. You'll see a list of slides
3. Click **"Download"** to download the export as ZIP

**Expected Result**: ZIP file downloads with all slides

---

### Phase 4B: Relationship Builder (Structures)

#### Step 14: Create a Structure
1. In the Project Dashboard, click the **"Structures"** tab
2. Click **"+ Create Structure"** button
3. The Structure Editor dialog opens
4. **Step 1 - Name & Description**:
   - Enter a name (e.g., "Executive Summary")
   - Enter a description (optional)
   - Click **"Next"**

**Expected Result**: Structure creation started

#### Step 15: Select Exports
1. **Step 2 - Select Exports**:
   - You'll see a list of available exports
   - Select one or more exports by clicking on them
   - Selected exports are highlighted
   - Click **"Next"**

**Expected Result**: Exports are selected and highlighted

#### Step 16: Review Structure
1. **Step 3 - Review**:
   - Review your selections
   - Click **"Create Structure"**

**Expected Result**: Structure is created

#### Step 17: Build Relationship Tree
1. The RelationshipBuilder dialog opens
2. **Left Panel - Tree View**:
   - Shows the hierarchical structure
   - Initially has no nodes
3. **Right Panel - Available Slides**:
   - Shows all slides from selected exports
   - Each slide shows its export and index

**Expected Result**: Tree is empty, slides are available

#### Step 18: Add Nodes to Structure
1. In the Right Panel, click on a slide to select it
2. In the Left Panel, click **"+ Add Node"** button
3. Enter a node name (e.g., "Introduction")
4. Click **"Add"**

**Expected Result**: Node appears in the tree

#### Step 19: Expand/Collapse Nodes
1. In the tree, click the arrow icon next to a node to expand/collapse
2. Expanded nodes show their children

**Expected Result**: Nodes expand and collapse smoothly

#### Step 20: Add Child Nodes
1. Click on a node in the tree to select it
2. Click **"+ Add Child"** button
3. Select a slide from the right panel
4. Enter a node name
5. Click **"Add"**

**Expected Result**: Child node appears under the parent

#### Step 21: Move Nodes
1. In the tree, you can drag and drop nodes
2. Drag a node to a new parent
3. The tree updates

**Expected Result**: Node moves to new parent (if not creating circular dependency)

#### Step 22: Delete Nodes
1. Hover over a node in the tree
2. Click the **"×"** button that appears on hover
3. Node is removed

**Expected Result**: Node is deleted from tree

#### Step 23: Save Structure
1. Click **"Save Structure"** button at the bottom
2. The structure is saved

**Expected Result**: Structure is saved and dialog closes

#### Step 24: View Structure List
1. In the Structures tab, you'll see the created structure
2. It shows:
   - Structure name
   - Number of nodes
   - Creation date

**Expected Result**: Structure appears in list

---

### Phase 4C: Packaging System (Packages)

#### Step 25: Create a Package
1. In the Project Dashboard, click the **"Packages"** tab
2. Click **"+ Create Package"** button
3. The CreatePackageDialog opens with **Step 1 - Select Structure**

**Expected Result**: Package creation dialog opens

#### Step 26: Select Structure
1. **Step 1 - Select Structure**:
   - You'll see a list of available structures
   - Click on a structure to select it
   - Selected structure is highlighted with a checkmark
   - Click **"Next"**

**Expected Result**: Structure is selected

#### Step 27: Configure Package Options
1. **Step 2 - Configure Package**:
   - Enter a **Package Name** (e.g., "Executive Summary Package")
   - Enter a **Description** (optional)
   - Check/uncheck options:
     - ✓ Include Manifest (MANIFEST.json)
     - ✓ Generate README (auto-generated docs)
     - ✓ Include Metadata (metadata.json files)
   - Click **"Next"**

**Expected Result**: Configuration is accepted

#### Step 28: Customize Metadata
1. **Step 3 - Customize Metadata**:
   - Enter a **Title** (auto-filled from package name)
   - Enter an **Author** (optional, e.g., "Finance Team")
   - Enter **Tags** (comma-separated, e.g., "executive, q1-2026")
   - Version is auto-set to "1.0"
   - Click **"Next"**

**Expected Result**: Metadata is entered

#### Step 29: Review Package
1. **Step 4 - Review**:
   - Review all your selections:
     - Structure name
     - Package name
     - Title
     - Author
     - Tags
     - Options (Manifest, README, Metadata)
   - Click **"Create Package"**

**Expected Result**: Package is created

#### Step 30: View Package List
1. The Packages tab now shows your created package
2. The package card displays:
   - Package name
   - Status badge (draft/published)
   - Description
   - Creation date
   - Author
   - Tags
   - Statistics:
     - Total slides
     - Total size
     - Tree depth
     - File count

**Expected Result**: Package appears in list with all information

#### Step 31: Download Package
1. In the package card, click **"⬇ Download"** button
2. A ZIP file is downloaded with the package name
3. The ZIP contains:
   - `package.json` - Package metadata
   - `README.md` - Auto-generated documentation
   - `MANIFEST.json` - Structure and file listing
   - `metadata.json` - Statistics
   - `slides/` folder - Organized slides in hierarchy

**Expected Result**: ZIP file downloads successfully

#### Step 32: View Package Details
1. In the package card, click **"📊 Details"** button
2. You see detailed statistics:
   - Package size in bytes
   - File count
   - Total slides
   - Tree depth
   - Structure name

**Expected Result**: Detailed stats are displayed

#### Step 33: Delete Package
1. In the package card, click **"🗑 Delete"** button
2. A confirmation dialog appears
3. Click **"Yes, Delete"** to confirm
4. Package is removed from the list

**Expected Result**: Package is deleted

---

## Dashboard Navigation

### Tabs Overview

The Project Dashboard has three main tabs:

#### Tab 1: Templates & Flows
- Upload new templates
- Create flows from templates
- View all templates and flows
- Manage flow lifecycle

#### Tab 2: Structures
- Create new structures from exports
- View all structures
- Edit structures (add/move/remove nodes)
- Manage hierarchical relationships

#### Tab 3: Packages
- Create new packages from structures
- View all packages
- Download packages as ZIP
- View package statistics
- Delete packages

---

## Testing Scenarios

### Scenario 1: Full Workflow (Beginner)
1. Create a project
2. Upload a template
3. Create a flow
4. Generate and complete the flow
5. Export slides
6. Create a structure from the export
7. Create a package from the structure
8. Download the package

**Expected Result**: Complete workflow succeeds

### Scenario 2: Multiple Structures
1. Create multiple structures from different exports
2. Build different hierarchies in each structure
3. Create packages from each structure
4. Verify each package has correct content

**Expected Result**: All packages are independent and correct

### Scenario 3: Complex Hierarchy
1. Create a structure with deep nesting (5+ levels)
2. Add many nodes at each level
3. Move nodes between different parents
4. Verify tree updates correctly

**Expected Result**: Complex hierarchies work smoothly

### Scenario 4: Package Distribution
1. Create a package
2. Download the ZIP file
3. Extract the ZIP file
4. Verify contents:
   - README.md is readable
   - MANIFEST.json is valid JSON
   - package.json contains metadata
   - slides/ folder has correct structure

**Expected Result**: All files are present and valid

---

## Common Issues & Troubleshooting

### Issue: Port Already in Use
**Solution**: Kill the process on port 5174 or use a different port

### Issue: Template Upload Fails
**Solution**: 
- Ensure file is valid HTML
- Check file size is reasonable
- Try a different HTML file

### Issue: Structure Creation Fails
**Solution**:
- Ensure you have at least one export
- Verify export has slides
- Try creating a simpler structure first

### Issue: Package Download Fails
**Solution**:
- Ensure package was created successfully
- Check browser download settings
- Try a different package

---

## Performance Notes

- **Template Upload**: <5 seconds
- **Flow Creation**: <2 seconds
- **Export Generation**: 5-30 seconds (depends on HTML size)
- **Structure Creation**: <2 seconds
- **Package Creation**: <5 seconds
- **Package Download**: 1-5 seconds (depends on package size)

---

## Browser Compatibility

Tested and working on:
- ✅ Chrome/Chromium (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)

---

## Tips for Testing

1. **Use Sample HTML**: Create simple HTML files for testing
2. **Test Edge Cases**: Try empty structures, large files, etc.
3. **Check Console**: Open DevTools (F12) to see any errors
4. **Test Responsiveness**: Resize browser to test mobile layout
5. **Test Navigation**: Use back button, try different flows
6. **Verify Data**: Check that data persists across page reloads

---

## What to Look For

### UI/UX
- ✅ Buttons are clickable and responsive
- ✅ Forms validate input correctly
- ✅ Error messages are clear
- ✅ Loading states are visible
- ✅ Dialogs open and close smoothly
- ✅ Tab switching works smoothly

### Functionality
- ✅ Data is saved correctly
- ✅ Data persists across page reloads
- ✅ Relationships are maintained
- ✅ Exports contain correct slides
- ✅ Packages are created with correct structure
- ✅ Downloads work properly

### Performance
- ✅ Pages load quickly
- ✅ No lag when clicking buttons
- ✅ Smooth animations and transitions
- ✅ No console errors

---

## Next Steps

After testing:
1. Document any bugs found
2. Note any UI/UX improvements
3. Test on different browsers
4. Test on mobile devices
5. Report findings for Phase 4E (Testing & Polish)

---

**Testing Version**: 1.0  
**Last Updated**: 2026-04-16  
**Status**: Ready for manual testing
