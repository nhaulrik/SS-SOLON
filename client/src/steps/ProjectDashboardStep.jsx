import { useState, useEffect, useRef } from 'react'
import styles from './ProjectDashboardStep.module.css'
import SlideEditor from '../components/SlideEditor'
import PresentationStructureManager from '../components/publish/PresentationStructureManager'
import PresentationsTab from '../components/PresentationsTab'

function TemplatePreview({ projectName, flowId }) {
  const [html, setHtml] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/html-flow/load-flow?projectName=${encodeURIComponent(projectName)}&flowId=${encodeURIComponent(flowId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data?.previewHtml) setHtml(data.previewHtml) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [projectName, flowId])

  return (
    <div className={styles.templatePreviewCard}>
      <div className={styles.templatePreviewFrame}>
        {html ? (
          <iframe
            className={styles.templatePreviewIframe}
            srcDoc={html}
            sandbox="allow-same-origin"
            title="Template preview"
          />
        ) : (
          <div className={styles.templatePreviewSkeleton} />
        )}
      </div>
    </div>
  )
}

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

  const [activeTab, setActiveTab] = useState('flows')

  const [exports,         setExports]         = useState([])
  const [exportsLoading,  setExportsLoading]  = useState(false)

  const [filterText,     setFilterText]     = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const [groupMenuFlowId, setGroupMenuFlowId] = useState(null)
  const [newGroupInput,  setNewGroupInput]  = useState('')

  const getFilteredFlows = (flows) =>
    flows.filter(f =>
      (f.name || f.flowId).toLowerCase().includes(filterText.toLowerCase())
    )

  const getGroupedFlows = (flows) => {
    const groups = new Map()
    flows.forEach(flow => {
      const key = flow._metadata?.group || flow.templateFilename || 'template.html'
      const isCustom = !!flow._metadata?.group
      if (!groups.has(key)) groups.set(key, { key, isCustom, flows: [] })
      groups.get(key).flows.push(flow)
    })
    return Array.from(groups.values()).sort((a, b) => {
      if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1
      return a.key.localeCompare(b.key)
    })
  }

  const getAllCustomGroups = (flows) => {
    const names = new Set()
    flows.forEach(f => { if (f._metadata?.group) names.add(f._metadata.group) })
    return Array.from(names).sort()
  }

  const toggleGroup = (key) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const assignFlowToGroup = async (flowId, groupName) => {
    const flow = (project?.flows || []).find(f => f.flowId === flowId)
    if (!flow) return
    const { group: _removed, ...restMeta } = flow._metadata || {}
    const newMetadata = groupName ? { ...restMeta, group: groupName } : restMeta
    try {
      const res = await fetch(`/api/projects/${projectName}/flows/${flowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _metadata: newMetadata }),
      })
      if (!res.ok) throw new Error('Failed to update flow')
      setProject(prev => ({
        ...prev,
        flows: prev.flows.map(f =>
          f.flowId === flowId ? { ...f, _metadata: newMetadata } : f
        ),
      }))
      setToast?.({ type: 'success', message: groupName ? `Moved to "${groupName}"` : 'Removed from custom group' })
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    } finally {
      setGroupMenuFlowId(null)
      setNewGroupInput('')
    }
  }

  const loadExports = async () => {
    try {
      const res = await fetch(`/api/projects/${projectName}`)
      if (!res.ok) throw new Error('Failed to load project')
      const data = await res.json()
      setProject(data.project)

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

  useEffect(() => { loadExports() }, [projectName])

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
  const groupedFlows = getGroupedFlows(filteredFlows)
  const customGroups = getAllCustomGroups(flows)

  return (
    <div className={styles.container}>
      {/* Overlay to close group menu when clicking outside */}
      {groupMenuFlowId && (
        <div
          className={styles.groupMenuOverlay}
          onClick={() => { setGroupMenuFlowId(null); setNewGroupInput('') }}
        />
      )}

      <div className={styles.header}>
        <div className={styles.headerTop}>
          <button className={styles.backButton} onClick={onBackToProjects} aria-label="Back to projects">
            ← Back
          </button>
          <h1 className={styles.projectTitle}>{project.name}</h1>
        </div>
      </div>

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
              <h2 className={styles.srOnly}>Flows</h2>
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
                  <div className={styles.flowGroupsContainer}>
                    {groupedFlows.map(group => (
                      <div key={group.key} className={styles.flowGroup}>
                        <button
                          className={styles.groupHeader}
                          onClick={() => toggleGroup(group.key)}
                          aria-expanded={!collapsedGroups.has(group.key)}
                        >
                          <span className={styles.groupChevron}>
                            {collapsedGroups.has(group.key) ? '▶' : '▼'}
                          </span>
                          <span className={styles.groupName}>{group.key}</span>
                          {group.isCustom && (
                            <span className={styles.customGroupBadge}>custom</span>
                          )}
                          <span className={styles.groupDivider} aria-hidden="true" />
                          <span className={styles.groupCount}>
                            {group.flows.length} flow{group.flows.length !== 1 ? 's' : ''}
                          </span>
                        </button>

                        {!collapsedGroups.has(group.key) && (
                          <div className={styles.flowGroupContent}>
                            <TemplatePreview
                              projectName={projectName}
                              flowId={group.flows[0].flowId}
                            />
                            <div className={styles.flowCardGrid}>
                            {group.flows.map(flow => (
                              <div key={flow.flowId} className={styles.flowCard}>
                                <div className={styles.flowCardHeader}>
                                  <div className={styles.groupMenuWrapper}>
                                    <button
                                      className={styles.groupMenuButton}
                                      onClick={() => {
                                        setGroupMenuFlowId(groupMenuFlowId === flow.flowId ? null : flow.flowId)
                                        setNewGroupInput('')
                                      }}
                                      aria-label="Group options"
                                      title="Move to group"
                                    >
                                      •••
                                    </button>
                                    {groupMenuFlowId === flow.flowId && (
                                      <div className={styles.groupMenu}>
                                        {customGroups.length > 0 && (
                                          <>
                                            <div className={styles.groupMenuLabel}>Move to group</div>
                                            {customGroups.map(g => (
                                              <button
                                                key={g}
                                                className={`${styles.groupMenuItem}${flow._metadata?.group === g ? ` ${styles.groupMenuItemActive}` : ''}`}
                                                onClick={() => assignFlowToGroup(flow.flowId, g)}
                                              >
                                                {g}
                                              </button>
                                            ))}
                                            <div className={styles.groupMenuDivider} />
                                          </>
                                        )}
                                        <div className={styles.groupMenuLabel}>
                                          {customGroups.length > 0 ? 'New group' : 'Move to new group'}
                                        </div>
                                        <form
                                          className={styles.groupMenuInputRow}
                                          onSubmit={e => {
                                            e.preventDefault()
                                            if (newGroupInput.trim()) {
                                              assignFlowToGroup(flow.flowId, newGroupInput.trim())
                                            }
                                          }}
                                        >
                                          <input
                                            className={styles.groupMenuInput}
                                            value={newGroupInput}
                                            onChange={e => setNewGroupInput(e.target.value)}
                                            placeholder="Group name…"
                                            autoFocus
                                          />
                                          <button type="submit" className={styles.groupMenuSubmit} aria-label="Create group">+</button>
                                        </form>
                                        {flow._metadata?.group && (
                                          <>
                                            <div className={styles.groupMenuDivider} />
                                            <button
                                              className={styles.groupMenuRemove}
                                              onClick={() => assignFlowToGroup(flow.flowId, null)}
                                            >
                                              Remove from group
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className={styles.flowCardName}>{flow.name || flow.flowId}</div>

                                <div className={styles.flowCardStats}>
                                  <span>{new Date(flow.createdAt).toLocaleDateString()}</span>
                                </div>

                                <div className={styles.flowCardActions}>
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
                                        Confirm
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
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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
          <div className={styles.presentationsSectionFull}>
            <PresentationsTab projectName={projectName} setToast={setToast} />
          </div>
        )}
      </div>
    </div>
  )
}
