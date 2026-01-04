// =============================================================================
// The Brain — Ghost Database Constraint Tests
// Phase 9B: Specification tests for ghost_runs table constraints
// =============================================================================

import { describe, it, expect } from 'vitest';

/**
 * These tests document the expected database constraint behavior.
 * They validate the constraint logic in TypeScript, mirroring the SQL constraints.
 * 
 * Actual database constraint testing requires a test database connection.
 * These tests serve as specification and can be run against test data.
 */

// =============================================================================
// TYPE DEFINITIONS (mirror ghost_runs schema)
// =============================================================================

type FinalStatus = 'CONVERGED' | 'FORCED' | 'ABORTED';
type ForcedReason = 'round_cap' | 'call_cap' | 'token_cap' | 'timeout';
type AbortReason = 'gpt_failure' | 'audit_failure' | 'internal_error';
type DeletedReason = 'RETENTION_EXPIRED' | 'DATA_PROTECTION_REQUEST' | 'INCIDENT_CONTAINMENT' | 'LEGAL_HOLD_RELEASE' | 'ADMIN_CORRECTION';

interface GhostRunRecord {
  final_status: FinalStatus;
  forced_reason: ForcedReason | null;
  abort_reason: AbortReason | null;
  legal_hold: boolean;
  deleted_at: Date | null;
  deleted_reason: DeletedReason | null;
  deleted_by: string | null;
  rounds_used: number;
  calls_used: number;
  tokens_used: number;
  gate_results: Array<{ round: number; g1: string; g2: string; g3: string }>;
}

// =============================================================================
// CONSTRAINT VALIDATION FUNCTIONS
// =============================================================================

/**
 * forced_reason_status constraint
 * forced_reason only valid when FORCED, must be one of the allowed values
 */
function validateForcedReasonStatus(record: GhostRunRecord): boolean {
  const validForcedReasons: ForcedReason[] = ['round_cap', 'call_cap', 'token_cap', 'timeout'];
  
  if (record.final_status === 'FORCED') {
    return record.forced_reason !== null && validForcedReasons.includes(record.forced_reason);
  } else {
    return record.forced_reason === null;
  }
}

/**
 * abort_reason_status constraint
 * abort_reason only valid when ABORTED, must be one of the allowed values
 */
function validateAbortReasonStatus(record: GhostRunRecord): boolean {
  const validAbortReasons: AbortReason[] = ['gpt_failure', 'audit_failure', 'internal_error'];
  
  if (record.final_status === 'ABORTED') {
    return record.abort_reason !== null && validAbortReasons.includes(record.abort_reason);
  } else {
    return record.abort_reason === null;
  }
}

/**
 * converged_no_reasons constraint
 * CONVERGED status must have neither forced_reason nor abort_reason
 */
function validateConvergedNoReasons(record: GhostRunRecord): boolean {
  if (record.final_status === 'CONVERGED') {
    return record.forced_reason === null && record.abort_reason === null;
  }
  return true;
}

/**
 * deletion_fields_null_together constraint
 * All deletion fields must be NULL together or all NOT NULL together
 */
function validateDeletionFieldsConsistency(record: GhostRunRecord): boolean {
  const allNull = record.deleted_at === null && record.deleted_reason === null && record.deleted_by === null;
  const allNotNull = record.deleted_at !== null && record.deleted_reason !== null && record.deleted_by !== null;
  return allNull || allNotNull;
}

/**
 * legal_hold_prevents_delete constraint
 * Cannot soft-delete while legal_hold is TRUE
 */
function validateLegalHoldPreventsDelete(record: GhostRunRecord): boolean {
  if (record.legal_hold === true && record.deleted_at !== null) {
    return false;
  }
  return true;
}

/**
 * gate_results_valid constraint (simplified version)
 * Validates gate_results JSON structure
 */
function validateGateResults(gateResults: GhostRunRecord['gate_results']): boolean {
  if (!Array.isArray(gateResults)) return false;
  if (gateResults.length > 3) return false;
  
  let prevRound = -1;
  for (const entry of gateResults) {
    // Must have required keys
    if (typeof entry.round !== 'number' || !entry.g1 || !entry.g2 || !entry.g3) {
      return false;
    }
    
    // Round must be 0, 1, or 2
    if (entry.round < 0 || entry.round > 2) return false;
    
    // Rounds must be monotonically increasing
    if (entry.round <= prevRound) return false;
    prevRound = entry.round;
    
    // Gates must be PASS or FAIL
    if (!['PASS', 'FAIL'].includes(entry.g1)) return false;
    if (!['PASS', 'FAIL'].includes(entry.g2)) return false;
    if (!['PASS', 'FAIL'].includes(entry.g3)) return false;
  }
  
  return true;
}

