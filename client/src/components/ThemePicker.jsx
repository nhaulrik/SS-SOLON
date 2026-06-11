import { useState, useRef, useEffect } from 'react'
import styles from './ThemePicker.module.css'

const THEMES = [
  { id: 'default', label: 'Default', color: '#4CAF80' },
  { id: 'blue', label: 'Blue', color: '#4C9FE0' },
  { id: 'yellow', label: 'Yellow', color: '#FFB300' },
]

export default function ThemePicker({ theme, onThemeChange }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  const currentColor = THEMES.find(t => t.id === theme)?.color || THEMES[0].color

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      {open && (
        <div className={styles.popover}>
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`${styles.swatch} ${theme === t.id ? styles.active : ''}`}
              style={{ '--swatch-color': t.color }}
              onClick={() => {
                onThemeChange(t.id)
                setOpen(false)
              }}
              title={t.label}
            />
          ))}
        </div>
      )}
      <button
        className={styles.trigger}
        style={{ '--swatch-color': currentColor }}
        onClick={() => setOpen(o => !o)}
        title="Theme"
      />
    </div>
  )
}
