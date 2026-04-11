// Public API barrel — imports from focused lib modules.
// server/__tests__/pptx-utils.test.js and index.js both import from here.
export { parseSlides, extractSlideElements, getPresetColor } from './lib/slide-parser.js';
export { replacePlaceholders }                               from './lib/placeholder.js';
export { detectSharedKeys, buildRecipe, validateJsonData }  from './lib/recipe-builder.js';
export { buildPptxZip }                                     from './lib/pptx-builder.js';
