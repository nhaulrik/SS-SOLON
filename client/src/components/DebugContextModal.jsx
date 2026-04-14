import { useState, useMemo } from 'react'

/**
 * Debug context modal — shows a JSON snapshot of the current app state
 * so it can be copied and shared for remote debugging.
 *
 * Props:
 *   context  — the raw state object from App.jsx
 *   onClose  — dismiss callback
 */
export default function DebugContextModal({ context, onClose }) {
  const [copied, setCopied] = useState(false)

  const json = useMemo(() => {
    try {
      return JSON.stringify(context, null, 2)
    } catch {
      return '{ "error": "Could not serialise state" }'
    }
  }, [context])

  const handleCopy = () => {
    // Wrap in a markdown code block so it pastes cleanly into chat
    const payload = '```json\n' + json + '\n```'
    navigator.clipboard.writeText(payload).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const charCount = json.length

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content debug-modal" onClick={e => e.stopPropagation()}>

        <div className="debug-modal-header">
          <div>
            <h3 className="debug-modal-title">Debug Context</h3>
            <p className="debug-modal-subtitle">
              Copy and paste into chat to share your current state for debugging.
              {' '}<span style={{ opacity: 0.6 }}>({charCount.toLocaleString()} chars)</span>
            </p>
          </div>
          <button
            className={"btn btn-sm " + (copied ? 'btn-primary' : 'btn-secondary') + " debug-copy-btn"}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <pre className="debug-json">{json}</pre>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
