import { useState, useEffect, useRef } from 'react'
import styles from './ProjectLandingStep.module.css'

const TYPE_META = {
  shared: {
    label: 'Shared',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5"  cy="6"  r="2" />
        <circle cx="11" cy="6"  r="2" />
        <circle cx="8"  cy="12" r="2" />
        <line x1="6.8"  y1="7.2"  x2="7.2"  y2="10.8" />
        <line x1="9.2"  y1="7.2"  x2="8.8"  y2="10.8" />
      </svg>
    ),
    description: 'Tracked in git — collaborate with your team',
  },
  private: {
    label: 'Private',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="8" width="10" height="6" rx="1.5" />
        <path d="M5 8V5.5a3 3 0 0 1 6 0V8" />
      </svg>
    ),
    description: 'Private to this machine — not synced to git',
  },
}

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || TYPE_META.shared
  return (
    <span className={`${styles.typeBadge} ${styles[`typeBadge_${type}`]}`}>
      {meta.icon}
      {meta.label}
    </span>
  )
}

function ProjectCard({ project, onOpen, onDelete, onConvert }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const otherType = project.type === 'private' ? 'shared' : 'private'
  const otherLabel = TYPE_META[otherType].label

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div
      className={`${styles.projectCard} ${styles[`projectCard_${project.type}`]}`}
      onClick={() => onOpen(project.name)}
    >
      <div className={styles.projectCardHeader}>
        <div className={styles.projectCardTitle}>
          <h3 className={styles.projectName}>{project.name}</h3>
          <TypeBadge type={project.type} />
        </div>
        <div className={styles.projectCardActions} onClick={e => e.stopPropagation()}>
          <div className={styles.menuWrapper} ref={menuRef}>
            <button
              className={styles.menuButton}
              onClick={() => setMenuOpen(v => !v)}
              title="Project options"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.3" />
                <circle cx="8" cy="8" r="1.3" />
                <circle cx="8" cy="13" r="1.3" />
              </svg>
            </button>
            {menuOpen && (
              <div className={styles.menu}>
                <button
                  className={styles.menuItem}
                  onClick={() => { setMenuOpen(false); onConvert(project.name, otherType) }}
                >
                  {TYPE_META[otherType].icon}
                  Convert to {otherLabel}
                </button>
                <div className={styles.menuDivider} />
                <button
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  onClick={() => { setMenuOpen(false); onDelete(project.name) }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2,4 14,4" /><path d="M5 4V2h6v2" />
                    <path d="M3 4l1 10h8l1-10" />
                  </svg>
                  Delete project
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={styles.projectFooter}>
        <span className={styles.openHint}>Open →</span>
      </div>
    </div>
  )
}

function Section({ title, icon, projects, onOpen, onDelete, onConvert, emptyText }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon}>{icon}</span>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={styles.sectionCount}>{projects.length}</span>
      </div>
      {projects.length === 0 ? (
        <p className={styles.sectionEmpty}>{emptyText}</p>
      ) : (
        <div className={styles.projectsGrid}>
          {projects.map(project => (
            <ProjectCard
              key={project.name}
              project={project}
              onOpen={onOpen}
              onDelete={onDelete}
              onConvert={onConvert}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProjectLandingStep({ appName = 'Slide Studio', onProjectSelected, setToast }) {
  const [projects,  setProjects]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [newName,   setNewName]   = useState('')
  const [newType,   setNewType]   = useState('shared')
  const [creating,  setCreating]  = useState(false)

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

  const handleCreate = async (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: newType }),
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

  const handleDelete = async (projectName) => {
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

  const handleConvert = async (projectName, targetType) => {
    try {
      const res = await fetch(`/api/projects/${projectName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: targetType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to convert project')
      setProjects(prev => prev.map(p => p.name === projectName ? { ...p, type: targetType } : p))
      const label = TYPE_META[targetType].label
      const gitNote = data.gitChanged
        ? ' Files removed from git index — commit to complete the transition.'
        : targetType === 'shared'
          ? ' Files are now untracked — stage and commit to add them to git.'
          : ''
      setToast?.({ type: 'success', message: `"${projectName}" converted to ${label}.${gitNote}` })
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

  const sharedProjects = projects.filter(p => (p.type || 'shared') === 'shared')
  const privateProjects  = projects.filter(p => p.type === 'private')
  const hasProjects    = projects.length > 0

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{appName}</h1>
        <p className={styles.subtitle}>
          {hasProjects ? 'Pick up where you left off, or create a new project' : 'Create a project to get started'}
        </p>

        <form className={styles.createForm} onSubmit={handleCreate}>
          <input
            className={styles.createInput}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Project name…"
            disabled={creating}
            maxLength={100}
          />
          <div className={styles.typeToggle}>
            {['shared', 'private'].map(t => (
              <button
                key={t}
                type="button"
                className={`${styles.typeOption} ${newType === t ? styles.typeOptionActive : ''} ${styles[`typeOption_${t}`]}`}
                onClick={() => setNewType(t)}
                disabled={creating}
                title={TYPE_META[t].description}
              >
                {TYPE_META[t].icon}
                {TYPE_META[t].label}
              </button>
            ))}
          </div>
          <button
            className={styles.createButton}
            type="submit"
            disabled={!newName.trim() || creating}
          >
            {creating ? 'Creating…' : '+ New Project'}
          </button>
        </form>

        <p className={styles.typeHint}>{TYPE_META[newType].description}</p>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <p>{error}</p>
        </div>
      )}

      <div className={styles.content}>
        {!hasProjects ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📋</div>
            <h2>No projects yet</h2>
            <p>Name your project above, choose a type, and hit "+ New Project".</p>
          </div>
        ) : (
          <div className={styles.sections}>
            <Section
              title="Shared Projects"
              icon={TYPE_META.shared.icon}
              projects={sharedProjects}
              onOpen={onProjectSelected}
              onDelete={handleDelete}
              onConvert={handleConvert}
              emptyText="No shared projects yet — shared projects are tracked in git and visible to your whole team."
            />
            <Section
              title="Private Projects"
              icon={TYPE_META.private.icon}
              projects={privateProjects}
              onOpen={onProjectSelected}
              onDelete={handleDelete}
              onConvert={handleConvert}
              emptyText="No private projects yet — private projects stay on this machine and are excluded from git."
            />
          </div>
        )}
      </div>
    </div>
  )
}
