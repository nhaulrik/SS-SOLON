import { useState, useEffect, useRef } from 'react'
import styles from './ProjectLandingStep.module.css'

/**
 * ProjectLandingStep
 *
 * Entry screen. Lists existing projects or prompts the user to create one.
 * Projects are created here by name; flows are created from the project dashboard.
 */
export default function ProjectLandingStep({ onProjectSelected, setToast }) {
  const [projects,    setProjects]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [newName,     setNewName]     = useState('')
  const [creating,    setCreating]    = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/projects')
        if (!res.ok) throw new Error('Failed to load projects')
        const data = await res.json()
        setProjects(data.projects || [])
      } catch (err) {
        setError(err.message)
        setProjects([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleCreateProject = async (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create project')
      setNewName('')
      onProjectSelected(name)
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteProject = async (projectName) => {
    if (!confirm(`Delete project "${projectName}" and all its flows? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/projects/${projectName}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete project')
      setProjects(prev => prev.filter(p => p.name !== projectName))
      setToast?.({ type: 'success', message: `Project "${projectName}" deleted.` })
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingSpinner}>
          <div className={styles.spinner}></div>
          <p>Loading projects…</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>SOLON Slide Studio</h1>
        <p className={styles.subtitle}>
          {projects.length === 0
            ? 'Create a project to get started'
            : 'Pick up where you left off, or create a new project'}
        </p>
        <form className={styles.newProjectForm} onSubmit={handleCreateProject}>
          <input
            ref={inputRef}
            className={styles.newProjectInput}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Project name…"
            disabled={creating}
            maxLength={100}
          />
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={!newName.trim() || creating}
          >
            {creating ? 'Creating…' : '+ New Project'}
          </button>
        </form>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <p>{error}</p>
        </div>
      )}

      <div className={styles.content}>
        {projects.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📋</div>
            <h2>No projects yet</h2>
            <p>Enter a project name above and click "+ New Project" to get started.</p>
          </div>
        ) : (
          <div className={styles.projectsContainer}>
            <div className={styles.projectsHeader}>
              <h2>Recent Projects</h2>
            </div>
            <div className={styles.projectsList}>
              {projects.map((project) => (
                <div
                  key={project.name}
                  className={styles.projectCard}
                  onClick={() => onProjectSelected(project.name)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.projectCardHeader}>
                    <h3 className={styles.projectName}>{project.name}</h3>
                    <button
                      className={styles.projectStatus}
                      onClick={e => { e.stopPropagation(); handleDeleteProject(project.name) }}
                      title="Delete project"
                      style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--color-danger, #e53e3e)' }}
                    >
                      ✕
                    </button>
                  </div>
                  <div className={styles.projectFooter}>
                    <span className={styles.timestamp}>Open →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
