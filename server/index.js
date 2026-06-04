import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR } from './config.js';
import { resolveProjectDir } from './lib/project/project-manager.js';
import htmlFlowRoutes from './routes/html-flow.js';
import projectsRoutes from './routes/projects.js';
import aiProxyRoutes from './routes/ai-proxy.js';
import agenticRoutes   from './routes/opencode-agentic.js';
import presentationStructuresRoutes from './routes/presentation-structures.js';
import presentationsRoutes from './routes/presentations.js';
import catalogGroupsRoutes from './routes/catalog-groups.js';

dotenv.config({ path: './server/.env' });

if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

export const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/projects', projectsRoutes);
app.use('/api/projects', presentationStructuresRoutes);
app.use('/api/projects', presentationsRoutes);
app.use('/api/projects', catalogGroupsRoutes);
app.use('/api', htmlFlowRoutes);
app.use('/api', aiProxyRoutes);
app.use('/api/opencode', agenticRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/published/:projectName/presentations/:presentationName', (req, res, next) => {
  const { projectName, presentationName } = req.params;
  if (!/^[\w-]{1,100}$/.test(projectName)) return res.status(400).end();
  if (!/^[\w-]{1,100}$/.test(presentationName)) return res.status(400).end();
  const publishedDir = path.join(resolveProjectDir(projectName), 'presentations', presentationName);
  express.static(publishedDir, { index: 'index.html' })(req, res, next);
});

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
