/**
 * Tests for Breadcrumbs component
 *
 * Verifies that all HTML flow steps are displayed with correct labels and navigation
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Breadcrumbs from './Breadcrumbs'

describe('Breadcrumbs', () => {
  const defaultProps = {
    step: 'html-upload',
    canNavigateTo: vi.fn(() => true),
    navigateTo: vi.fn(),
    flow: 'html',
  }

  describe('HTML Flow Steps', () => {
    it('displays all 4 HTML flow steps', () => {
      render(<Breadcrumbs {...defaultProps} />)

      expect(screen.getByText('Template & Zones')).toBeInTheDocument()
      expect(screen.getByText('Recipe + JSON')).toBeInTheDocument()
      expect(screen.getByText('Preview')).toBeInTheDocument()
      expect(screen.getByText('Assign Metadata')).toBeInTheDocument()
    })

    it('displays correct step numbers', () => {
      render(<Breadcrumbs {...defaultProps} />)

      const numbers = screen.getAllByText(/^[1-4]$/)
      expect(numbers).toHaveLength(4)
      expect(numbers[0]).toHaveTextContent('1')
      expect(numbers[1]).toHaveTextContent('2')
      expect(numbers[2]).toHaveTextContent('3')
      expect(numbers[3]).toHaveTextContent('4')
    })

    it('marks current step as active', () => {
      const { rerender } = render(<Breadcrumbs {...defaultProps} step="html-upload" />)

      let activeItems = screen.getAllByRole('button')
      expect(activeItems[0]).toHaveClass('active')

      rerender(<Breadcrumbs {...defaultProps} step="html-metadata" />)

      activeItems = screen.getAllByRole('button')
      expect(activeItems[3]).toHaveClass('active')
    })

    it('marks completed steps with completed class', () => {
      render(<Breadcrumbs {...defaultProps} step="html-preview" />)

      const items = screen.getAllByRole('button')
      // Steps 1, 2, 3 should be completed (indices 0, 1, 2)
      expect(items[0]).toHaveClass('completed')
      expect(items[1]).toHaveClass('completed')
      expect(items[2]).toHaveClass('completed')
      // Step 4 should be active
      expect(items[3]).toHaveClass('active')
    })

    it('allows navigation to metadata step when enabled', () => {
      const navigateTo = vi.fn()
      const canNavigateTo = vi.fn((step) => step === 'html-metadata')

      render(
        <Breadcrumbs
          {...defaultProps}
          step="html-preview"
          navigateTo={navigateTo}
          canNavigateTo={canNavigateTo}
        />
      )

      const metadataStep = screen.getByText('Assign Metadata').closest('.breadcrumb-item')
      fireEvent.click(metadataStep)

      expect(navigateTo).toHaveBeenCalledWith('html-metadata')
    })

    it('disables navigation to metadata step when not allowed', () => {
      const navigateTo = vi.fn()
      const canNavigateTo = vi.fn(() => false)

      render(
        <Breadcrumbs
          {...defaultProps}
          step="html-upload"
          navigateTo={navigateTo}
          canNavigateTo={canNavigateTo}
        />
      )

      const metadataStep = screen.getByText('Assign Metadata').closest('.breadcrumb-item')
      expect(metadataStep).not.toHaveClass('clickable')

      fireEvent.click(metadataStep)
      expect(navigateTo).not.toHaveBeenCalled()
    })

    it('keyboard navigation works for metadata step', () => {
      const navigateTo = vi.fn()
      const canNavigateTo = vi.fn(() => true)

      render(
        <Breadcrumbs
          {...defaultProps}
          step="html-preview"
          navigateTo={navigateTo}
          canNavigateTo={canNavigateTo}
        />
      )

      const metadataStep = screen.getByText('Assign Metadata').closest('.breadcrumb-item')
      fireEvent.keyDown(metadataStep, { key: 'Enter' })

      expect(navigateTo).toHaveBeenCalledWith('html-metadata')
    })

    it('displays dividers between steps', () => {
      render(<Breadcrumbs {...defaultProps} />)

      const dividers = screen.getAllByText('›')
      // 3 dividers between 4 steps
      expect(dividers).toHaveLength(3)
    })
  })

  describe('Step Progression', () => {
    it('shows correct state when on template step', () => {
      render(<Breadcrumbs {...defaultProps} step="html-upload" />)

      const items = screen.getAllByRole('button')
      expect(items[0]).toHaveClass('active')
      expect(items[1]).not.toHaveClass('completed')
      expect(items[2]).not.toHaveClass('completed')
      expect(items[3]).not.toHaveClass('completed')
    })

    it('shows correct state when on recipe step', () => {
      render(<Breadcrumbs {...defaultProps} step="html-recipe" />)

      const items = screen.getAllByRole('button')
      expect(items[0]).toHaveClass('completed')
      expect(items[1]).toHaveClass('active')
      expect(items[2]).not.toHaveClass('completed')
      expect(items[3]).not.toHaveClass('completed')
    })

    it('shows correct state when on preview step', () => {
      render(<Breadcrumbs {...defaultProps} step="html-preview" />)

      const items = screen.getAllByRole('button')
      expect(items[0]).toHaveClass('completed')
      expect(items[1]).toHaveClass('completed')
      expect(items[2]).toHaveClass('active')
      expect(items[3]).not.toHaveClass('completed')
    })

    it('shows correct state when on metadata step', () => {
      render(<Breadcrumbs {...defaultProps} step="html-metadata" />)

      const items = screen.getAllByRole('button')
      expect(items[0]).toHaveClass('completed')
      expect(items[1]).toHaveClass('completed')
      expect(items[2]).toHaveClass('completed')
      expect(items[3]).toHaveClass('active')
    })
  })

  describe('Accessibility', () => {
    it('has aria-label for each step', () => {
      render(<Breadcrumbs {...defaultProps} />)

      expect(screen.getByLabelText('Template & Zones')).toBeInTheDocument()
      expect(screen.getByLabelText('Recipe + JSON')).toBeInTheDocument()
      expect(screen.getByLabelText('Preview')).toBeInTheDocument()
      expect(screen.getByLabelText('Assign Metadata')).toBeInTheDocument()
    })

    it('marks current step with aria-current', () => {
      render(<Breadcrumbs {...defaultProps} step="html-metadata" />)

      const metadataStep = screen.getByText('Assign Metadata').closest('.breadcrumb-item')
      expect(metadataStep).toHaveAttribute('aria-current', 'step')
    })

    it('dividers have aria-hidden', () => {
      render(<Breadcrumbs {...defaultProps} />)

      const dividers = screen.getAllByText('›')
      dividers.forEach(divider => {
        expect(divider).toHaveAttribute('aria-hidden', 'true')
      })
    })
  })
})