/**
 * Validate numeric bounds
 */
function validateNumericBounds(record: GhostRunRecord): boolean {
  if (record.rounds_used < 0 || record.rounds_used > 2) return false;
  if (record.calls_used < 0 || record.calls_used > 6) return false;
  if (record.tokens_used < 0) return false;
  return true;
}

// =============================================================================
// TESTS
// =============================================================================

describe('Ghost Database Constraints', () => {
  describe('forced_reason_status constraint', () => {
    it('should require forced_reason when status is FORCED', () => {
      const record: GhostRunRecord = {
        final_status: 'FORCED',
        forced_reason: null,  // Invalid
        abort_reason: null,
        legal_hold: false,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 2,
        calls_used: 6,
        tokens_used: 3500,
        gate_results: [],
      };
      
      expect(validateForcedReasonStatus(record)).toBe(false);
    });

    it('should accept valid forced_reason when status is FORCED', () => {
      const record: GhostRunRecord = {
        final_status: 'FORCED',
        forced_reason: 'round_cap',
        abort_reason: null,
        legal_hold: false,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 2,
        calls_used: 4,
        tokens_used: 2000,
        gate_results: [],
      };
      
      expect(validateForcedReasonStatus(record)).toBe(true);
    });

    it('should reject forced_reason when status is not FORCED', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: 'round_cap',  // Invalid
        abort_reason: null,
        legal_hold: false,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 1,
        calls_used: 3,
        tokens_used: 1500,
        gate_results: [],
      };
      
      expect(validateForcedReasonStatus(record)).toBe(false);
    });
  });

  describe('abort_reason_status constraint', () => {
    it('should require abort_reason when status is ABORTED', () => {
      const record: GhostRunRecord = {
        final_status: 'ABORTED',
        forced_reason: null,
        abort_reason: null,  // Invalid
        legal_hold: false,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 0,
        calls_used: 1,
        tokens_used: 500,
        gate_results: [],
      };
      
      expect(validateAbortReasonStatus(record)).toBe(false);
    });

    it('should accept valid abort_reason when status is ABORTED', () => {
      const record: GhostRunRecord = {
        final_status: 'ABORTED',
        forced_reason: null,
        abort_reason: 'gpt_failure',
        legal_hold: false,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 0,
        calls_used: 1,
        tokens_used: 100,
        gate_results: [],
      };
      
      expect(validateAbortReasonStatus(record)).toBe(true);
    });
  });

  describe('converged_no_reasons constraint', () => {
    it('should reject forced_reason when status is CONVERGED', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: 'timeout',  // Invalid
        abort_reason: null,
        legal_hold: false,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 1,
        calls_used: 3,
        tokens_used: 1500,
        gate_results: [],
      };
      
      expect(validateConvergedNoReasons(record)).toBe(false);
    });

    it('should accept CONVERGED with no reasons', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: null,
        abort_reason: null,
        legal_hold: false,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 1,
        calls_used: 3,
        tokens_used: 1500,
        gate_results: [],
      };
      
      expect(validateConvergedNoReasons(record)).toBe(true);
    });
  });

  describe('deletion_fields_null_together constraint', () => {
    it('should accept all deletion fields NULL', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: null,
        abort_reason: null,
        legal_hold: false,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 1,
        calls_used: 3,
        tokens_used: 1500,
        gate_results: [],
      };
      
      expect(validateDeletionFieldsConsistency(record)).toBe(true);
    });

    it('should accept all deletion fields NOT NULL', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: null,
        abort_reason: null,
        legal_hold: false,
        deleted_at: new Date(),
        deleted_reason: 'RETENTION_EXPIRED',
        deleted_by: 'system_cron',
        rounds_used: 1,
        calls_used: 3,
        tokens_used: 1500,
        gate_results: [],
      };
      
      expect(validateDeletionFieldsConsistency(record)).toBe(true);
    });

    it('should reject partial deletion fields', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: null,
        abort_reason: null,
        legal_hold: false,
        deleted_at: new Date(),
        deleted_reason: 'RETENTION_EXPIRED',
        deleted_by: null,  // Invalid: missing when others are set
        rounds_used: 1,
        calls_used: 3,
        tokens_used: 1500,
        gate_results: [],
      };
      
      expect(validateDeletionFieldsConsistency(record)).toBe(false);
    });
  });

  describe('legal_hold_prevents_delete constraint', () => {
    it('should prevent deletion when legal_hold is TRUE', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: null,
        abort_reason: null,
        legal_hold: true,
        deleted_at: new Date(),  // Invalid: cannot delete with legal hold
        deleted_reason: 'ADMIN_CORRECTION',
        deleted_by: 'admin@example.com',
        rounds_used: 1,
        calls_used: 3,
        tokens_used: 1500,
        gate_results: [],
      };
      
      expect(validateLegalHoldPreventsDelete(record)).toBe(false);
    });

    it('should allow deletion when legal_hold is FALSE', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: null,
        abort_reason: null,
        legal_hold: false,
        deleted_at: new Date(),
        deleted_reason: 'RETENTION_EXPIRED',
        deleted_by: 'system_cron',
        rounds_used: 1,
        calls_used: 3,
        tokens_used: 1500,
        gate_results: [],
      };
      
      expect(validateLegalHoldPreventsDelete(record)).toBe(true);
    });

    it('should allow legal_hold TRUE with no deletion', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: null,
        abort_reason: null,
        legal_hold: true,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 1,
        calls_used: 3,
        tokens_used: 1500,
        gate_results: [],
      };
      
      expect(validateLegalHoldPreventsDelete(record)).toBe(true);
    });
  });

  describe('gate_results validation', () => {
    it('should accept valid gate_results array', () => {
      const gateResults = [
        { round: 0, g1: 'PASS', g2: 'FAIL', g3: 'PASS' },
        { round: 1, g1: 'PASS', g2: 'PASS', g3: 'PASS' },
      ];
      
      expect(validateGateResults(gateResults)).toBe(true);
    });

    it('should reject non-monotonic round numbers', () => {
      const gateResults = [
        { round: 1, g1: 'PASS', g2: 'PASS', g3: 'PASS' },
        { round: 0, g1: 'PASS', g2: 'PASS', g3: 'PASS' },  // Invalid: not monotonic
      ];
      
      expect(validateGateResults(gateResults)).toBe(false);
    });

    it('should reject duplicate round numbers', () => {
      const gateResults = [
        { round: 0, g1: 'PASS', g2: 'PASS', g3: 'PASS' },
        { round: 0, g1: 'FAIL', g2: 'FAIL', g3: 'FAIL' },  // Invalid: duplicate
      ];
      
      expect(validateGateResults(gateResults)).toBe(false);
    });

    it('should reject invalid round numbers', () => {
      const gateResults = [
        { round: 5, g1: 'PASS', g2: 'PASS', g3: 'PASS' },  // Invalid: > 2
      ];
      
      expect(validateGateResults(gateResults)).toBe(false);
    });

    it('should reject invalid gate values', () => {
      const gateResults = [
        { round: 0, g1: 'MAYBE', g2: 'PASS', g3: 'PASS' },  // Invalid: not PASS/FAIL
      ];
      
      expect(validateGateResults(gateResults)).toBe(false);
    });

    it('should reject arrays with more than 3 elements', () => {
      const gateResults = [
        { round: 0, g1: 'PASS', g2: 'PASS', g3: 'PASS' },
        { round: 1, g1: 'PASS', g2: 'PASS', g3: 'PASS' },
        { round: 2, g1: 'PASS', g2: 'PASS', g3: 'PASS' },
        { round: 3, g1: 'PASS', g2: 'PASS', g3: 'PASS' },  // Invalid: 4th element
      ];
      
      expect(validateGateResults(gateResults)).toBe(false);
    });

    it('should accept empty array', () => {
      expect(validateGateResults([])).toBe(true);
    });
  });

  describe('numeric bounds', () => {
    it('should reject rounds_used > 2', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: null,
        abort_reason: null,
        legal_hold: false,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 5,  // Invalid
        calls_used: 3,
        tokens_used: 1500,
        gate_results: [],
      };
      
      expect(validateNumericBounds(record)).toBe(false);
    });

    it('should reject calls_used > 6', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: null,
        abort_reason: null,
        legal_hold: false,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 2,
        calls_used: 10,  // Invalid
        tokens_used: 1500,
        gate_results: [],
      };
      
      expect(validateNumericBounds(record)).toBe(false);
    });

    it('should reject negative tokens_used', () => {
      const record: GhostRunRecord = {
        final_status: 'CONVERGED',
        forced_reason: null,
        abort_reason: null,
        legal_hold: false,
        deleted_at: null,
        deleted_reason: null,
        deleted_by: null,
        rounds_used: 2,
        calls_used: 6,
        tokens_used: -100,  // Invalid
        gate_results: [],
      };
      
      expect(validateNumericBounds(record)).toBe(false);
    });
  });
});
