// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Discussion Export Utilities
// =============================================================================

import type { DiscussionSession, TranscriptEntry } from '../types/brain';

// -----------------------------------------------------------------------------
// Export Utilities
// -----------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  user: 'User',
  gpt: 'GPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

/**
 * Export transcript as JSON string.
 */
export function exportTranscriptAsJson(
  session: DiscussionSession,
  transcript: TranscriptEntry[]
): string {
  const exportData = {
    sessionId: session.id,
    createdAt: new Date(session.createdAt).toISOString(),
    exportedAt: new Date().toISOString(),
    entryCount: transcript.length,
    transcript: transcript.map((entry) => ({
      exchangeId: entry.exchangeId,
      role: entry.role,
      content: entry.content,
      timestamp: new Date(entry.timestamp).toISOString(),
    })),
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Export transcript as Markdown string.
 */
export function exportTranscriptAsMarkdown(
  session: DiscussionSession,
  transcript: TranscriptEntry[]
): string {
  const lines: string[] = [];

  lines.push('# The Brain — Discussion Transcript');
  lines.push('');
  lines.push(`**Session ID:** ${session.id}`);
  lines.push(`**Created:** ${new Date(session.createdAt).toLocaleString()}`);
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**Total entries:** ${transcript.length}`);
  lines.push('');

  lines.push('---');
  lines.push('');

  let currentExchangeId = '';
  for (const entry of transcript) {
    if (entry.exchangeId !== currentExchangeId) {
      if (currentExchangeId !== '') {
        lines.push('');
        lines.push('---');
        lines.push('');
      }
      currentExchangeId = entry.exchangeId;
    }

    const roleLabel = ROLE_LABELS[entry.role] ?? entry.role;
    const time = new Date(entry.timestamp).toLocaleTimeString();

    lines.push(`## ${roleLabel}`);
    lines.push(`*${time}*`);
    lines.push('');
    lines.push(entry.content);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Trigger file download in browser.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch {
    // Silently fail if download not supported
  }
}
