import { useState, useEffect } from 'react'
import styles from './ProjectDashboardStep.module.css'

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
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/projects/${projectName}`)
        if (!res.ok) throw new Error('Failed to load project')
        const data = await res.json()
        setProject(data.project)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectName])

  const handleDeleteFlow = async (flowId) => {
    if (!confirm(`Delete flow "${flowId}"? This cannot be undone.`)) return
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

      {/* Flows */}
      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Flows</h2>
            <button className={styles.primaryButton} onClick={onNewFlow}>
              + New Flow
            </button>
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
                    <h3 className={styles.flowName}>{flow.flowId}</h3>
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
                      onClick={() => handleDeleteFlow(flow.flowId)}
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
      </div>
    </div>
  )
}
