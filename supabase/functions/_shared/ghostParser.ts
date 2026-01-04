// =============================================================================
// The Brain — Ghost Mode Gate Parser
// Phase 9B: Parse GPT's gate evaluation flags
// Implements Phase 9A Rev 3 (LOCKED)
// =============================================================================

import type { GhostStatus, GateResult, GateEvaluation } from './types.ts';

/**
 * Parsed ghost flags from GPT response
 */
export interface ParsedGhostFlags {
  /** Whether parsing was successful */
  valid: boolean;
  /** Ghost status (CONTINUE, CONVERGED, FORCED) */
  status: GhostStatus;
  /** Current round number */
  round: number;
  /** Gate evaluation results */
  gates: {
    g1: GateResult;
    g2: GateResult;
    g3: GateResult;
  };
  /** Final output content (only present when CONVERGED or FORCED) */
  finalOutput?: string;
}

/**
 * Default flags when parsing fails
 * Per Phase 9A: Missing flags → all gates FAIL, status CONTINUE
 */
const DEFAULT_FLAGS: ParsedGhostFlags = {
  valid: false,
  status: 'CONTINUE',
  round: -1,
  gates: {
    g1: 'FAIL',
    g2: 'FAIL',
    g3: 'FAIL',
  },
};

/**
 * Parse GPT's ghost flags from response content
 * 
 * Expected format in response:
 * ---
 * GHOST_GATE_G1=PASS|FAIL
 * GHOST_GATE_G2=PASS|FAIL
 * GHOST_GATE_G3=PASS|FAIL
 * GHOST_ROUND=<n>
 * GHOST_STATUS=CONTINUE|CONVERGED|FORCED
 * ---
 * 
 * @param content - GPT's response content
 * @returns Parsed flags with conservative fallbacks
 */
export function parseGhostFlags(content: string): ParsedGhostFlags {
  try {
    // Extract gate values
    const g1Match = content.match(/GHOST_GATE_G1\s*=\s*(PASS|FAIL)/i);
    const g2Match = content.match(/GHOST_GATE_G2\s*=\s*(PASS|FAIL)/i);
    const g3Match = content.match(/GHOST_GATE_G3\s*=\s*(PASS|FAIL)/i);
    const roundMatch = content.match(/GHOST_ROUND\s*=\s*(\d+)/i);
    const statusMatch = content.match(/GHOST_STATUS\s*=\s*(CONTINUE|CONVERGED|FORCED)/i);

    // Per Phase 9A: If any required field is missing, treat as invalid
    // Conservative approach: missing flags → FAIL
    if (!statusMatch || !roundMatch) {
      return DEFAULT_FLAGS;
    }

    const status = statusMatch[1].toUpperCase() as GhostStatus;
    const round = parseInt(roundMatch[1], 10);

    // Validate round is within bounds (0, 1, 2)
    if (round < 0 || round > 2) {
      return DEFAULT_FLAGS;
    }

    // Gate values: missing → FAIL (conservative)
    const g1: GateResult = g1Match?.[1]?.toUpperCase() === 'PASS' ? 'PASS' : 'FAIL';
    const g2: GateResult = g2Match?.[1]?.toUpperCase() === 'PASS' ? 'PASS' : 'FAIL';
    const g3: GateResult = g3Match?.[1]?.toUpperCase() === 'PASS' ? 'PASS' : 'FAIL';

    // Extract final output if status is CONVERGED or FORCED
    let finalOutput: string | undefined;
    if (status === 'CONVERGED' || status === 'FORCED') {
      finalOutput = extractFinalOutput(content);
    }

    return {
      valid: true,
      status,
      round,
      gates: { g1, g2, g3 },
      finalOutput,
    };
  } catch {
    return DEFAULT_FLAGS;
  }
}

/**
 * Extract the final CEO output from GPT response
 * Looks for RECOMMENDATION section and everything after
 */
function extractFinalOutput(content: string): string | undefined {
  // Find the start of the final output (RECOMMENDATION section)
  const recommendationMatch = content.match(/RECOMMENDATION:\s*([\s\S]*)/i);
  
  if (!recommendationMatch) {
    return undefined;
  }

  // Return everything from RECOMMENDATION onwards
  return `RECOMMENDATION:${recommendationMatch[1]}`.trim();
}

/**
 * Convert parsed gates to GateEvaluation format for audit
 */
export function toGateEvaluation(
  round: number,
  gates: { g1: GateResult; g2: GateResult; g3: GateResult }
): GateEvaluation {
  return {
    round,
    g1: gates.g1,
    g2: gates.g2,
    g3: gates.g3,
  };
}

/**
 * Check if all gates pass
 */
export function allGatesPass(gates: { g1: GateResult; g2: GateResult; g3: GateResult }): boolean {
  return gates.g1 === 'PASS' && gates.g2 === 'PASS' && gates.g3 === 'PASS';
}
