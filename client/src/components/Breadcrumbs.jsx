/**
 * Step-progress breadcrumb bar for the HTML Visual Flow.
 *
 * Steps: Template & Zones → Recipe + JSON → Preview → Assign Metadata
 *
 * Props:
 *   step          — current step string (e.g. 'html-upload', 'html-recipe')
 *   canNavigateTo — (stepName: string) => boolean
 *   navigateTo    — (stepName: string) => void
 *   flow          — always 'html' (default: 'html')
 */

const FLOW_STEPS = {
  html: ['html-upload', 'html-recipe', 'html-preview', 'html-metadata'],
}

const FLOW_LABELS = {
  html: {
    'html-upload':  'Template & Zones',
    'html-recipe':  'Recipe + JSON',
    'html-preview': 'Preview',
    'html-metadata': 'Assign Metadata',
  },
}

export default function Breadcrumbs({ step, canNavigateTo, navigateTo, flow = 'html' }) {
  const steps   = FLOW_STEPS[flow]  ?? FLOW_STEPS.html
  const labels  = FLOW_LABELS[flow] ?? FLOW_LABELS.html
  const currIdx = steps.indexOf(step)

  return (
    <div className="breadcrumbs">
      {steps.map((s, idx) => {
        const isActive    = step === s
        const isCompleted = currIdx > idx
        const canNav      = canNavigateTo(s)

        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              className={`breadcrumb-item${isActive ? ' active' : isCompleted ? ' completed' : ''}${canNav ? ' clickable' : ''}`}
              onClick={() => canNav && navigateTo(s)}
              role={canNav ? 'button' : undefined}
              aria-current={isActive ? 'step' : undefined}
              aria-label={labels[s]}
              tabIndex={canNav ? 0 : undefined}
              onKeyDown={e => e.key === 'Enter' && canNav && navigateTo(s)}
            >
              <span className="breadcrumb-number">{idx + 1}</span>
              <span>{labels[s]}</span>
            </div>
            {idx < steps.length - 1 && <span className="breadcrumb-divider" aria-hidden="true">›</span>}
          </div>
        )
      })}
    </div>
  )
}
