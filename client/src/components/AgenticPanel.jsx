/**
 * AgenticPanel.jsx
 *
 * Two-phase agentic generation with user confirmation between phases.
 *
 * State machine:
 *   idle → planning → confirming → running → done
 *                  ↘ error       ↗ cancel→idle  ↘ error
 *
 * /agentic/plan  — regular JSON, runs orchestrator, returns proposed plan
 * /agentic/run   — SSE stream, runs parallel agents given the accepted plan
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import css from './AgenticPanel.module.css'

// ── SSE reader ─────────────────────────────────────────────────────────────────

async function* readSSE(response) {
  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const blocks = buffer.split('\n\n')
    buffer = blocks.pop()

    for (const block of blocks) {
      if (!block.trim()) continue
      let eventType = 'message'
      let eventData = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim()
        if (line.startsWith('data: '))  eventData += (eventData ? '\n' : '') + line.slice(6)
      }
      if (eventData !== '') yield { type: eventType, data: eventData }
    }
  }
}

// ── Phase config ───────────────────────────────────────────────────────────────

const PHASES = [
  { id: 'analyzing',  label: 'Analysing'  },
  { id: 'planning',   label: 'Planning'   },
  { id: 'generating', label: 'Generating' },
  { id: 'assembling', label: 'Assembling' },
]

function phaseIndex(id) {
  return PHASES.findIndex(p => p.id === id)
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AgenticPanel({
  projectName,
  recipe,
  zones,
  repeatableSlides,
  onJsonReady,
  // State props
  status,
  phase,
  logs,
  agents,
  errorMsg,
  elapsed,
  summaryMode,
  summaryPrompt,
  contentPrompt,
  plan,
  // Setters
  setStatus,
  setPhase,
  setLogs,
  setAgents,
  setErrorMsg,
  setElapsed,
  setSummaryMode,
  setSummaryPrompt,
  setContentPrompt,
  setPlan,
}) {
  // status: idle | planning | confirming | running | done | error
  // Plan returned by /agentic/plan, held during confirming state
  // { instances, contextSummary, rationale, agentPlan, contextFiles }

  const logEndRef = useRef(null)
  const timerRef  = useRef(null)
  const abortRef  = useRef(null)

  const hasRecipe = Boolean(recipe?.trim())
  const isActive  = status === 'planning' || status === 'running'

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [logs])

  // Elapsed timer — only ticks during the generation phase
  useEffect(() => {
    if (status === 'running') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [status])

  const appendLog    = (msg) => setLogs(prev => [...prev, msg])
  const updateAgent  = (id, state) =>
    setAgents(prev => prev.map(a => a.id === id ? { ...a, state } : a))

  // ── Phase 1: call /plan, pause for confirmation ────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!hasRecipe || isActive) return

    setStatus('planning')
    setPhase('analyzing')
    setPlan(null)
    setLogs([])
    setAgents([])
    setErrorMsg('')
    setElapsed(0)

    try {
      const response = await fetch('/api/opencode/agentic/plan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectName, recipe, zones, repeatableSlides, summaryMode, summaryPrompt, contentPrompt }),
      })
      if (!response.ok) throw new Error(`Server error ${response.status}`)

      for await (const { type, data } of readSSE(response)) {
        switch (type) {
          case 'phase': setPhase(data); break
          case 'log':   appendLog(data); break
          case 'plan':
            setPlan(JSON.parse(data))
            setStatus('confirming')
            break
          case 'error':
            setStatus('error')
            setErrorMsg(data)
            break
        }
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }, [hasRecipe, isActive, projectName, recipe, zones, repeatableSlides, summaryMode, summaryPrompt, contentPrompt, setStatus, setPhase, setLogs, setAgents, setErrorMsg, setElapsed, setPlan])

  // ── Phase 2: user accepted — call /run SSE stream ─────────────────────────

  const handleAccept = useCallback(async () => {
    if (!plan) return

    setStatus('running')
    setPhase('generating')
    setLogs([])
    setAgents([])
    setElapsed(0)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/opencode/agentic/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          projectName,
          recipe,
          zones,
          repeatableSlides,
          instances:      plan.instances,
          instanceNames:  plan.instanceNames,
          contextSummary: plan.contextSummary,
          contentPrompt,
        }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error(`Server error ${response.status}`)

      for await (const { type, data } of readSSE(response)) {
        switch (type) {
          case 'phase':        setPhase(data); break
          case 'log':          appendLog(data); break
          case 'agents':       setAgents(JSON.parse(data)); break
          case 'agent_update': { const u = JSON.parse(data); updateAgent(u.id, u.state); break }
          case 'done':         setStatus('done'); onJsonReady?.(data); break
          case 'error':        setStatus('error'); setErrorMsg(data); break
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatus('error')
        setErrorMsg(err.message)
      }
    }
  }, [plan, projectName, recipe, zones, repeatableSlides, onJsonReady, setStatus, setPhase, setLogs, setAgents, setErrorMsg, setElapsed])

  const handleCancel = () => {
    abortRef.current?.abort()
    setStatus('idle')
    setPhase('')
    setPlan(null)
    setLogs([])
    setAgents([])
    setErrorMsg('')
    setElapsed(0)
  }

  const currentPhaseIdx = phaseIndex(phase)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <section className={css.panel}>
      <div className={css.header}>
        <h3 className={css.title}>
          Agentic Generation
          <span className={css.titleBadge}>Beta</span>
        </h3>
      </div>

      <p className={css.description}>
        Let AI generate the JSON response automatically. The AI reads your context files,
        decides how many instances to create, then runs parallel agents — one per slide instance.
        The result is pasted directly into the JSON Response field above.
      </p>

      {/* ── Context source toggle ────────────────────────────────────────── */}
      <div className={css.summaryToggle}>
        <span className={css.summaryToggleLabel}>Context source</span>
        <div className={css.summaryToggleBtns}>
          <button
            className={`${css.summaryBtn} ${summaryMode === 'use' ? css.summaryBtnActive : ''}`}
            onClick={() => setSummaryMode('use')}
            disabled={isActive || status === 'confirming'}
            title="Use saved .summary.md files where available; fall back to originals otherwise"
          >
            Use summaries
          </button>
          <button
            className={`${css.summaryBtn} ${summaryMode === 'regenerate' ? css.summaryBtnActive : ''}`}
            onClick={() => setSummaryMode('regenerate')}
            disabled={isActive || status === 'confirming'}
            title="Generate and save a new .summary.md for each context file, then use them"
          >
            Regenerate summaries
          </button>
        </div>
        <span className={css.summaryToggleHint}>
          {summaryMode === 'use'
            ? 'Uses saved summaries if found, otherwise reads originals'
            : 'AI will summarise each file and save it — slower, but updates your summaries'}
        </span>
      </div>

      {/* ── Summary instructions ─────────────────────────────────────────── */}
      <div className={css.promptSection}>
        <label htmlFor="summaryPrompt" className={css.promptLabel}>
          Summary instructions
          <span className={css.promptHint}>Guides how context files are summarised</span>
        </label>
        <textarea
          id="summaryPrompt"
          className={css.promptTextarea}
          value={summaryPrompt}
          onChange={(e) => setSummaryPrompt(e.target.value)}
          disabled={isActive || status === 'confirming'}
          placeholder="e.g. Focus on pricing tiers, product names, and key metrics"
        />
      </div>

      {/* ── Content instructions ─────────────────────────────────────────── */}
      <div className={css.promptSection}>
        <label htmlFor="contentPrompt" className={css.promptLabel}>
          Content instructions
          <span className={css.promptHint}>Guides what slide content the AI generates</span>
        </label>
        <textarea
          id="contentPrompt"
          className={css.promptTextarea}
          value={contentPrompt}
          onChange={(e) => setContentPrompt(e.target.value)}
          disabled={isActive || status === 'confirming'}
          placeholder="e.g. Generate 3 product slides focusing on the enterprise tier"
        />
      </div>

      {/* ── Trigger row ─────────────────────────────────────────────────── */}
      <div className={css.triggerRow}>
        <button
          className={`${css.generateBtn} ${isActive ? css.running : ''}`}
          onClick={isActive ? undefined : handleGenerate}
          disabled={!hasRecipe || isActive || status === 'confirming'}
        >
          {status === 'planning'  ? 'Analysing…'     :
           status === 'running'   ? 'Generating…'    :
                                    '✦ Generate with AI'}
        </button>

        {status === 'running' && <span className={css.timer}>{elapsed}s</span>}

        {!hasRecipe && status === 'idle' && (
          <span className={css.noRecipeHint}>Generate the recipe first ↑</span>
        )}
      </div>

      {/* ── Phase stepper ───────────────────────────────────────────────── */}
      {(status === 'planning' || status === 'confirming' || status === 'running' || status === 'done') && (
        <div className={css.stepper}>
          {PHASES.map((p, i) => {
            const isDone   = (status === 'confirming' && i <= 1)
                          || (currentPhaseIdx > i && status !== 'confirming')
                          || status === 'done'
            const isActive = currentPhaseIdx === i && (status === 'planning' || status === 'running')
            return (
              <div key={p.id} className={css.stepItem}>
                <div className={`${css.stepDot} ${isDone ? css.done : ''} ${isActive ? css.active : ''}`}>
                  {isDone ? '✓' : i + 1}
                </div>
                <span className={`${css.stepLabel} ${isDone ? css.done : ''} ${isActive ? css.active : ''}`}>
                  {p.label}
                </span>
                {i < PHASES.length - 1 && (
                  <div className={`${css.stepConnector} ${isDone ? css.done : ''}`} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Confirmation card ────────────────────────────────────────────── */}
      {status === 'confirming' && plan && (
        <div className={css.confirmCard}>
          <div className={css.confirmHeader}>
            <span className={css.confirmIcon}>◎</span>
            <span className={css.confirmTitle}>Ready to generate</span>
          </div>

          {plan.rationale && (
            <p className={css.confirmRationale}>{plan.rationale}</p>
          )}

          <ul className={css.confirmList}>
            {plan.agentPlan.map(a => (
              <li key={a.id} className={css.confirmItem}>
                <span className={css.confirmDot} />
                {a.id === 'blocks' ? a.label : <strong>{a.label}</strong>}
              </li>
            ))}
          </ul>

          <p className={css.confirmCount}>
            {plan.agentPlan.length} agent{plan.agentPlan.length !== 1 ? 's' : ''} will run in parallel
            {plan.contextFiles > 0 && ` · ${plan.contextFiles} context file${plan.contextFiles !== 1 ? 's' : ''} loaded`}
          </p>

          <div className={css.confirmActions}>
            <button className={css.acceptBtn} onClick={handleAccept}>
              Accept &amp; Generate
            </button>
            <button className={css.cancelBtn} onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Agent chips ──────────────────────────────────────────────────── */}
      {agents.length > 0 && (
        <div className={css.chipsSection}>
          <div className={css.chipsLabel}>Agents</div>
          <div className={css.chips}>
            {agents.map(agent => (
              <div key={agent.id} className={`${css.chip} ${css[agent.state]}`}>
                {agent.state === 'running' && <div className={css.chipSpinner} />}
                {agent.state === 'done'    && '✓ '}
                {agent.state === 'error'   && '✕ '}
                {agent.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Activity log ─────────────────────────────────────────────────── */}
      {logs.length > 0 && (
        <div className={css.logSection}>
          <div className={css.logLabel}>Activity</div>
          <div className={css.log}>
            {logs.map((line, i) => (
              <span key={i} className={`${css.logLine} ${i === logs.length - 1 ? css.latest : ''}`}>
                {line}{'\n'}
              </span>
            ))}
            <span ref={logEndRef} />
          </div>
        </div>
      )}

      {/* ── Success banner ───────────────────────────────────────────────── */}
      {status === 'done' && (
        <div className={css.successBanner}>
          <span>✓</span>
          <span>JSON generated and pasted into the Response field. Review and apply when ready.</span>
        </div>
      )}

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {status === 'error' && (
        <div className={css.errorBanner}>
          <strong>Generation failed</strong>
          {errorMsg}
          <div>
            <button className={css.resetBtn} onClick={handleCancel}>Try again</button>
          </div>
        </div>
      )}
    </section>
  )
}
