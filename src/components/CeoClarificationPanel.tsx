// =============================================================================
// The Brain — CEO Clarification Panel (Decision Mode Only)
// Collapsible panel for CEO-only clarification when CEO outputs BLOCKED
// =============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ClarificationState, DecisionMemo } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface CeoClarificationPanelProps {
  clarificationState: ClarificationState | null;
  onSendMessage: (content: string) => void;
  onCancel: () => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function CeoClarificationPanel({
  clarificationState,
  onSendMessage,
  onCancel,
}: CeoClarificationPanelProps): JSX.Element {
  const [inputValue, setInputValue] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-expand when clarification becomes active
  useEffect(() => {
    if (clarificationState?.isActive) {
      setIsCollapsed(false);
    }
  }, [clarificationState?.isActive]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && clarificationState?.messages.length) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [clarificationState?.messages.length]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || clarificationState?.isProcessing) return;
      onSendMessage(inputValue.trim());
      setInputValue('');
    },
    [inputValue, clarificationState?.isProcessing, onSendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  // Render nothing if no clarification state or resolved
  const isActive = clarificationState?.isActive ?? false;
  const hasMemo = clarificationState?.decisionMemo !== null;

  // Show panel if active or has decision memo to display
  if (!isActive && !hasMemo) {
    return (
      <div className="ceo-clarification-panel ceo-clarification-panel--inactive">
        <button
          className="ceo-clarification-panel__toggle"
          onClick={toggleCollapsed}
          disabled
        >
          Clarify with CEO only
        </button>
      </div>
    );
  }

  return (
    <div
      className={`ceo-clarification-panel ${isActive ? 'ceo-clarification-panel--active' : ''} ${isCollapsed ? 'ceo-clarification-panel--collapsed' : ''}`}
      data-testid="ceo-clarification-panel"
    >
      {/* Header with toggle */}
      <div className="ceo-clarification-panel__header">
        <button
          className="ceo-clarification-panel__toggle"
          onClick={toggleCollapsed}
        >
          {isCollapsed ? '+ ' : '- '}
          Clarify with CEO only
          {isActive && <span className="ceo-clarification-panel__active-badge">ACTIVE</span>}
        </button>
        {isActive && (
          <button
            className="ceo-clarification-panel__cancel"
            onClick={onCancel}
            title="Cancel clarification"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Content (hidden when collapsed) */}
      {!isCollapsed && (
        <div className="ceo-clarification-panel__content">
          {/* BLOCKED Questions */}
          {clarificationState?.blockedQuestions && clarificationState.blockedQuestions.length > 0 && (
            <div className="ceo-clarification-panel__questions">
              <div className="ceo-clarification-panel__questions-label">CEO Questions:</div>
              <ul>
                {clarificationState.blockedQuestions.map((q, idx) => (
                  <li key={idx}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Messages */}
          <div className="ceo-clarification-panel__messages">
            {clarificationState?.messages.map((msg) => (
              <div
                key={msg.id}
                className={`ceo-clarification-panel__message ceo-clarification-panel__message--${msg.role}`}
              >
                <span className="ceo-clarification-panel__message-role">
                  {msg.role === 'user' ? 'You' : 'CEO'}:
                </span>
                <span className="ceo-clarification-panel__message-content">
                  {msg.content}
                </span>
              </div>
            ))}
            {clarificationState?.isProcessing && (
              <div className="ceo-clarification-panel__message ceo-clarification-panel__message--ceo ceo-clarification-panel__message--loading">
                <span className="ceo-clarification-panel__message-role">CEO:</span>
                <span className="ceo-clarification-panel__spinner" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Decision Memo (shown when resolved) */}
          {hasMemo && clarificationState?.decisionMemo && (
            <DecisionMemoDisplay memo={clarificationState.decisionMemo} />
          )}

          {/* Input (only when active) */}
          {isActive && (
            <form className="ceo-clarification-panel__input-form" onSubmit={handleSubmit}>
              <textarea
                className="ceo-clarification-panel__input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your response to CEO..."
                disabled={clarificationState?.isProcessing}
                rows={2}
              />
              <button
                type="submit"
                className="ceo-clarification-panel__send"
                disabled={!inputValue.trim() || clarificationState?.isProcessing}
              >
                Send
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Decision Memo Display Sub-component
// -----------------------------------------------------------------------------

interface DecisionMemoDisplayProps {
  memo: DecisionMemo;
}

function DecisionMemoDisplay({ memo }: DecisionMemoDisplayProps): JSX.Element {
  return (
    <div className="ceo-clarification-panel__memo" data-testid="decision-memo">
      <div className="ceo-clarification-panel__memo-header">Decision Memo</div>
      <div className="ceo-clarification-panel__memo-section">
        <strong>Summary:</strong> {memo.clarificationSummary}
      </div>
      <div className="ceo-clarification-panel__memo-section">
        <strong>Decision:</strong> {memo.finalDecision}
      </div>
      <div className="ceo-clarification-panel__memo-section">
        <strong>Next Step:</strong> {memo.nextStep}
      </div>
    </div>
  );
}
