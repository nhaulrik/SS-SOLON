# Phase 5 Quick Start Guide

## TL;DR - Run the Test in 3 Steps

### Step 1: Start the Dev Server
```bash
npm run dev
```
Wait for "ready in X ms" message.

### Step 2: In Another Terminal, Run the Playwright Test
```bash
npx playwright test e2e/phase-5-load-existing-flow.spec.js --headed
```

### Step 3: Watch the Browser and See Results

---

## What You'll See

The test will:
1. Upload initiative_template_v4.html ✅
2. Create a project with zones ✅
3. Load the existing flow ✅
4. Generate a recipe ✅
5. Validate JSON ✅

**Expected Result**: All tests pass ✅

---

## Run Specific Tests

### Complete Workflow Only
```bash
npx playwright test e2e/phase-5-load-existing-flow.spec.js -g "Complete workflow"
```

### Interactive Mode (Recommended for Debugging)
```bash
npx playwright test e2e/phase-5-load-existing-flow.spec.js --ui
```

### With Browser Visible
```bash
npx playwright test e2e/phase-5-load-existing-flow.spec.js --headed
```

### With Debugging
```bash
npx playwright test e2e/phase-5-load-existing-flow.spec.js --debug
```

---

## What Gets Tested

| Step | What | Expected Result |
|------|------|-----------------|
| 1 | Upload initiative_template_v4.html | ✅ Template ID returned |
| 2 | Create project with 2 zones | ✅ Project & Flow created |
| 3 | Load existing flow | ✅ isExistingFlow = true |
| 4 | Generate recipe | ✅ Recipe with BLOCK ZONES |
| 5 | Validate JSON | ✅ Valid = true |

---

## Troubleshooting

### Test Hangs
- Dev server not running? → Run `npm run dev` in Terminal 1

### "Cannot connect"
- Check port 3001 is available
- Check port 5173 is available

### Test Fails
- Run with `--headed` to see what's happening
- Check browser console for errors
- Check Terminal 1 for backend errors

---

## Files Created

- `e2e/phase-5-load-existing-flow.spec.js` - The Playwright test
- `PHASE_5_PLAYWRIGHT_TEST_GUIDE.md` - Detailed guide
- `PHASE_5_QUICK_START.md` - This file

---

## Success Criteria

✅ All tests pass  
✅ No timeout errors  
✅ No API errors  
✅ JSON validation succeeds  

**If you see these, Phase 5 is working!**

---

## Next Steps

1. Run the test
2. Verify it passes
3. Try opening an existing flow in the UI
4. Create a new project and save it
5. Refresh the page and open the flow again

---

**Ready? Run this:**
```bash
npm run dev
# In another terminal:
npx playwright test e2e/phase-5-load-existing-flow.spec.js --headed
```
