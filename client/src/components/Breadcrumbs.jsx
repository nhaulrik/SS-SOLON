const STEPS = ['upload', 'tag', 'recipe', 'preview']
const STEP_LABELS = {
  upload: 'Upload',
  tag: 'Tag Elements',
  recipe: 'Recipe + JSON',
  preview: 'Preview'
}

/**
 * Step-progress breadcrumb bar.
 * Must live at module scope (not inside App) to avoid being recreated on every render.
 */
export default function Breadcrumbs({ step, canNavigateTo, navigateTo }) {
  const currIdx = STEPS.indexOf(step)

  return (
    <div className="breadcrumbs">
      {STEPS.map((s, idx) => {
        const isActive    = step === s
        const isCompleted = currIdx > idx
        const canNav      = canNavigateTo(s)

        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              className={`breadcrumb-item ${isActive ? 'active' : isCompleted ? 'completed' : ''} ${canNav ? 'clickable' : ''}`}
              onClick={() => canNav && navigateTo(s)}
            >
              <span className="breadcrumb-number">{idx + 1}</span>
              <span>{STEP_LABELS[s]}</span>
            </div>
            {idx < STEPS.length - 1 && <span className="breadcrumb-divider">›</span>}
          </div>
        )
      })}
    </div>
  )
}
