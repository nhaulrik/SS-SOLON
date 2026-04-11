import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { TEMP_DIR, OUTPUT_DIR, PATCHES_DIR, CHAINS_DIR } from './config.js';
import pptxRoutes   from './routes/pptx.js';
import patchRoutes  from './routes/patches.js';
import chainRoutes  from './routes/chains.js';

// Ensure runtime directories exist
for (const dir of [TEMP_DIR, OUTPUT_DIR, PATCHES_DIR, CHAINS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api', pptxRoutes);
app.use('/api', patchRoutes);
app.use('/api', chainRoutes);

// Start listening only when run directly — not when imported by tests.
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
