// =============================================================================
// The Brain — agentClient Unit Tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { buildGPTRequest } from '../api/agentClient';

describe('buildGPTRequest', () => {
  it('includes context in userMessage when context is non-empty', () => {
    const result = buildGPTRequest('What is AI?', 'Claude: AI is broad.', false);
    expect(result.userMessage).toContain('Previous responses:\nClaude: AI is broad.');
    expect(result.userMessage).toContain("User's original question: What is AI?");
  });

  it('uses just the user prompt when context is empty', () => {
    const result = buildGPTRequest('What is AI?', '', false);
    expect(result.userMessage).toBe('What is AI?');
  });
});
