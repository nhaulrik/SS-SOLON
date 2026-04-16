/**
 * server/lib/generation-manager.js
 *
 * Manages generation history for HTML flow chains.
 * Persists all AI responses, recipes, and applied content for audit trail and replay.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { CHAINS_DIR, isInsideDir } from '../config.js';

/**
 * Validate a chainId and return safe chain directory path, or null.
 */
function resolveChainDir(chainId) {
  if (!chainId || typeof chainId !== 'string') return null;
  if (!/^[\w-]{1,100}$/.test(chainId)) return null;
  const chainDir = path.join(CHAINS_DIR, chainId);
  const resolved = path.resolve(CHAINS_DIR);
  const resolvedChainDir = path.resolve(chainDir);
  if (!resolvedChainDir.startsWith(resolved + path.sep) && resolvedChainDir !== resolved) return null;
  return chainDir;
}

/**
 * Load chain.json for the given chainId.
 * Returns null if not found or invalid.
 */
function loadChain(chainId) {
  const chainDir = resolveChainDir(chainId);
  if (!chainDir) return null;

  const chainPath = path.join(chainDir, 'chain.json');
  if (!fs.existsSync(chainPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(chainPath, 'utf8'));
  } catch (err) {
    console.error(`[generation-manager] Failed to load chain ${chainId}:`, err.message);
    return null;
  }
}

/**
 * Save chain.json for the given chainId.
 * Returns true on success, false on failure.
 */
function saveChain(chainId, chain) {
  const chainDir = resolveChainDir(chainId);
  if (!chainDir) return false;

  const chainPath = path.join(chainDir, 'chain.json');
  try {
    fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`[generation-manager] Failed to save chain ${chainId}:`, err.message);
    return false;
  }
}

// ── Recording Functions ──────────────────────────────────────────────────────

/**
 * Record a recipe generation in the chain's generation history.
 * Returns the generationId on success, null on failure.
 */
export function recordRecipeGeneration(chainId, recipe, globalPrompt, metadata) {
  try {
    if (!chainId || !recipe) {
      throw new Error('chainId and recipe are required');
    }

    const chain = loadChain(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    // Initialize generationHistory if it doesn't exist
    if (!chain.generationHistory) {
      chain.generationHistory = [];
    }

    const generationId = `gen-${randomUUID()}`;
    const generation = {
      id: generationId,
      type: 'recipe',
      timestamp: new Date().toISOString(),
      recipe,
      globalPrompt: globalPrompt || '',
      metadata: metadata || {},
    };

    chain.generationHistory.push(generation);
    chain.updatedAt = new Date().toISOString();

    if (!saveChain(chainId, chain)) {
      throw new Error('Failed to save chain');
    }

    return generationId;
  } catch (err) {
    console.error('[generation-manager] recordRecipeGeneration error:', err.message);
    return null;
  }
}

/**
 * Record an applied content round in the chain's generation history.
 * Returns the generationId on success, null on failure.
 */
export function recordRound(chainId, roundId, jsonInput, outputFile, validationResult) {
  try {
    if (!chainId || !roundId || !jsonInput || !outputFile) {
      throw new Error('chainId, roundId, jsonInput, and outputFile are required');
    }

    const chain = loadChain(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    // Initialize generationHistory if it doesn't exist
    if (!chain.generationHistory) {
      chain.generationHistory = [];
    }

    const generationId = `gen-${randomUUID()}`;
    const generation = {
      id: generationId,
      type: 'round',
      timestamp: new Date().toISOString(),
      roundId,
      jsonInput,
      outputFile,
      validationResult: validationResult || { valid: true },
    };

    chain.generationHistory.push(generation);

    // Update the corresponding round to link to this generation
    if (chain.rounds) {
      const round = chain.rounds.find(r => r.id === roundId);
      if (round) {
        round.generationId = generationId;
      }
    }

    chain.updatedAt = new Date().toISOString();

    if (!saveChain(chainId, chain)) {
      throw new Error('Failed to save chain');
    }

    return generationId;
  } catch (err) {
    console.error('[generation-manager] recordRound error:', err.message);
    return null;
  }
}

/**
 * Record a full-slide generation in the chain's generation history.
 * Returns the generationId on success, null on failure.
 */
export function recordFullSlideGeneration(chainId, slideIndex, recipe, status = 'generated') {
  try {
    if (chainId === undefined || slideIndex === undefined || !recipe) {
      throw new Error('chainId, slideIndex, and recipe are required');
    }

    const chain = loadChain(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    // Initialize generationHistory if it doesn't exist
    if (!chain.generationHistory) {
      chain.generationHistory = [];
    }

    const generationId = `gen-${randomUUID()}`;
    const generation = {
      id: generationId,
      type: 'fullSlide',
      timestamp: new Date().toISOString(),
      slideIndex,
      recipe,
      status,
    };

    chain.generationHistory.push(generation);
    chain.updatedAt = new Date().toISOString();

    if (!saveChain(chainId, chain)) {
      throw new Error('Failed to save chain');
    }

    return generationId;
  } catch (err) {
    console.error('[generation-manager] recordFullSlideGeneration error:', err.message);
    return null;
  }
}

// ── Retrieval Functions ──────────────────────────────────────────────────────

/**
 * Get all generations for a chain, with optional filtering.
 * Returns array of generations, or empty array on failure.
 */
export function getGenerationHistory(chainId, options = {}) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      return [];
    }

    let generations = chain.generationHistory || [];

    // Filter by type if specified
    if (options.type) {
      generations = generations.filter(g => g.type === options.type);
    }

    // Filter by slideIndex if specified
    if (options.slideIndex !== undefined) {
      generations = generations.filter(g => g.slideIndex === options.slideIndex);
    }

    // Sort by timestamp descending (newest first)
    generations = generations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    const paginated = generations.slice(offset, offset + limit);

    return paginated;
  } catch (err) {
    console.error('[generation-manager] getGenerationHistory error:', err.message);
    return [];
  }
}

