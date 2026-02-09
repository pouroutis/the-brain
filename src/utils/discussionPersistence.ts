// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Discussion Export Utilities
// =============================================================================

import type { DiscussionSession, Exchange, TranscriptEntry } from '../types/brain';

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
  transcript: TranscriptEntry[],
  exchanges?: Exchange[]
): string {
  // Build termination metadata per exchange
  const exchangeMeta: Record<string, { storedRounds: number; maxRounds: number; terminationReason: string }> = {};
  if (exchanges) {
    for (const ex of exchanges) {
      exchangeMeta[ex.id] = {
        storedRounds: ex.rounds.length,
        maxRounds: 5,
        terminationReason: 'unknown',
      };
    }
  }

  const exportData = {
    sessionId: session.id,
    createdAt: new Date(session.createdAt).toISOString(),
    exportedAt: new Date().toISOString(),
    entryCount: transcript.length,
    exchanges: exchanges ? Object.entries(exchangeMeta).map(([id, meta]) => ({
      exchangeId: id,
      ...meta,
    })) : undefined,
    transcript: transcript.map((entry) => ({
      exchangeId: entry.exchangeId,
      role: entry.role,
      content: entry.content,
      timestamp: new Date(entry.timestamp).toISOString(),
      ...(entry.roundNumber !== undefined ? { roundNumber: entry.roundNumber } : {}),
      ...(entry.status !== undefined ? { status: entry.status } : {}),
    })),
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Export transcript as Markdown string.
 */
export function exportTranscriptAsMarkdown(
  session: DiscussionSession,
  transcript: TranscriptEntry[],
  exchanges?: Exchange[]
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
  let currentRound = -1;

  for (const entry of transcript) {
    // Exchange separator
    if (entry.exchangeId !== currentExchangeId) {
      if (currentExchangeId !== '') {
        // Add termination metadata for previous exchange
        if (exchanges) {
          const prevEx = exchanges.find((e) => e.id === currentExchangeId);
          if (prevEx) {
            lines.push('');
            lines.push(`*Rounds completed: ${prevEx.rounds.length} | Termination: unknown*`);
          }
        }
        lines.push('');
        lines.push('---');
        lines.push('');
      }
      currentExchangeId = entry.exchangeId;
      currentRound = -1;
    }

    // Round separator (for agent entries with roundNumber)
    if (entry.roundNumber !== undefined && entry.roundNumber !== currentRound) {
      currentRound = entry.roundNumber;
      lines.push(`### Round ${currentRound}`);
      lines.push('');
    }

    const roleLabel = ROLE_LABELS[entry.role] ?? entry.role;
    const time = new Date(entry.timestamp).toLocaleTimeString();

    lines.push(`## ${roleLabel}`);
    lines.push(`*${time}*`);
    lines.push('');
    lines.push(entry.content);
    lines.push('');
  }

  // Termination metadata for last exchange
  if (exchanges && currentExchangeId) {
    const lastEx = exchanges.find((e) => e.id === currentExchangeId);
    if (lastEx) {
      lines.push('');
      lines.push(`*Rounds completed: ${lastEx.rounds.length} | Termination: unknown*`);
    }
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
