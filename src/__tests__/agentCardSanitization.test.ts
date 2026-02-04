// =============================================================================
// The Brain — AgentCard Sanitization Tests
// Tests that Discussion mode hides gatekeeping flags from users
// =============================================================================

import { describe, it, expect } from 'vitest';

// -----------------------------------------------------------------------------
// Sanitization Logic (mirrored from AgentCard for testing)
// -----------------------------------------------------------------------------

function sanitizeContentForDiscussion(content: string): string {
  const lines = content.split('\n');
  const sanitizedLines: string[] = [];
  let insideFlagsBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '---') {
      insideFlagsBlock = !insideFlagsBlock;
      continue;
    }

    if (/^CALL_CLAUDE\s*=/i.test(trimmed)) continue;
    if (/^CALL_GEMINI\s*=/i.test(trimmed)) continue;
    if (/^REASON_TAG\s*=/i.test(trimmed)) continue;

    if (insideFlagsBlock) continue;

    sanitizedLines.push(line);
  }

  return sanitizedLines.join('\n').trim();
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('AgentCard — Discussion Mode Sanitization', () => {
  it('removes gatekeeping flags inside --- delimiters', () => {
    const content = `Here is my response to your question.

---
CALL_CLAUDE=true
CALL_GEMINI=false
REASON_TAG=analysis
---`;

    const sanitized = sanitizeContentForDiscussion(content);

    expect(sanitized).toBe('Here is my response to your question.');
    expect(sanitized).not.toContain('CALL_CLAUDE');
    expect(sanitized).not.toContain('CALL_GEMINI');
    expect(sanitized).not.toContain('REASON_TAG');
    expect(sanitized).not.toContain('---');
  });

  it('removes gatekeeping flags without --- delimiters', () => {
    const content = `Here is my response.
CALL_CLAUDE=true
CALL_GEMINI=true
REASON_TAG=test`;

    const sanitized = sanitizeContentForDiscussion(content);

    expect(sanitized).toBe('Here is my response.');
    expect(sanitized).not.toContain('CALL_CLAUDE');
    expect(sanitized).not.toContain('CALL_GEMINI');
    expect(sanitized).not.toContain('REASON_TAG');
  });

  it('preserves content without gatekeeping flags', () => {
    const content = `This is a normal response without any flags.
It has multiple lines.
And continues here.`;

    const sanitized = sanitizeContentForDiscussion(content);

    expect(sanitized).toBe(content);
  });

  it('handles case-insensitive flag names', () => {
    const content = `Response text.
call_claude=TRUE
Call_Gemini=False
reason_tag=MIXED`;

    const sanitized = sanitizeContentForDiscussion(content);

    expect(sanitized).toBe('Response text.');
  });

  it('handles whitespace around equals sign', () => {
    const content = `Response.
CALL_CLAUDE = true
CALL_GEMINI= false
REASON_TAG =test`;

    const sanitized = sanitizeContentForDiscussion(content);

    expect(sanitized).toBe('Response.');
  });

  it('removes content between --- delimiters even without flag keywords', () => {
    const content = `Main content.
---
Some debug info
More internal stuff
---
End content.`;

    const sanitized = sanitizeContentForDiscussion(content);

    expect(sanitized).toBe('Main content.\nEnd content.');
  });

  it('handles empty content gracefully', () => {
    expect(sanitizeContentForDiscussion('')).toBe('');
  });

  it('handles content that is only flags', () => {
    const content = `---
CALL_CLAUDE=true
CALL_GEMINI=true
REASON_TAG=only_flags
---`;

    const sanitized = sanitizeContentForDiscussion(content);

    expect(sanitized).toBe('');
  });
});