/**
 * Get total count of generations for a chain.
 * Returns count, or -1 on failure.
 */
export function getGenerationCount(chainId, filterType = null) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      return 0;
    }

    let generations = chain.generationHistory || [];

    if (filterType) {
      generations = generations.filter(g => g.type === filterType);
    }

    return generations.length;
  } catch (err) {
    console.error('[generation-manager] getGenerationCount error:', err.message);
    return 0;
  }
}

/**
 * Get a single generation by ID.
 * Returns generation object, or null if not found.
 */
export function getGeneration(chainId, generationId) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      return null;
    }

    const generations = chain.generationHistory || [];
    return generations.find(g => g.id === generationId) || null;
  } catch (err) {
    console.error('[generation-manager] getGeneration error:', err.message);
    return null;
  }
}

/**
 * Get all generations for a specific slide.
 * Returns array of generations, or empty array on failure.
 */
export function getSlideGenerations(chainId, slideIndex) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      return [];
    }

    const generations = chain.generationHistory || [];
    return generations
      .filter(g => g.slideIndex === slideIndex || (g.type === 'round' && !g.slideIndex))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.error('[generation-manager] getSlideGenerations error:', err.message);
    return [];
  }
}

/**
 * Get all recipe generations (not rounds or fullSlides).
 * Returns array of recipe generations, or empty array on failure.
 */
export function getRecipeGenerations(chainId) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      return [];
    }

    const generations = chain.generationHistory || [];
    return generations
      .filter(g => g.type === 'recipe')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.error('[generation-manager] getRecipeGenerations error:', err.message);
    return [];
  }
}

/**
 * Get all round generations (applied content).
 * Returns array of round generations, or empty array on failure.
 */
export function getRoundGenerations(chainId) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      return [];
    }

    const generations = chain.generationHistory || [];
    return generations
      .filter(g => g.type === 'round')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.error('[generation-manager] getRoundGenerations error:', err.message);
    return [];
  }
}

// ── Deletion Functions ───────────────────────────────────────────────────────

/**
 * Delete a generation from the chain's history.
 * Returns true on success, false on failure.
 */
export function deleteGeneration(chainId, generationId) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      return false;
    }

    const generations = chain.generationHistory || [];
    const index = generations.findIndex(g => g.id === generationId);

    if (index === -1) {
      return false; // Generation not found
    }

    // Remove from history
    generations.splice(index, 1);
    chain.generationHistory = generations;

    // If this was a round generation, also remove the generationId link from the round
    const generation = generations[index];
    if (generation && generation.type === 'round' && generation.roundId) {
      const round = chain.rounds?.find(r => r.id === generation.roundId);
      if (round) {
        delete round.generationId;
      }
    }

    chain.updatedAt = new Date().toISOString();

    return saveChain(chainId, chain);
  } catch (err) {
    console.error('[generation-manager] deleteGeneration error:', err.message);
    return false;
  }
}

