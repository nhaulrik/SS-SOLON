/**
 * Tests for client/src/components/MetadataForm.jsx
 *
 * Covers form rendering, input changes, and error display.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MetadataForm from '../MetadataForm'

describe('MetadataForm', () => {
  const defaultSlide = {
    slideId: 'slide-1',
    name: 'Introduction',
    type: 'title',
  }

  it('renders form with slide data', () => {
    const onChange = vi.fn()

    render(
      <MetadataForm
        slide={defaultSlide}
        slideNumber={1}
        onChange={onChange}
        errors={{}}
      />
    )

    expect(screen.getByDisplayValue('slide-1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Introduction')).toBeInTheDocument()
    expect(screen.getByDisplayValue('title')).toBeInTheDocument()
  })

  it('calls onChange when slideId is edited', () => {
    const onChange = vi.fn()

    render(
      <MetadataForm
        slide={defaultSlide}
        slideNumber={1}
        onChange={onChange}
        errors={{}}
      />
    )

    const slideIdInput = screen.getByDisplayValue('slide-1')
    fireEvent.change(slideIdInput, { target: { value: 'new-slide-id' } })

    expect(onChange).toHaveBeenCalledWith('slideId', 'new-slide-id')
  })

  it('calls onChange when name is edited', () => {
    const onChange = vi.fn()

    render(
      <MetadataForm
        slide={defaultSlide}
        slideNumber={1}
        onChange={onChange}
        errors={{}}
      />
    )

    const nameInput = screen.getByDisplayValue('Introduction')
    fireEvent.change(nameInput, { target: { value: 'New Name' } })

    expect(onChange).toHaveBeenCalledWith('name', 'New Name')
  })

  it('calls onChange when type is changed', () => {
    const onChange = vi.fn()

    render(
      <MetadataForm
        slide={defaultSlide}
        slideNumber={1}
        onChange={onChange}
        errors={{}}
      />
    )

    const typeSelect = screen.getByDisplayValue('title')
    fireEvent.change(typeSelect, { target: { value: 'content' } })

    expect(onChange).toHaveBeenCalledWith('type', 'content')
  })

  it('displays slideId error when provided', () => {
    const onChange = vi.fn()
    const errors = { slideId: 'Invalid slide ID' }

    render(
      <MetadataForm
        slide={defaultSlide}
        slideNumber={1}
        onChange={onChange}
        errors={errors}
      />
    )

    expect(screen.getByText('Invalid slide ID')).toBeInTheDocument()
  })

  it('displays name error when provided', () => {
    const onChange = vi.fn()
    const errors = { name: 'Name is too long' }

    render(
      <MetadataForm
        slide={defaultSlide}
        slideNumber={1}
        onChange={onChange}
        errors={errors}
      />
    )

    expect(screen.getByText('Name is too long')).toBeInTheDocument()
  })

  it('displays type error when provided', () => {
    const onChange = vi.fn()
    const errors = { type: 'Invalid type selected' }

    render(
      <MetadataForm
        slide={defaultSlide}
        slideNumber={1}
        onChange={onChange}
        errors={errors}
      />
    )

    expect(screen.getByText('Invalid type selected')).toBeInTheDocument()
  })

  it('applies error class to input with error', () => {
    const onChange = vi.fn()
    const errors = { slideId: 'Error message' }

    render(
      <MetadataForm
        slide={defaultSlide}
        slideNumber={1}
        onChange={onChange}
        errors={errors}
      />
    )

    const slideIdInput = screen.getByDisplayValue('slide-1')
    expect(slideIdInput).toHaveClass('input-error')
  })

  it('includes all slide type options', () => {
    const onChange = vi.fn()

    render(
      <MetadataForm
        slide={defaultSlide}
        slideNumber={1}
        onChange={onChange}
        errors={{}}
      />
    )

    const typeSelect = screen.getByDisplayValue('title')
    const options = typeSelect.querySelectorAll('option')

    const optionValues = Array.from(options).map(opt => opt.value)
    expect(optionValues).toContain('content')
    expect(optionValues).toContain('title')
    expect(optionValues).toContain('conclusion')
    expect(optionValues).toContain('other')
  })

  it('generates unique IDs for form fields based on slideNumber', () => {
    const onChange = vi.fn()

    render(
      <MetadataForm
        slide={defaultSlide}
        slideNumber={5}
        onChange={onChange}
        errors={{}}
      />
    )

    expect(screen.getByLabelText('Slide ID')).toHaveAttribute('id', 'slideId-5')
    expect(screen.getByLabelText('Slide Name')).toHaveAttribute('id', 'name-5')
    expect(screen.getByLabelText('Slide Type')).toHaveAttribute('id', 'type-5')
  })

  it('displays helper text for each field', () => {
    const onChange = vi.fn()

    render(
      <MetadataForm
        slide={defaultSlide}
        slideNumber={1}
        onChange={onChange}
        errors={{}}
      />
    )

    expect(screen.getByText(/Unique identifier for this slide/)).toBeInTheDocument()
    expect(screen.getByText(/Display name for this slide/)).toBeInTheDocument()
    expect(screen.getByText(/Categorize this slide for better organization/)).toBeInTheDocument()
  })
})
