import { useEffect } from 'react'

/**
 * Transient notification that auto-dismisses after 3 seconds.
 * Replaces all alert() calls throughout the application.
 *
 * Usage: setToast({ message: 'Copied!', type: 'success' })
 * Types: 'success' | 'error' | 'info'
 */
export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(onDismiss, 3000)
    return () => clearTimeout(id)
  }, [toast, onDismiss])

  if (!toast) return null

  return (
    <div className={`toast toast--${toast.type || 'info'}`} role="status" aria-live="polite">
      {toast.message}
      <button className="toast__close" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  )
}
