/**
 * Tests for client/src/components/MetadataAssignmentDialog.jsx
 *
 * Covers multi-step form, navigation, validation, and summary view.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MetadataAssignmentDialog from '../MetadataAssignmentDialog'

describe('MetadataAssignmentDialog', () => {
  const defaultMetadata = [
    { slideId: 'slide-1', name: 'Slide 1', type: 'title' },
    { slideId: 'slide-2', name: 'Slide 2', type: 'content' },
    { slideId: 'slide-3', name: 'Slide 3', type: 'conclusion' },
  ]

  it('renders first slide form on initial load', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={3}
        defaultMetadata={defaultMetadata}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    expect(screen.getByText('Assign Metadata')).toBeInTheDocument()
    expect(screen.getByText('Slide 1 of 3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('slide-1')).toBeInTheDocument()
  })

  it('generates default metadata if not provided', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={2}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    expect(screen.getByDisplayValue('slide-1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Slide 1')).toBeInTheDocument()
  })

  it('navigates to next slide when Next button clicked', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={3}
        defaultMetadata={defaultMetadata}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    const nextButton = screen.getByText('Next')
    fireEvent.click(nextButton)

    await waitFor(() => {
      expect(screen.getByText('Slide 2 of 3')).toBeInTheDocument()
      expect(screen.getByDisplayValue('slide-2')).toBeInTheDocument()
    })
  })

  it('navigates to previous slide when Previous button clicked', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={3}
        defaultMetadata={defaultMetadata}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    // Go to slide 2
    const nextButton = screen.getByText('Next')
    fireEvent.click(nextButton)

    await waitFor(() => {
      expect(screen.getByText('Slide 2 of 3')).toBeInTheDocument()
    })

    // Go back to slide 1
    const prevButton = screen.getByText('Previous')
    fireEvent.click(prevButton)

    await waitFor(() => {
      expect(screen.getByText('Slide 1 of 3')).toBeInTheDocument()
      expect(screen.getByDisplayValue('slide-1')).toBeInTheDocument()
    })
  })

  it('disables Previous button on first slide', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={3}
        defaultMetadata={defaultMetadata}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    const prevButton = screen.getByText('Previous')
    expect(prevButton).toBeDisabled()
  })

  it('shows Review button on last slide', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={2}
        defaultMetadata={[
          { slideId: 'slide-1', name: 'Slide 1', type: 'title' },
          { slideId: 'slide-2', name: 'Slide 2', type: 'content' },
        ]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    // Go to last slide
    const nextButton = screen.getByText('Next')
    fireEvent.click(nextButton)

    await waitFor(() => {
      expect(screen.getByText('Review')).toBeInTheDocument()
    })
  })

  it('shows summary view when Review is clicked', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={2}
        defaultMetadata={[
          { slideId: 'slide-1', name: 'Slide 1', type: 'title' },
          { slideId: 'slide-2', name: 'Slide 2', type: 'content' },
        ]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    // Navigate to last slide
    const nextButton = screen.getByText('Next')
    fireEvent.click(nextButton)

    // Click Review
    await waitFor(() => {
      const reviewButton = screen.getByText('Review')
      fireEvent.click(reviewButton)
    })

    // Should show summary
    await waitFor(() => {
      expect(screen.getByText('Review Metadata')).toBeInTheDocument()
      expect(screen.getByText('Slide 1')).toBeInTheDocument()
      expect(screen.getByText('Slide 2')).toBeInTheDocument()
    })
  })

  it('displays metadata summary for all slides', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={3}
        defaultMetadata={defaultMetadata}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    // Navigate through all slides to reach summary
    const nextButton = screen.getByText('Next')
    fireEvent.click(nextButton)
    await waitFor(() => screen.getByText('Slide 2 of 3'))

    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => screen.getByText('Slide 3 of 3'))

    fireEvent.click(screen.getByText('Review'))

    // Check summary shows all slides
    await waitFor(() => {
      expect(screen.getAllByText(/Slide \d+/).length).toBeGreaterThan(0)
    })
  })

  it('allows editing from summary view', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={2}
        defaultMetadata={[
          { slideId: 'slide-1', name: 'Slide 1', type: 'title' },
          { slideId: 'slide-2', name: 'Slide 2', type: 'content' },
        ]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    // Go to review
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => screen.getByText('Review'))
    fireEvent.click(screen.getByText('Review'))

    // Click Edit button
    await waitFor(() => {
      const editButtons = screen.getAllByText('Edit')
      fireEvent.click(editButtons[1]) // Edit Slide 2
    })

    // Should be back in edit mode for slide 2
    await waitFor(() => {
      expect(screen.getByText('Slide 2 of 2')).toBeInTheDocument()
    })
  })

  it('validates metadata before showing summary', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={2}
        defaultMetadata={[
          { slideId: '', name: 'Slide 1', type: 'title' }, // Invalid: empty slideId
          { slideId: 'slide-2', name: 'Slide 2', type: 'content' },
        ]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    const nextButton = screen.getByText('Next')
    fireEvent.click(nextButton)

    // Should show error and not advance
    await waitFor(() => {
      expect(screen.getByText('Slide ID is required')).toBeInTheDocument()
      expect(screen.getByText('Slide 1 of 2')).toBeInTheDocument()
    })
  })

  it('calls onConfirm with metadata when Save is clicked from summary', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={2}
        defaultMetadata={[
          { slideId: 'slide-1', name: 'Slide 1', type: 'title' },
          { slideId: 'slide-2', name: 'Slide 2', type: 'content' },
        ]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    // Navigate to summary
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => screen.getByText('Review'))
    fireEvent.click(screen.getByText('Review'))

    // Click Save
    await waitFor(() => {
      const saveButton = screen.getByText('Save with Metadata')
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ slideId: 'slide-1', name: 'Slide 1', type: 'title' }),
          expect.objectContaining({ slideId: 'slide-2', name: 'Slide 2', type: 'content' }),
        ])
      )
    })
  })

  it('calls onCancel when Cancel button clicked', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={2}
        defaultMetadata={defaultMetadata.slice(0, 2)}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)

    expect(onCancel).toHaveBeenCalled()
  })

  it('displays progress bar showing current position', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    const { container } = render(
      <MetadataAssignmentDialog
        slideCount={3}
        defaultMetadata={defaultMetadata}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    const progressFill = container.querySelector('.progress-fill')
    expect(progressFill).toBeInTheDocument()
    // First slide: 1/3 = 33.33%
    expect(progressFill).toHaveStyle({ width: '33.33333333333333%' })
  })

  it('clears errors when user navigates slides', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <MetadataAssignmentDialog
        slideCount={2}
        defaultMetadata={[
          { slideId: '', name: 'Slide 1', type: 'title' },
          { slideId: 'slide-2', name: 'Slide 2', type: 'content' },
        ]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    // Trigger error
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByText('Slide ID is required')).toBeInTheDocument())

    // Fix the error
    const slideIdInput = screen.getByDisplayValue('')
    fireEvent.change(slideIdInput, { target: { value: 'slide-1' } })

    // Errors should be cleared
    await waitFor(() => {
      expect(screen.queryByText('Slide ID is required')).not.toBeInTheDocument()
    })
  })
})
