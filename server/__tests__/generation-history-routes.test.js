/**
 * server/__tests__/generation-history-routes.test.js
 *
 * Integration tests for generation history API endpoints.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_CHAINS_DIR = path.join(__dirname, '../../test-chains-routes')

// Set test environment BEFORE importing app
process.env.CHAINS_DIR = TEST_CHAINS_DIR

// Now import app
const { app } = await import('../index.js')

// Helper to clean up test chains
function cleanupTestChains() {
  if (fs.existsSync(TEST_CHAINS_DIR)) {
    fs.rmSync(TEST_CHAINS_DIR, { recursive: true, force: true })
  }
}

const sampleHtmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <title>Sample Template</title>
</head>
<body>
  <section>
    <h1 data-block="title">Title</h1>
    <p data-block="description">Description</p>
  </section>
</body>
</html>
`

describe('Generation History API Routes', () => {
  beforeEach(() => {
    cleanupTestChains()
    fs.mkdirSync(TEST_CHAINS_DIR, { recursive: true })
  })

  afterEach(() => {
    cleanupTestChains()
  })

  describe('GET /api/html-flow/:chainId/generations', () => {
    it('should return empty list for chain with no generations', async () => {
      // Create a project first
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      const res = await request(app).get(`/api/html-flow/${chainId}/generations`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.generations).toEqual([])
      expect(res.body.total).toBe(0)
    })

    it('should list all generations', async () => {
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      // Generate a recipe
      const recipeRes = await request(app)
        .post('/api/html-flow/generate-recipe')
        .send({ chainId, globalPrompt: 'test prompt' })

      expect(recipeRes.status).toBe(200)
      expect(recipeRes.body.ok).toBe(true)

      const res = await request(app).get(`/api/html-flow/${chainId}/generations`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.generations).toHaveLength(1)
      expect(res.body.total).toBe(1)
      expect(res.body.generations[0].type).toBe('recipe')
    })

    it('should filter by type', async () => {
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      // Generate a recipe
      await request(app)
        .post('/api/html-flow/generate-recipe')
        .send({ chainId })

      // Apply content
      await request(app)
        .post('/api/html-flow/apply-content')
        .send({ chainId, jsonString: '{"blocks": {"title": "Test"}}' })

      const recipeRes = await request(app).get(`/api/html-flow/${chainId}/generations?type=recipe`)
      const roundRes = await request(app).get(`/api/html-flow/${chainId}/generations?type=round`)

      expect(recipeRes.body.generations).toHaveLength(1)
      expect(recipeRes.body.generations[0].type).toBe('recipe')

      expect(roundRes.body.generations).toHaveLength(1)
      expect(roundRes.body.generations[0].type).toBe('round')
    })

    it('should support pagination', async () => {
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      // Generate multiple recipes
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/html-flow/generate-recipe')
          .send({ chainId })
      }

      const page1 = await request(app).get(`/api/html-flow/${chainId}/generations?limit=2&offset=0`)
      const page2 = await request(app).get(`/api/html-flow/${chainId}/generations?limit=2&offset=2`)

      expect(page1.body.generations).toHaveLength(2)
      expect(page2.body.generations).toHaveLength(1)
    })

    it('should return 400 for invalid chainId', async () => {
      const res = await request(app).get('/api/html-flow/invalid@chain/generations')

      expect(res.status).toBe(400)
      expect(res.body.ok).toBe(false)
    })
  })

  describe('GET /api/html-flow/:chainId/generations/:generationId', () => {
    it('should get single generation details', async () => {
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      const recipeRes = await request(app)
        .post('/api/html-flow/generate-recipe')
        .send({ chainId, globalPrompt: 'test' })

      expect(recipeRes.status).toBe(200)
      expect(recipeRes.body.ok).toBe(true)

      const generationId = recipeRes.body.generationId

      const res = await request(app).get(`/api/html-flow/${chainId}/generations/${generationId}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.generation).toBeDefined()
      expect(res.body.generation.id).toBe(generationId)
      expect(res.body.generation.type).toBe('recipe')
      expect(res.body.generation.globalPrompt).toBe('test')
    })

    it('should return 404 for non-existent generation', async () => {
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      const res = await request(app).get(`/api/html-flow/${chainId}/generations/non-existent`)

      expect(res.status).toBe(404)
      expect(res.body.ok).toBe(false)
    })
  })

  describe('DELETE /api/html-flow/:chainId/generations/:generationId', () => {
    it('should delete a generation', async () => {
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      const recipeRes = await request(app)
        .post('/api/html-flow/generate-recipe')
        .send({ chainId })

      const generationId = recipeRes.body.generationId

      const deleteRes = await request(app).delete(`/api/html-flow/${chainId}/generations/${generationId}`)

      expect(deleteRes.status).toBe(200)
      expect(deleteRes.body.ok).toBe(true)

      // Verify it's deleted
      const getRes = await request(app).get(`/api/html-flow/${chainId}/generations/${generationId}`)
      expect(getRes.status).toBe(404)
    })

    it('should return 404 for non-existent generation', async () => {
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      const res = await request(app).delete(`/api/html-flow/${chainId}/generations/non-existent`)

      expect(res.status).toBe(404)
      expect(res.body.ok).toBe(false)
    })
  })

  describe('GET /api/html-flow/:chainId/generations-stats', () => {
    it('should return generation statistics', async () => {
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      // Generate recipe and apply content
      await request(app)
        .post('/api/html-flow/generate-recipe')
        .send({ chainId })

      await request(app)
        .post('/api/html-flow/apply-content')
        .send({ chainId, jsonString: '{"blocks": {"title": "Test"}}' })

      const res = await request(app).get(`/api/html-flow/${chainId}/generations-stats`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.stats).toBeDefined()
      expect(res.body.stats.totalCount).toBe(2)
      expect(res.body.stats.byType.recipe).toBe(1)
      expect(res.body.stats.byType.round).toBe(1)
    })
  })

  describe('POST /api/html-flow/:chainId/generations/:generationId/replay', () => {
    it('should replay a previous generation', async () => {
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      // Apply content first time
      const applyRes = await request(app)
        .post('/api/html-flow/apply-content')
        .send({ chainId, jsonString: '{"blocks": {"title": "Test"}}' })

      const generationId = applyRes.body.generationId

      // Replay
      const replayRes = await request(app)
        .post(`/api/html-flow/${chainId}/generations/${generationId}/replay`)

      expect(replayRes.status).toBe(200)
      expect(replayRes.body.ok).toBe(true)
      expect(replayRes.body.roundId).toBeDefined()
      expect(replayRes.body.outputFile).toBeDefined()
      expect(replayRes.body.previewHtml).toBeDefined()
      expect(replayRes.body.slideCount).toBeGreaterThan(0)
      expect(replayRes.body.sourceGenerationId).toBe(generationId)
    })

    it('should return 404 for non-round generation', async () => {
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      const recipeRes = await request(app)
        .post('/api/html-flow/generate-recipe')
        .send({ chainId })

      const generationId = recipeRes.body.generationId

      const res = await request(app)
        .post(`/api/html-flow/${chainId}/generations/${generationId}/replay`)

      expect(res.status).toBe(404)
      expect(res.body.ok).toBe(false)
    })
  })

  describe('GET /api/html-flow/:chainId/generations-export', () => {
    it('should export all generations as JSON file', async () => {
      const createRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = createRes.body.templateId

      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      // Generate recipe
      await request(app)
        .post('/api/html-flow/generate-recipe')
        .send({ chainId })

      const res = await request(app).get(`/api/html-flow/${chainId}/generations-export`)

      expect(res.status).toBe(200)
      expect(res.type).toMatch('application/json')

      const data = JSON.parse(res.text)
      expect(data.chainId).toBe(chainId)
      expect(data.exportedAt).toBeDefined()
      expect(data.generationCount).toBeGreaterThan(0)
      expect(data.generations).toBeDefined()
      expect(Array.isArray(data.generations)).toBe(true)
    })

    it('should return 404 for non-existent chain', async () => {
      const res = await request(app).get('/api/html-flow/non-existent/generations-export')

      expect(res.status).toBe(404)
      expect(res.body.ok).toBe(false)
    })
  })

  describe('Integration: Full generation lifecycle', () => {
    it('should track complete generation lifecycle', async () => {
      // 1. Upload template
      const uploadRes = await request(app)
        .post('/api/html-flow/upload-template')
        .send({ html: sampleHtmlTemplate })

      const templateId = uploadRes.body.templateId

      // 2. Create project
      const projectRes = await request(app)
        .post('/api/html-flow/create-project')
        .send({ templateId, selections: [] })

      const chainId = projectRes.body.chainId

      // 3. Generate recipe
      const recipeRes = await request(app)
        .post('/api/html-flow/generate-recipe')
        .send({ chainId, globalPrompt: 'Create engaging content' })

      expect(recipeRes.status).toBe(200)
      expect(recipeRes.body.ok).toBe(true)

      const recipeGenId = recipeRes.body.generationId

      // 4. Apply content
      const applyRes = await request(app)
        .post('/api/html-flow/apply-content')
        .send({ chainId, jsonString: '{"blocks": {"title": "Test Title", "description": "Test Description"}}' })

      expect(applyRes.status).toBe(200)
      expect(applyRes.body.ok).toBe(true)

      const roundGenId = applyRes.body.generationId

      // 5. Get history
      const historyRes = await request(app).get(`/api/html-flow/${chainId}/generations`)

      expect(historyRes.body.generations).toHaveLength(2)

      // 6. Get stats
      const statsRes = await request(app).get(`/api/html-flow/${chainId}/generations-stats`)

      expect(statsRes.body.stats.totalCount).toBe(2)
      expect(statsRes.body.stats.byType.recipe).toBe(1)
      expect(statsRes.body.stats.byType.round).toBe(1)

      // 7. Replay
      const replayRes = await request(app)
        .post(`/api/html-flow/${chainId}/generations/${roundGenId}/replay`)

      expect(replayRes.status).toBe(200)

      // 8. Verify history now has 3 entries
      const finalHistoryRes = await request(app).get(`/api/html-flow/${chainId}/generations`)

      expect(finalHistoryRes.body.generations).toHaveLength(3)

      // 9. Delete recipe generation
      await request(app).delete(`/api/html-flow/${chainId}/generations/${recipeGenId}`)

      // 10. Verify only 2 remain
      const afterDeleteRes = await request(app).get(`/api/html-flow/${chainId}/generations`)

      expect(afterDeleteRes.body.generations).toHaveLength(2)
    })
  })
})
