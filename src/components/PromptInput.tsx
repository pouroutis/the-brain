// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// PromptInput Component (Phase 2 — Step 5)
// =============================================================================

import { useState, useCallback, type FormEvent, type ChangeEvent, type KeyboardEvent } from 'react';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface PromptInputProps {
  /** Whether submission is allowed */
  canSubmit: boolean;
  /** Callback when user submits a prompt */
  onSubmit: (prompt: string) => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function PromptInput({ canSubmit, onSubmit }: PromptInputProps): JSX.Element {
  const [inputValue, setInputValue] = useState('');

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmedValue = inputValue.trim();
      if (trimmedValue && canSubmit) {
        onSubmit(trimmedValue);
        setInputValue('');
      }
    },
    [inputValue, canSubmit, onSubmit]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Enter (without Shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const trimmedValue = inputValue.trim();
        if (trimmedValue && canSubmit) {
          onSubmit(trimmedValue);
          setInputValue('');
        }
      }
    },
    [inputValue, canSubmit, onSubmit]
  );

  const isDisabled = !canSubmit;
  const isSubmitDisabled = isDisabled || !inputValue.trim();

  return (
    <form className="prompt-input" onSubmit={handleSubmit}>
      <textarea
        className="prompt-input__field"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Ask the AI board..."
        disabled={isDisabled}
        rows={1}
        title="Type your question here. Press Enter to send."
      />
      <button
        type="submit"
        className="prompt-input__submit"
        disabled={isSubmitDisabled}
        title="Send your question to all AIs"
      >
        Send
      </button>
    </form>
  );
}
