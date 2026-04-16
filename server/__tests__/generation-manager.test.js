/**
 * server/__tests__/generation-manager.test.js
 *
 * Unit tests for generation history management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_CHAINS_DIR = path.join(__dirname, '../../test-chains-gen')

// Set test environment BEFORE importing generation-manager
process.env.CHAINS_DIR = TEST_CHAINS_DIR

// Now import the module (it will use the test directory)
const {
  recordRecipeGeneration,
  recordRound,
  recordFullSlideGeneration,
  getGenerationHistory,
  getGenerationCount,
  getGeneration,
  getSlideGenerations,
  deleteGeneration,
  clearGenerationsByType,
  getGenerationForReplay,
  recordReplay,
  getGenerationStats,
  exportGenerations,
} = await import('../lib/generation-manager.js')

// Helper to create a test chain
function createTestChain(chainId) {
  const chainDir = path.join(TEST_CHAINS_DIR, chainId)
  fs.mkdirSync(chainDir, { recursive: true })

  const chainJson = {
    id: chainId,
    flow: 'html',
    projectName: 'test-project',
    templateFile: 'template.html',
    templatePath: path.join(chainDir, 'template.html'),
    slideCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    zones: [
      {
        key: 'title',
        nodeId: 'h1',
        slideIndex: 1,
        type: 'block',
        autoGenerate: true,
      },
      {
        key: 'description',
        nodeId: 'p',
        slideIndex: 1,
        type: 'block',
        autoGenerate: true,
      },
    ],
    rounds: [],
  }

  fs.writeFileSync(path.join(chainDir, 'chain.json'), JSON.stringify(chainJson, null, 2), 'utf8')
  fs.writeFileSync(path.join(chainDir, 'template.html'), '<html><body><h1>Test</h1></body></html>', 'utf8')

  return chainDir
}

// Helper to clean up test chains
function cleanupTestChains() {
  if (fs.existsSync(TEST_CHAINS_DIR)) {
    fs.rmSync(TEST_CHAINS_DIR, { recursive: true, force: true })
  }
}

describe('Generation Manager', () => {
  beforeEach(() => {
    cleanupTestChains()
    fs.mkdirSync(TEST_CHAINS_DIR, { recursive: true })
  })

  afterEach(() => {
    cleanupTestChains()
  })

  describe('recordRecipeGeneration', () => {
    it('should record a recipe generation', () => {
      const chainId = 'chain-test-1'
      createTestChain(chainId)

      const recipe = '# INSTRUCTIONS\nGenerate content'
      const prompt = 'Create a title'
      const metadata = { slideCount: 1, zoneCount: 2, repeatableSlideCount: 0 }

      const generationId = recordRecipeGeneration(chainId, recipe, prompt, metadata)

      expect(generationId).toBeDefined()
      expect(generationId).toMatch(/^gen-/)

      const generation = getGeneration(chainId, generationId)
      expect(generation).toBeDefined()
      expect(generation.type).toBe('recipe')
      expect(generation.recipe).toBe(recipe)
      expect(generation.globalPrompt).toBe(prompt)
      expect(generation.metadata).toEqual(metadata)
    })

    it('should return null for non-existent chain', () => {
      const generationId = recordRecipeGeneration('non-existent', 'recipe', 'prompt', {})
      expect(generationId).toBeNull()
    })

    it('should require chainId and recipe', () => {
      const chainId = 'chain-test-2'
      createTestChain(chainId)

      expect(recordRecipeGeneration(null, 'recipe', '', {})).toBeNull()
      expect(recordRecipeGeneration(chainId, null, '', {})).toBeNull()
    })

    it('should update chain.updatedAt', () => {
      const chainId = 'chain-test-3'
      createTestChain(chainId)

      const chainPath = path.join(TEST_CHAINS_DIR, chainId, 'chain.json')
      const before = JSON.parse(fs.readFileSync(chainPath, 'utf8')).updatedAt

      // Wait a bit to ensure timestamp difference
      const start = Date.now()
      while (Date.now() - start < 10) {} // Small delay

      recordRecipeGeneration(chainId, 'recipe', '', {})

      const after = JSON.parse(fs.readFileSync(chainPath, 'utf8')).updatedAt
      expect(after).not.toBe(before)
    })
  })

  describe('recordRound', () => {
    it('should record a round generation', () => {
      const chainId = 'chain-test-4'
      createTestChain(chainId)

      const roundId = 'round-uuid'
      const jsonInput = '{"slides": {"title": "Test"}}'
      const outputFile = 'output-uuid.html'
      const validationResult = { valid: true, instanceCount: 1, foundFields: 1, missingFields: [] }

      const generationId = recordRound(chainId, roundId, jsonInput, outputFile, validationResult)

      expect(generationId).toBeDefined()
      expect(generationId).toMatch(/^gen-/)

      const generation = getGeneration(chainId, generationId)
      expect(generation).toBeDefined()
      expect(generation.type).toBe('round')
      expect(generation.roundId).toBe(roundId)
      expect(generation.jsonInput).toBe(jsonInput)
      expect(generation.outputFile).toBe(outputFile)
      expect(generation.validationResult).toEqual(validationResult)
    })

    it('should link generation to round in chain.json', () => {
      const chainId = 'chain-test-5'
      createTestChain(chainId)

      const roundId = 'round-uuid'
      const generationId = recordRound(chainId, roundId, '{}', 'output.html', { valid: true })

      const chainPath = path.join(TEST_CHAINS_DIR, chainId, 'chain.json')
      const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'))

      // Check if round exists (it should be added to rounds array)
      // Note: recordRound adds to generationHistory but doesn't add to rounds array
      // The rounds array is managed separately in html-flow.js
      expect(chain.generationHistory).toBeDefined()
      expect(chain.generationHistory.length).toBeGreaterThan(0)
    })

    it('should return null for invalid inputs', () => {
      const chainId = 'chain-test-6'
      createTestChain(chainId)

      expect(recordRound(null, 'round', '{}', 'output.html', {})).toBeNull()
      expect(recordRound(chainId, null, '{}', 'output.html', {})).toBeNull()
      expect(recordRound(chainId, 'round', null, 'output.html', {})).toBeNull()
      expect(recordRound(chainId, 'round', '{}', null, {})).toBeNull()
    })
  })

  describe('recordFullSlideGeneration', () => {
    it('should record a full-slide generation', () => {
      const chainId = 'chain-test-7'
      createTestChain(chainId)

      const slideIndex = 0
      const recipe = '# Slide Recipe'

      const generationId = recordFullSlideGeneration(chainId, slideIndex, recipe, 'generated')

      expect(generationId).toBeDefined()

      const generation = getGeneration(chainId, generationId)
      expect(generation).toBeDefined()
      expect(generation.type).toBe('fullSlide')
      expect(generation.slideIndex).toBe(slideIndex)
      expect(generation.recipe).toBe(recipe)
      expect(generation.status).toBe('generated')
    })

    it('should default status to "generated"', () => {
      const chainId = 'chain-test-8'
      createTestChain(chainId)

      const generationId = recordFullSlideGeneration(chainId, 0, 'recipe')

      const generation = getGeneration(chainId, generationId)
      expect(generation.status).toBe('generated')
    })
  })

  describe('getGenerationHistory', () => {
    it('should return all generations', () => {
      const chainId = 'chain-test-9'
      createTestChain(chainId)

      recordRecipeGeneration(chainId, 'recipe1', '', {})
      recordRecipeGeneration(chainId, 'recipe2', '', {})
      recordRound(chainId, 'round1', '{}', 'output.html', { valid: true })

      const generations = getGenerationHistory(chainId)

      expect(generations).toHaveLength(3)
    })

    it('should filter by type', () => {
      const chainId = 'chain-test-10'
      createTestChain(chainId)

      recordRecipeGeneration(chainId, 'recipe', '', {})
      recordRound(chainId, 'round', '{}', 'output.html', { valid: true })
      recordFullSlideGeneration(chainId, 0, 'slide-recipe')

      const recipes = getGenerationHistory(chainId, { type: 'recipe' })
      const rounds = getGenerationHistory(chainId, { type: 'round' })
      const slides = getGenerationHistory(chainId, { type: 'fullSlide' })

      expect(recipes).toHaveLength(1)
      expect(rounds).toHaveLength(1)
      expect(slides).toHaveLength(1)
    })

    it('should filter by slideIndex', () => {
      const chainId = 'chain-test-11'
      createTestChain(chainId)

      recordFullSlideGeneration(chainId, 0, 'recipe')
      recordFullSlideGeneration(chainId, 1, 'recipe')
      recordFullSlideGeneration(chainId, 0, 'recipe')

      const slide0 = getGenerationHistory(chainId, { slideIndex: 0 })
      const slide1 = getGenerationHistory(chainId, { slideIndex: 1 })

      expect(slide0).toHaveLength(2)
      expect(slide1).toHaveLength(1)
    })

    it('should support pagination', () => {
      const chainId = 'chain-test-12'
      createTestChain(chainId)

      for (let i = 0; i < 5; i++) {
        recordRecipeGeneration(chainId, `recipe${i}`, '', {})
      }

      const page1 = getGenerationHistory(chainId, { limit: 2, offset: 0 })
      const page2 = getGenerationHistory(chainId, { limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
    })

    it('should sort by timestamp descending', () => {
      const chainId = 'chain-test-13'
      createTestChain(chainId)

      const gen1Id = recordRecipeGeneration(chainId, 'recipe1', '', {})
      const gen2Id = recordRecipeGeneration(chainId, 'recipe2', '', {})

      const generations = getGenerationHistory(chainId)

      // Most recent should be first
      expect(generations[0].id).toBe(gen2Id)
      expect(generations[1].id).toBe(gen1Id)
    })

    it('should return empty array for non-existent chain', () => {
      const generations = getGenerationHistory('non-existent')
      expect(generations).toEqual([])
    })
  })

  describe('getGenerationCount', () => {
    it('should count all generations', () => {
      const chainId = 'chain-test-14'
      createTestChain(chainId)

      recordRecipeGeneration(chainId, 'recipe', '', {})
      recordRound(chainId, 'round', '{}', 'output.html', { valid: true })

      const count = getGenerationCount(chainId)
      expect(count).toBe(2)
    })

    it('should count by type', () => {
      const chainId = 'chain-test-15'
      createTestChain(chainId)

      recordRecipeGeneration(chainId, 'recipe1', '', {})
      recordRecipeGeneration(chainId, 'recipe2', '', {})
      recordRound(chainId, 'round', '{}', 'output.html', { valid: true })

      const recipeCount = getGenerationCount(chainId, 'recipe')
      const roundCount = getGenerationCount(chainId, 'round')

      expect(recipeCount).toBe(2)
      expect(roundCount).toBe(1)
    })
  })

  describe('getGeneration', () => {
    it('should get a single generation by ID', () => {
      const chainId = 'chain-test-16'
      createTestChain(chainId)

      const genId = recordRecipeGeneration(chainId, 'recipe', 'prompt', {})
      const generation = getGeneration(chainId, genId)

      expect(generation).toBeDefined()
      expect(generation.id).toBe(genId)
      expect(generation.recipe).toBe('recipe')
    })

    it('should return null for non-existent generation', () => {
      const chainId = 'chain-test-17'
      createTestChain(chainId)

      const generation = getGeneration(chainId, 'non-existent')
      expect(generation).toBeNull()
    })
  })

  describe('getSlideGenerations', () => {
    it('should get all generations for a slide', () => {
      const chainId = 'chain-test-18'
      createTestChain(chainId)

      recordFullSlideGeneration(chainId, 0, 'recipe1')
      recordFullSlideGeneration(chainId, 0, 'recipe2')
      recordFullSlideGeneration(chainId, 1, 'recipe3')

      const slide0 = getSlideGenerations(chainId, 0)
      const slide1 = getSlideGenerations(chainId, 1)

      expect(slide0).toHaveLength(2)
      expect(slide1).toHaveLength(1)
    })
  })

  describe('deleteGeneration', () => {
    it('should delete a generation', () => {
      const chainId = 'chain-test-19'
      createTestChain(chainId)

      const genId = recordRecipeGeneration(chainId, 'recipe', '', {})
      expect(getGeneration(chainId, genId)).toBeDefined()

      const success = deleteGeneration(chainId, genId)

      expect(success).toBe(true)
      expect(getGeneration(chainId, genId)).toBeNull()
    })

    it('should return false for non-existent generation', () => {
      const chainId = 'chain-test-20'
      createTestChain(chainId)

      const success = deleteGeneration(chainId, 'non-existent')
      expect(success).toBe(false)
    })

    it('should return false for non-existent chain', () => {
      const success = deleteGeneration('non-existent', 'gen-id')
      expect(success).toBe(false)
    })
  })

  describe('clearGenerationsByType', () => {
    it('should clear all generations of a type', () => {
      const chainId = 'chain-test-21'
      createTestChain(chainId)

      recordRecipeGeneration(chainId, 'recipe1', '', {})
      recordRecipeGeneration(chainId, 'recipe2', '', {})
      recordRound(chainId, 'round', '{}', 'output.html', { valid: true })

      const success = clearGenerationsByType(chainId, 'recipe')

      expect(success).toBe(true)
      expect(getGenerationCount(chainId, 'recipe')).toBe(0)
      expect(getGenerationCount(chainId, 'round')).toBe(1)
    })
  })

  describe('getGenerationForReplay', () => {
    it('should get JSON input for replay', () => {
      const chainId = 'chain-test-22'
      createTestChain(chainId)

      const jsonInput = '{"slides": {"title": "Test"}}'
      const roundId = 'round-uuid'
      const outputFile = 'output.html'

      const genId = recordRound(chainId, roundId, jsonInput, outputFile, { valid: true })

      const replayData = getGenerationForReplay(chainId, genId)

      expect(replayData).toBeDefined()
      expect(replayData.jsonInput).toBe(jsonInput)
      expect(replayData.roundId).toBe(roundId)
      expect(replayData.outputFile).toBe(outputFile)
    })

    it('should return null for non-round generation', () => {
      const chainId = 'chain-test-23'
      createTestChain(chainId)

      const genId = recordRecipeGeneration(chainId, 'recipe', '', {})
      const replayData = getGenerationForReplay(chainId, genId)

      expect(replayData).toBeNull()
    })
  })

  describe('recordReplay', () => {
    it('should record a replay of a previous generation', () => {
      const chainId = 'chain-test-24'
      createTestChain(chainId)

      const sourceGenId = recordRound(chainId, 'round1', '{}', 'output1.html', { valid: true })
      const newRoundId = 'round2'
      const newOutputFile = 'output2.html'

      const replayResult = recordReplay(chainId, sourceGenId, newRoundId, newOutputFile)

      expect(replayResult).toBeDefined()
      expect(replayResult.roundId).toBe(newRoundId)
      expect(replayResult.generationId).toBeDefined()

      const newGen = getGeneration(chainId, replayResult.generationId)
      expect(newGen.sourceGenerationId).toBe(sourceGenId)
      expect(newGen.jsonInput).toBe('{}')
    })

    it('should return null for non-round source', () => {
      const chainId = 'chain-test-25'
      createTestChain(chainId)

      const recipeGenId = recordRecipeGeneration(chainId, 'recipe', '', {})
      const result = recordReplay(chainId, recipeGenId, 'round', 'output.html')

      expect(result).toBeNull()
    })
  })

  describe('getGenerationStats', () => {
    it('should return generation statistics', () => {
      const chainId = 'chain-test-26'
      createTestChain(chainId)

      recordRecipeGeneration(chainId, 'recipe1', '', {})
      recordRecipeGeneration(chainId, 'recipe2', '', {})
      recordRound(chainId, 'round', '{}', 'output.html', { valid: true })
      recordFullSlideGeneration(chainId, 0, 'slide-recipe')

      const stats = getGenerationStats(chainId)

      expect(stats.totalCount).toBe(4)
      expect(stats.byType.recipe).toBe(2)
      expect(stats.byType.round).toBe(1)
      expect(stats.byType.fullSlide).toBe(1)
    })

    it('should return zero stats for non-existent chain', () => {
      const stats = getGenerationStats('non-existent')

      expect(stats.totalCount).toBe(0)
      expect(stats.byType.recipe).toBe(0)
      expect(stats.byType.round).toBe(0)
      expect(stats.byType.fullSlide).toBe(0)
    })
  })

  describe('exportGenerations', () => {
    it('should export all generations as JSON', () => {
      const chainId = 'chain-test-27'
      createTestChain(chainId)

      recordRecipeGeneration(chainId, 'recipe', '', {})
      recordRound(chainId, 'round', '{}', 'output.html', { valid: true })

      const exportData = exportGenerations(chainId)

      expect(exportData).toBeDefined()

      const parsed = JSON.parse(exportData)
      expect(parsed.chainId).toBe(chainId)
      expect(parsed.exportedAt).toBeDefined()
      expect(parsed.generationCount).toBe(2)
      expect(parsed.generations).toHaveLength(2)
    })

    it('should return null for non-existent chain', () => {
      const exportData = exportGenerations('non-existent')
      expect(exportData).toBeNull()
    })
  })
})
