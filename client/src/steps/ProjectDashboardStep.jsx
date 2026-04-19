import { useState, useEffect, useRef } from 'react'
import styles from './ProjectDashboardStep.module.css'
import SlideEditor from '../components/SlideEditor'

/**
 * ProjectDashboardStep
 *
 * Shows all flows for a project and lets the user open one or delete it.
 * Projects have no separate template management — each flow carries its own
 * template.html. New flows are created through the html-upload step.
 */
export default function ProjectDashboardStep({
  projectName,
  onFlowSelected,
  onNewFlow,
  onBackToProjects,
  setToast,
}) {
  const [project,        setProject]        = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [newFlowName,    setNewFlowName]    = useState('')
  const [flowNameError,  setFlowNameError]  = useState(false)
  const flowNameInputRef = useRef(null)

  // Tab state
  const [activeTab, setActiveTab] = useState('flows')

  // Publish section state
  const [exports,         setExports]         = useState([])
  const [selectedExports, setSelectedExports] = useState(new Set())
  const [publishes,       setPublishes]       = useState([])
  const [publishLoading,  setPublishLoading]  = useState(false)
  const [exportsLoading,  setExportsLoading]  = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/projects/${projectName}`)
        if (!res.ok) throw new Error('Failed to load project')
        const data = await res.json()
        setProject(data.project)

        // Fetch exports for all flows in parallel
        const flows = data.project?.flows || []
        setExportsLoading(true)
        const [exportsResults, publishesRes] = await Promise.all([
          Promise.all(
            flows.map(async (flow) => {
              try {
                const r = await fetch(`/api/projects/${projectName}/flows/${flow.flowId}/exports`)
                if (!r.ok) return []
                const d = await r.json()
                const list = d.exports || d || []
                return list.map((exp, idx) => ({
                  flowId:       flow.flowId,
                  flowName:     flow.name || flow.flowId,
                  exportId:     exp.exportId,
                  exportNumber: exp.exportNumber ?? idx + 1,
                  slideCount:   exp.slideCount ?? exp.slides?.length ?? 0,
                  createdAt:    exp.createdAt,
                }))
              } catch {
                return []
              }
            })
          ),
          fetch(`/api/projects/${projectName}/publishes`),
        ])
        setExports(exportsResults.flat())
        setExportsLoading(false)

        if (publishesRes.ok) {
          const pd = await publishesRes.json()
          setPublishes(pd.publishes || pd || [])
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectName])

  const fetchPublishes = async () => {
    try {
      const res = await fetch(`/api/projects/${projectName}/publishes`)
      if (!res.ok) return
      const pd = await res.json()
      setPublishes(pd.publishes || pd || [])
    } catch {
      // silently ignore
    }
  }

  const handlePublish = async () => {
    if (selectedExports.size === 0 || publishLoading) return
    setPublishLoading(true)
    try {
      const selections = [...selectedExports].map(key => {
        const [flowId, exportId] = key.split('::')
        return { flowId, exportId }
      })
      const res = await fetch(`/api/projects/${projectName}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || errData.message || 'Publish failed')
      }
      setToast?.({ type: 'success', message: 'Published successfully!' })
      setSelectedExports(new Set())
      await fetchPublishes()
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    } finally {
      setPublishLoading(false)
    }
  }

  const toggleExport = (key) => {
    setSelectedExports(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedExports.size === exports.length) {
      setSelectedExports(new Set())
    } else {
      setSelectedExports(new Set(exports.map(e => `${e.flowId}::${e.exportId}`)))
    }
  }

  const handleDeleteFlow = async (flowId, flowDisplayName) => {
    if (!confirm(`Delete flow "${flowDisplayName}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/projects/${projectName}/flows/${flowId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete flow')
      setProject(prev => ({ ...prev, flows: prev.flows.filter(f => f.flowId !== flowId) }))
      setToast?.({ type: 'success', message: `Flow "${flowId}" deleted.` })
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingSpinner}>
          <div className={styles.spinner}></div>
          <p>Loading project…</p>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <h2>Error Loading Project</h2>
          <p>{error || 'Project not found'}</p>
          <button className={styles.primaryButton} onClick={onBackToProjects}>
            Back to Projects
          </button>
        </div>
      </div>
    )
  }

  const flows = project.flows || []

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <button className={styles.backButton} onClick={onBackToProjects} aria-label="Back to projects">
            ← Back
          </button>
          <h1 className={styles.projectTitle}>{project.name}</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab}${activeTab === 'flows' ? ` ${styles.active}` : ''}`}
          onClick={() => setActiveTab('flows')}
        >
          Flows
        </button>
        <button
          className={`${styles.tab}${activeTab === 'editor' ? ` ${styles.active}` : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          Editor
        </button>
        <button
          className={`${styles.tab}${activeTab === 'publish' ? ` ${styles.active}` : ''}`}
          onClick={() => setActiveTab('publish')}
        >
          Publish
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === 'flows' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Flows</h2>
            <form
              className={styles.newFlowForm}
              onSubmit={e => {
                e.preventDefault()
                if (!newFlowName.trim()) {
                  setFlowNameError(true)
                  flowNameInputRef.current?.focus()
                  setTimeout(() => setFlowNameError(false), 600)
                  return
                }
                onNewFlow(newFlowName.trim())
                setNewFlowName('')
              }}
            >
              <input
                ref={flowNameInputRef}
                className={`${styles.newFlowInput}${flowNameError ? ` ${styles.newFlowInputError}` : ''}`}
                type="text"
                value={newFlowName}
                onChange={e => { setNewFlowName(e.target.value); setFlowNameError(false) }}
                placeholder="Flow name…"
                maxLength={80}
              />
              <button className={styles.primaryButton} type="submit">
                + New Flow
              </button>
            </form>
          </div>

          {flows.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No flows yet. Go back and create a new flow.</p>
            </div>
          ) : (
            <div className={styles.flowsGrid}>
              {flows.map((flow) => (
                <div key={flow.flowId} className={styles.flowCard}>
                  <div className={styles.flowCardHeader}>
                    <h3 className={styles.flowName}>{flow.name || flow.flowId}</h3>
                    <span className={styles.flowStatus}>{flow.status}</span>
                  </div>

                  <div className={styles.flowMeta}>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Template:</span>
                      <span className={styles.metaValue}>{flow.templateFilename || 'template.html'}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Zones:</span>
                      <span className={styles.metaValue}>
                        {flow._metadata?.zones?.length ?? flow._metadata?.selections?.length ?? '—'}
                      </span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Created:</span>
                      <span className={styles.metaValue}>{new Date(flow.createdAt).toLocaleDateString()}</span>
                    </div>
                    {flow.generations?.length > 0 && (
                      <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Generations:</span>
                        <span className={styles.metaValue}>{flow.generations.length}</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.templateActions}>
                    <button
                      className={styles.flowOpenButton}
                      onClick={() => onFlowSelected(flow.flowId)}
                    >
                      Open Flow
                    </button>
                    <button
                      className={styles.actionButton}
                      onClick={() => handleDeleteFlow(flow.flowId, flow.name || flow.flowId)}
                      style={{ color: 'var(--color-danger, #e53e3e)' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        )}

        {activeTab === 'editor' && (
          exportsLoading
            ? (
              <div className={styles.loadingSpinner}>
                <div className={styles.spinner}></div>
                <p>Loading exports…</p>
              </div>
            )
            : (
              <SlideEditor
                projectName={projectName}
                initialExports={exports}
                setToast={setToast}
              />
            )
        )}

        {activeTab === 'publish' && (
        <section className={`${styles.section} ${styles.publishSection}`}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Publish</h2>
              <p className={styles.publishSubtitle}>Package exports into a standalone web app</p>
            </div>
            <button
              className={styles.publishButton}
              disabled={selectedExports.size === 0 || publishLoading}
              onClick={handlePublish}
            >
              {publishLoading ? 'Publishing…' : 'Publish Selected'}
            </button>
          </div>

          {exportsLoading ? (
            <div className={styles.exportsEmpty}><p>Loading exports…</p></div>
          ) : exports.length === 0 ? (
            <div className={styles.exportsEmpty}><p>No exports available. Generate slides in a flow first.</p></div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                <button className={styles.selectAllLink} onClick={toggleSelectAll}>
                  {selectedExports.size === exports.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className={styles.exportPickerList}>
                {exports.map((exp) => {
                  const key = `${exp.flowId}::${exp.exportId}`
                  const checked = selectedExports.has(key)
                  return (
                    <label
                      key={key}
                      className={`${styles.exportPickerRow}${checked ? ` ${styles.selected}` : ''}`}
                    >
                      <input
                        type="checkbox"
                        className={styles.exportCheckbox}
                        checked={checked}
                        onChange={() => toggleExport(key)}
                      />
                      <span className={styles.exportFlowName}>{exp.flowName}</span>
                      <div className={styles.exportMeta}>
                        <span>Export #{exp.exportNumber}</span>
                        <span className={styles.exportSlideBadge}>{exp.slideCount} slides</span>
                        <span>{exp.createdAt ? new Date(exp.createdAt).toLocaleDateString() : '—'}</span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Published versions list */}
          <div className={styles.publishedList}>
            <p className={styles.publishedListHeader}>Published Versions</p>
            {publishes.length === 0 ? (
              <div className={styles.exportsEmpty}><p>No published versions yet.</p></div>
            ) : (
              publishes.map((pub) => (
                <div key={pub.publishId} className={styles.publishCard}>
                  <div className={styles.publishCardRow}>
                    <span className={styles.publishId}>{pub.publishId}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className={styles.publishDate}>
                        {pub.createdAt ? new Date(pub.createdAt).toLocaleString() : '—'}
                      </span>
                      <a
                        className={styles.openButton}
                        href={`/published/${projectName}/${pub.publishId}/index.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open
                      </a>
                    </div>
                  </div>
                  <div className={styles.publishStats}>
                    <span>{pub.totalSlides ?? pub.slideCount ?? '—'} slides</span>
                  </div>
                  {pub.flows && pub.flows.length > 0 && (
                    <p className={styles.publishFlows}>
                      Flows: {pub.flows.map(f => f.flowName || f.flowId).join(', ')}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
        )}

      </div>
    </div>
  )
}
