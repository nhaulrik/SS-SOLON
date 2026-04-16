import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { PROJECTS_DIR } from './config.js';
import htmlFlowRoutes from './routes/html-flow.js';
import projectsRoutes from './routes/projects.js';

// Ensure runtime directory exists
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

export const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/projects', projectsRoutes);
app.use('/api', htmlFlowRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Start listening only when run directly — not when imported by tests.
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