/**
 * Clear all generations of a specific type from a chain.
 * Returns true on success, false on failure.
 */
export function clearGenerationsByType(chainId, type) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      return false;
    }

    const generations = chain.generationHistory || [];
    chain.generationHistory = generations.filter(g => g.type !== type);
    chain.updatedAt = new Date().toISOString();

    return saveChain(chainId, chain);
  } catch (err) {
    console.error('[generation-manager] clearGenerationsByType error:', err.message);
    return false;
  }
}

// ── Replay Functions ─────────────────────────────────────────────────────────

/**
 * Get the JSON input from a previous round generation for replay.
 * Returns { jsonInput, roundId } or null if not found.
 */
export function getGenerationForReplay(chainId, generationId) {
  try {
    const generation = getGeneration(chainId, generationId);
    if (!generation || generation.type !== 'round') {
      return null;
    }

    return {
      jsonInput: generation.jsonInput,
      roundId: generation.roundId,
      outputFile: generation.outputFile,
    };
  } catch (err) {
    console.error('[generation-manager] getGenerationForReplay error:', err.message);
    return null;
  }
}

/**
 * Record a new replay attempt (creates a new round from previous generation).
 * Returns { roundId, generationId } on success, null on failure.
 */
export function recordReplay(chainId, sourceGenerationId, newRoundId, newOutputFile) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    const sourceGeneration = (chain.generationHistory || []).find(g => g.id === sourceGenerationId);
    if (!sourceGeneration || sourceGeneration.type !== 'round') {
      throw new Error('Source generation not found or is not a round');
    }

    // Record new round in both rounds array and generation history
    const newGeneration = {
      id: `gen-${randomUUID()}`,
      type: 'round',
      timestamp: new Date().toISOString(),
      roundId: newRoundId,
      jsonInput: sourceGeneration.jsonInput,
      outputFile: newOutputFile,
      validationResult: sourceGeneration.validationResult,
      sourceGenerationId, // Track which generation this was replayed from
    };

    if (!chain.generationHistory) {
      chain.generationHistory = [];
    }
    chain.generationHistory.push(newGeneration);

    chain.updatedAt = new Date().toISOString();

    if (!saveChain(chainId, chain)) {
      throw new Error('Failed to save chain');
    }

    return {
      roundId: newRoundId,
      generationId: newGeneration.id,
    };
  } catch (err) {
    console.error('[generation-manager] recordReplay error:', err.message);
    return null;
  }
}

// ── Utility Functions ────────────────────────────────────────────────────────

/**
 * Get statistics about generations for a chain.
 * Returns { totalCount, byType: { recipe, round, fullSlide } }
 */
export function getGenerationStats(chainId) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      return { totalCount: 0, byType: { recipe: 0, round: 0, fullSlide: 0 } };
    }

    const generations = chain.generationHistory || [];
    const stats = {
      totalCount: generations.length,
      byType: {
        recipe: 0,
        round: 0,
        fullSlide: 0,
      },
    };

    for (const gen of generations) {
      if (gen.type === 'recipe') stats.byType.recipe++;
      else if (gen.type === 'round') stats.byType.round++;
      else if (gen.type === 'fullSlide') stats.byType.fullSlide++;
    }

    return stats;
  } catch (err) {
    console.error('[generation-manager] getGenerationStats error:', err.message);
    return { totalCount: 0, byType: { recipe: 0, round: 0, fullSlide: 0 } };
  }
}

/**
 * Export all generations for a chain as JSON.
 * Useful for backup or audit purposes.
 * Returns JSON string, or null on failure.
 */
export function exportGenerations(chainId) {
  try {
    const chain = loadChain(chainId);
    if (!chain) {
      return null;
    }

    const export_data = {
      chainId,
      exportedAt: new Date().toISOString(),
      chainCreatedAt: chain.createdAt,
      generationCount: (chain.generationHistory || []).length,
      generations: chain.generationHistory || [],
    };

    return JSON.stringify(export_data, null, 2);
  } catch (err) {
    console.error('[generation-manager] exportGenerations error:', err.message);
    return null;
  }
}
