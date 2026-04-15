import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HtmlRecipeStep from './HtmlRecipeStep.jsx';

describe('HtmlRecipeStep - Recipe Prompt Preservation', () => {
  const mockProject = {
    chainId: 'chain-123',
    projectName: 'test-project',
    zones: [{ key: 'title', prompt: 'title text' }],
    selections: [],
  };

  const mockProps = {
    project: mockProject,
    step: 'html-recipe',
    canNavigateTo: vi.fn(() => true),
    navigateTo: vi.fn(),
    onBack: vi.fn(),
    onApplied: vi.fn(),
    onRecipeChange: vi.fn(),
    setToast: vi.fn(),
    debugContext: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should preserve the global prompt when navigating away and back', async () => {
    const { rerender } = render(<HtmlRecipeStep {...mockProps} />);
    
    // User types a global prompt
    const globalPromptInput = screen.getByPlaceholderText(/global guidance/i);
    fireEvent.change(globalPromptInput, { target: { value: 'Make it all Danish' } });
    
    expect(globalPromptInput.value).toBe('Make it all Danish');
    
    // Navigate away (simulate unmounting)
    rerender(<HtmlRecipeStep {...mockProps} step="html-preview" />);
    
    // Navigate back (remount with same props but with preserved state)
    // The global prompt should be passed via props and restored
    const updatedProps = {
      ...mockProps,
      globalPrompt: 'Make it all Danish', // This should be passed from App state
    };
    
    rerender(<HtmlRecipeStep {...updatedProps} />);
    
    const restoredInput = screen.getByPlaceholderText(/global guidance/i);
    expect(restoredInput.value).toBe('Make it all Danish');
  });

  it('should preserve the JSON response when navigating away and back', async () => {
    const mockJsonResponse = JSON.stringify({
      slides: {
        slide_1: {
          instances: [{ title: 'Test Title' }],
        },
      },
    });

    const { rerender } = render(<HtmlRecipeStep {...mockProps} />);
    
    // User pastes JSON response
    const jsonInput = screen.getByPlaceholderText(/Paste the AI response JSON/i);
    fireEvent.change(jsonInput, { target: { value: mockJsonResponse } });
    
    expect(jsonInput.value).toBe(mockJsonResponse);
    
    // Navigate away
    rerender(<HtmlRecipeStep {...mockProps} step="html-preview" />);
    
    // Navigate back with preserved JSON
    const updatedProps = {
      ...mockProps,
      jsonInput: mockJsonResponse, // This should be passed from App state
    };
    
    rerender(<HtmlRecipeStep {...updatedProps} />);
    
    const restoredInput = screen.getByPlaceholderText(/Paste the AI response JSON/i);
    expect(restoredInput.value).toBe(mockJsonResponse);
  });

  it('should preserve the generated recipe when navigating away and back', async () => {
    const mockRecipe = 'INSTRUCTIONS:\n- Return ONLY valid JSON\n\nGENERATE THE FOLLOWING DATA:\n\n1. BLOCK ZONES...';
    
    const updatedProps = {
      ...mockProps,
      recipe: mockRecipe, // This should be passed from App state
    };

    const { rerender } = render(<HtmlRecipeStep {...updatedProps} />);
    
    // Recipe should be visible
    expect(screen.getByText(/INSTRUCTIONS:/)).toBeInTheDocument();
    
    // Navigate away
    rerender(<HtmlRecipeStep {...mockProps} step="html-preview" />);
    
    // Navigate back with preserved recipe
    rerender(<HtmlRecipeStep {...updatedProps} />);
    
    // Recipe should still be visible
    expect(screen.getByText(/INSTRUCTIONS:/)).toBeInTheDocument();
  });
});
