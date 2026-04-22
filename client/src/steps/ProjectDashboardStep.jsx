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

  // Flows table state
  const [filterText, setFilterText] = useState('')
  const [sortBy, setSortBy] = useState(null) // 'name' | 'template' | null
  const [sortOrder, setSortOrder] = useState('asc') // 'asc' | 'desc'

  // Helper: Get template pill class based on filename — hash-based, no hardcoded names
  const getTemplatePillClass = (templateFilename) => {
    const name = (templateFilename || 'template.html').toLowerCase()
    const palette = [
      styles.templatePillBlue,
      styles.templatePillCyan,
      styles.templatePillEmerald,
      styles.templatePillGreen,
      styles.templatePillIndigo,
      styles.templatePillOrange,
      styles.templatePillPink,
      styles.templatePillPurple,
      styles.templatePillRed,
      styles.templatePillViolet,
      styles.templatePillGray,
    ]
    let hash = 5381
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) + hash) ^ name.charCodeAt(i)
      hash |= 0
    }
    return palette[Math.abs(hash) % palette.length]
  }

  // Helper: Handle column header click for sorting
  const handleSortClick = (column) => {
    if (sortBy === column) {
      if (sortOrder === 'asc') {
        setSortOrder('desc')
      } else {
        setSortBy(null)
        setSortOrder('asc')
      }
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  // Helper: Get sort indicator for column header
  const getSortIndicator = (column) => {
    if (sortBy !== column) return null
    return sortOrder === 'asc' ? ' ↑' : ' ↓'
  }

  // Helper: Filter flows by name
  const getFilteredFlows = (flows) => {
    return flows.filter(f =>
      (f.name || f.flowId).toLowerCase().includes(filterText.toLowerCase())
    )
  }

  // Helper: Sort flows by selected column
  const getSortedFlows = (flows) => {
    const sorted = [...flows].sort((a, b) => {
      if (sortBy === 'name') {
        const aVal = (a.name || a.flowId).toLowerCase()
        const bVal = (b.name || b.flowId).toLowerCase()
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      if (sortBy === 'template') {
        const aVal = (a.templateFilename || 'template.html').toLowerCase()
        const bVal = (b.templateFilename || 'template.html').toLowerCase()
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return 0
    })
    return sorted
  }

  const loadExports = async () => {
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
              exportName:   exp.exportName || exp.exportId,
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

  useEffect(() => {
    loadExports()
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
  const filteredFlows = getFilteredFlows(flows)
  const sortedFlows = getSortedFlows(filteredFlows)

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
              <>
                <div className={styles.flowsTableFilter}>
                  <input
                    type="text"
                    className={styles.flowsFilterInput}
                    placeholder="Filter flows…"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    aria-label="Filter flows by name"
                  />
                  {filterText && (
                    <button
                      className={styles.flowsFilterClear}
                      onClick={() => setFilterText('')}
                      aria-label="Clear filter"
                    >
                      ×
                    </button>
                  )}
                  <span className={styles.flowsFilterCount}>
                    {filteredFlows.length} of {flows.length} flows
                  </span>
                </div>

                {filteredFlows.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No flows match your filter.</p>
                  </div>
                ) : (
                  <table className={styles.flowsTable}>
                    <thead>
                      <tr>
                        <th
                          className={styles.sortable}
                          onClick={() => handleSortClick('name')}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && handleSortClick('name')}
                        >
                          Flow Name{getSortIndicator('name')}
                        </th>
                        <th
                          className={styles.sortable}
                          onClick={() => handleSortClick('template')}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && handleSortClick('template')}
                        >
                          Template{getSortIndicator('template')}
                        </th>
                        <th>Zones</th>
                        <th>Created</th>
                        <th>Generations</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFlows.map((flow) => (
                        <tr key={flow.flowId} className={styles.flowTableRow}>
                          <td className={styles.flowTableName}>{flow.name || flow.flowId}</td>
                          <td className={styles.flowTableCell}>
                            <span className={`${styles.templatePill} ${getTemplatePillClass(flow.templateFilename)}`}>
                              {flow.templateFilename || 'template.html'}
                            </span>
                          </td>
                          <td className={styles.flowTableCell}>
                            {flow._metadata?.zones?.length ?? flow._metadata?.selections?.length ?? '—'}
                          </td>
                          <td className={styles.flowTableCell}>{new Date(flow.createdAt).toLocaleDateString()}</td>
                          <td className={styles.flowTableCell}>{flow.generations?.length || '—'}</td>
                          <td className={styles.flowTableActions}>
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
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
                onExportDeleted={loadExports}
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
