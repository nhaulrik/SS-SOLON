import { useState, useEffect, useRef } from 'react'
import styles from './ProjectDashboardStep.module.css'
import SlideEditor from '../components/SlideEditor'
import PresentationStructureManager from '../components/publish/PresentationStructureManager'
import PresentationsTab from '../components/PresentationsTab'

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
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const flowNameInputRef = useRef(null)

  // Tab state
  const [activeTab, setActiveTab] = useState('flows')

  // Editor tab state
  const [exports,         setExports]         = useState([])
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
        const exportsResults = await Promise.all(
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
        )
        setExports(exportsResults.flat())
        setExportsLoading(false)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectName])

  const handleDeleteFlow = async (flowId) => {
    try {
      const res = await fetch(`/api/projects/${projectName}/flows/${flowId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete flow')
      setProject(prev => ({ ...prev, flows: prev.flows.filter(f => f.flowId !== flowId) }))
      setToast?.({ type: 'success', message: `Flow "${flowId}" deleted.` })
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    } finally {
      setConfirmDeleteId(null)
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
         <button
           className={`${styles.tab}${activeTab === 'presentations' ? ` ${styles.active}` : ''}`}
           onClick={() => setActiveTab('presentations')}
         >
           Presentations
         </button>
       </div>

      <div className={styles.content}>
        {activeTab === 'flows' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={`${styles.sectionTitle} ${styles.srOnly}`}>Flows</h2>
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
              <label htmlFor="new-flow-name" className={styles.srOnly}>Flow name</label>
              <input
                id="new-flow-name"
                ref={flowNameInputRef}
                className={`${styles.newFlowInput}${flowNameError ? ` ${styles.newFlowInputError}` : ''}`}
                type="text"
                value={newFlowName}
                onChange={e => { setNewFlowName(e.target.value); setFlowNameError(false) }}
                placeholder="Flow name…"
                maxLength={80}
                aria-invalid={flowNameError || undefined}
                aria-describedby={flowNameError ? 'flow-name-error' : undefined}
              />
              {flowNameError && (
                <span id="flow-name-error" role="alert" className={styles.srOnly}>Flow name is required</span>
              )}
              <button className={styles.primaryButton} type="submit">
                + New Flow
              </button>
            </form>
          </div>

          {flows.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No flows yet. Enter a name above to create your first flow.</p>
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
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Generations:</span>
                      <span className={styles.metaValue}>{flow.generations?.length || '—'}</span>
                    </div>
                  </div>

                  <div className={styles.templateActions}>
                    <button
                      className={styles.flowOpenButton}
                      onClick={() => onFlowSelected(flow.flowId)}
                      aria-label={`Open flow ${flow.name || flow.flowId}`}
                    >
                      Open Flow
                    </button>
                    {confirmDeleteId === flow.flowId ? (
                      <>
                        <button
                          className={styles.confirmDeleteButton}
                          onClick={() => handleDeleteFlow(flow.flowId)}
                          aria-label={`Confirm delete flow ${flow.name || flow.flowId}`}
                        >
                          Delete
                        </button>
                        <button
                          className={styles.actionButton}
                          onClick={() => setConfirmDeleteId(null)}
                          aria-label="Cancel delete"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className={styles.deleteButton}
                        onClick={() => setConfirmDeleteId(flow.flowId)}
                        aria-label={`Delete flow ${flow.name || flow.flowId}`}
                      >
                        Delete
                      </button>
                    )}
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
          <div className={styles.publishSectionFull}>
            <PresentationStructureManager projectName={projectName} setToast={setToast} />
          </div>
        )}

        {activeTab === 'presentations' && (
          <PresentationsTab projectName={projectName} setToast={setToast} />
        )}

      </div>
    </div>
  )
}
