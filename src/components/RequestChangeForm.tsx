// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// RequestChangeForm Component (Structured Interrupt)
// =============================================================================

import { useState, useCallback } from 'react';
import type { InterruptSeverity, InterruptScope } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface RequestChangeFormProps {
  onSubmit: (message: string, severity: InterruptSeverity, scope: InterruptScope) => void;
  onCancel: () => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function RequestChangeForm({ onSubmit, onCancel }: RequestChangeFormProps): JSX.Element {
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<InterruptSeverity>('improvement');
  const [scope, setScope] = useState<InterruptScope>('other');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!message.trim()) return;
      onSubmit(message.trim(), severity, scope);
    },
    [message, severity, scope, onSubmit]
  );

  return (
    <div className="request-change-form__overlay" data-testid="request-change-form">
      <div className="request-change-form__modal">
        <h3 className="request-change-form__title">Request Change</h3>
        <form onSubmit={handleSubmit}>
          {/* Message */}
          <div className="request-change-form__field">
            <label className="request-change-form__label" htmlFor="change-message">
              Message
            </label>
            <textarea
              id="change-message"
              className="request-change-form__textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Describe the change you need..."
              required
              data-testid="change-message"
            />
          </div>

          {/* Severity */}
          <div className="request-change-form__field">
            <label className="request-change-form__label">Severity</label>
            <div className="request-change-form__radio-group">
              <label className="request-change-form__radio-label">
                <input
                  type="radio"
                  name="severity"
                  value="blocker"
                  checked={severity === 'blocker'}
                  onChange={() => setSeverity('blocker')}
                  data-testid="severity-blocker"
                />
                <span className="request-change-form__radio-text">
                  <strong>Blocker</strong> — Pause immediately, must fix before continuing
                </span>
              </label>
              <label className="request-change-form__radio-label">
                <input
                  type="radio"
                  name="severity"
                  value="improvement"
                  checked={severity === 'improvement'}
                  onChange={() => setSeverity('improvement')}
                  data-testid="severity-improvement"
                />
                <span className="request-change-form__radio-text">
                  <strong>Improvement</strong> — Queue for next opportunity
                </span>
              </label>
            </div>
          </div>

          {/* Scope */}
          <div className="request-change-form__field">
            <label className="request-change-form__label" htmlFor="change-scope">
              Scope
            </label>
            <select
              id="change-scope"
              className="request-change-form__select"
              value={scope}
              onChange={(e) => setScope(e.target.value as InterruptScope)}
              data-testid="change-scope"
            >
              <option value="ui">UI</option>
              <option value="api">API</option>
              <option value="tests">Tests</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Actions */}
          <div className="request-change-form__actions">
            <button
              type="button"
              className="request-change-form__button request-change-form__button--cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="request-change-form__button request-change-form__button--submit"
              disabled={!message.trim()}
              data-testid="submit-change"
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
