// =============================================================================
// The Brain — Ghost Parser Tests
// Phase 9B: Tests for gate flag parsing
// =============================================================================

import { describe, it, expect } from 'vitest';

// Note: These tests are for the frontend ghost parser
// The Edge Function parser has the same logic

import type { GateResult } from '../types/ghost';

// Inline parser implementation for testing (mirrors Edge Function logic)
interface ParsedGhostFlags {
  valid: boolean;
  status: 'CONTINUE' | 'CONVERGED' | 'FORCED';
  round: number;
  gates: {
    g1: GateResult;
    g2: GateResult;
    g3: GateResult;
  };
  finalOutput?: string;
}

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

function parseGhostFlags(content: string): ParsedGhostFlags {
  try {
    const g1Match = content.match(/GHOST_GATE_G1\s*=\s*(PASS|FAIL)/i);
    const g2Match = content.match(/GHOST_GATE_G2\s*=\s*(PASS|FAIL)/i);
    const g3Match = content.match(/GHOST_GATE_G3\s*=\s*(PASS|FAIL)/i);
    const roundMatch = content.match(/GHOST_ROUND\s*=\s*(\d+)/i);
    const statusMatch = content.match(/GHOST_STATUS\s*=\s*(CONTINUE|CONVERGED|FORCED)/i);

    if (!statusMatch || !roundMatch) {
      return DEFAULT_FLAGS;
    }

    const status = statusMatch[1].toUpperCase() as 'CONTINUE' | 'CONVERGED' | 'FORCED';
    const round = parseInt(roundMatch[1], 10);

    if (round < 0 || round > 2) {
      return DEFAULT_FLAGS;
    }

    const g1: GateResult = g1Match?.[1]?.toUpperCase() === 'PASS' ? 'PASS' : 'FAIL';
    const g2: GateResult = g2Match?.[1]?.toUpperCase() === 'PASS' ? 'PASS' : 'FAIL';
    const g3: GateResult = g3Match?.[1]?.toUpperCase() === 'PASS' ? 'PASS' : 'FAIL';

    return {
      valid: true,
      status,
      round,
      gates: { g1, g2, g3 },
    };
  } catch {
    return DEFAULT_FLAGS;
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('Ghost Parser', () => {
  describe('parseGhostFlags', () => {
    it('should return default FAIL flags when content is empty', () => {
      const result = parseGhostFlags('');
      
      expect(result.valid).toBe(false);
      expect(result.gates.g1).toBe('FAIL');
      expect(result.gates.g2).toBe('FAIL');
      expect(result.gates.g3).toBe('FAIL');
    });

    it('should return default FAIL flags when required fields are missing', () => {
      const content = `
        Some analysis here...
        GHOST_GATE_G1=PASS
        GHOST_GATE_G2=PASS
      `;
      
      const result = parseGhostFlags(content);
      
      expect(result.valid).toBe(false);
      expect(result.status).toBe('CONTINUE');
      expect(result.gates.g1).toBe('FAIL');
      expect(result.gates.g2).toBe('FAIL');
      expect(result.gates.g3).toBe('FAIL');
    });

    it('should parse valid flags correctly', () => {
      const content = `
        Analysis...
        ---
        GHOST_GATE_G1=PASS
        GHOST_GATE_G2=PASS
        GHOST_GATE_G3=PASS
        GHOST_ROUND=1
        GHOST_STATUS=CONVERGED
        ---
      `;
      
      const result = parseGhostFlags(content);
      
      expect(result.valid).toBe(true);
      expect(result.status).toBe('CONVERGED');
      expect(result.round).toBe(1);
      expect(result.gates.g1).toBe('PASS');
      expect(result.gates.g2).toBe('PASS');
      expect(result.gates.g3).toBe('PASS');
    });

    it('should treat missing gate flags as FAIL (conservative)', () => {
      const content = `
        ---
        GHOST_GATE_G1=PASS
        GHOST_ROUND=0
        GHOST_STATUS=CONTINUE
        ---
      `;
      
      const result = parseGhostFlags(content);
      
      expect(result.valid).toBe(true);
      expect(result.gates.g1).toBe('PASS');
      expect(result.gates.g2).toBe('FAIL');  // Missing → FAIL
      expect(result.gates.g3).toBe('FAIL');  // Missing → FAIL
    });

    it('should handle FORCED status', () => {
      const content = `
        ---
        GHOST_GATE_G1=PASS
        GHOST_GATE_G2=FAIL
        GHOST_GATE_G3=PASS
        GHOST_ROUND=2
        GHOST_STATUS=FORCED
        ---
      `;
      
      const result = parseGhostFlags(content);
      
      expect(result.valid).toBe(true);
      expect(result.status).toBe('FORCED');
      expect(result.round).toBe(2);
    });

    it('should reject invalid round numbers', () => {
      const content = `
        ---
        GHOST_GATE_G1=PASS
        GHOST_GATE_G2=PASS
        GHOST_GATE_G3=PASS
        GHOST_ROUND=5
        GHOST_STATUS=CONTINUE
        ---
      `;
      
      const result = parseGhostFlags(content);
      
      expect(result.valid).toBe(false);
    });

    it('should be case-insensitive for flag values', () => {
      const content = `
        ghost_gate_g1=pass
        ghost_gate_g2=FAIL
        ghost_gate_g3=Pass
        ghost_round=1
        ghost_status=converged
      `;
      
      const result = parseGhostFlags(content);
      
      expect(result.valid).toBe(true);
      expect(result.gates.g1).toBe('PASS');
      expect(result.gates.g2).toBe('FAIL');
      expect(result.gates.g3).toBe('PASS');
      expect(result.status).toBe('CONVERGED');
    });

    it('should handle whitespace variations', () => {
      const content = `
        GHOST_GATE_G1 = PASS
        GHOST_GATE_G2=  FAIL
        GHOST_GATE_G3  =PASS
        GHOST_ROUND = 0
        GHOST_STATUS = CONTINUE
      `;
      
      const result = parseGhostFlags(content);
      
      expect(result.valid).toBe(true);
      expect(result.gates.g1).toBe('PASS');
      expect(result.gates.g2).toBe('FAIL');
      expect(result.gates.g3).toBe('PASS');
    });
  });
});
