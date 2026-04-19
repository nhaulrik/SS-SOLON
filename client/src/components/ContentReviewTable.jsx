import React from 'react'
import css from './ContentReviewTable.module.css'

/**
 * Read-only review panel showing the verbatim context slice the orchestrator
 * identified for each slide instance. Lets the user verify the right rows
 * were found before approving generation.
 *
 * Props:
 *   contextSlices: { blocks?: string, "0": string, "1": string, ... }
 *   instanceNames: string[]
 */
export default function ContentReviewTable({ contextSlices = {}, instanceNames = [] }) {
  const blocksSlice    = contextSlices['blocks']
  const instanceKeys   = Object.keys(contextSlices).filter(k => k !== 'blocks').sort((a, b) => Number(a) - Number(b))

  if (!blocksSlice && instanceKeys.length === 0) return null

  const PREVIEW_CHARS = 500

  function SliceCard({ title, slice, accent }) {
    const preview  = slice?.trim() || ''
    const clipped  = preview.length > PREVIEW_CHARS
    const displayed = clipped ? preview.slice(0, PREVIEW_CHARS) : preview
    return (
      <div className={`${css.sliceCard} ${accent ? css.sliceCardAccent : ''}`}>
        <div className={css.sliceHeader}>{title}</div>
        {preview ? (
          <>
            <pre className={css.sliceContent}>{displayed}</pre>
            {clipped && (
              <div className={css.sliceMore}>… {preview.length - PREVIEW_CHARS} more chars</div>
            )}
          </>
        ) : (
          <div className={css.sliceEmpty}>No data found</div>
        )}
      </div>
    )
  }

  return (
    <div className={css.wrapper}>
      <div className={css.infoBar}>
        {blocksSlice && (
          <span className={css.infoStat}>📋 Shared context</span>
        )}
        {instanceKeys.length > 0 && (
          <span className={css.infoStat}>✓ {instanceKeys.length} slide instance{instanceKeys.length !== 1 ? 's' : ''} identified</span>
        )}
        <span className={css.infoBarWarning}>Review that the right rows were found for each slide before generating</span>
      </div>

      <div className={css.sliceList}>
        {blocksSlice !== undefined && (
          <SliceCard title="Shared / Block Zones" slice={blocksSlice} accent />
        )}
        {instanceKeys.map((key, i) => (
          <SliceCard
            key={key}
            title={instanceNames[i] || `Instance ${i + 1}`}
            slice={contextSlices[key]}
          />
        ))}
      </div>
    </div>
  )
}
