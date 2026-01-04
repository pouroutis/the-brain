-- =============================================================================
-- The Brain — Ghost Mode Audit Persistence
-- Phase 9B Migration: ghost_runs table
-- Implements Phase 9A Rev 3 (LOCKED)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Validation function for gate_results JSONB structure
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_gate_results(results JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  elem JSONB;
  prev_round INT := -1;
  curr_round INT;
BEGIN
  -- Must be an array
  IF jsonb_typeof(results) != 'array' THEN
    RETURN FALSE;
  END IF;
  
  -- Array length 0-3
  IF jsonb_array_length(results) > 3 THEN
    RETURN FALSE;
  END IF;
  
  -- Validate each element
  FOR elem IN SELECT * FROM jsonb_array_elements(results)
  LOOP
    -- Must have all required keys
    IF NOT (
      elem ? 'round' AND
      elem ? 'g1' AND
      elem ? 'g2' AND
      elem ? 'g3'
    ) THEN
      RETURN FALSE;
    END IF;
    
    -- Round must be 0, 1, or 2
    curr_round := (elem->>'round')::INT;
    IF curr_round NOT IN (0, 1, 2) THEN
      RETURN FALSE;
    END IF;
    
    -- Rounds must be monotonically increasing
    IF curr_round <= prev_round THEN
      RETURN FALSE;
    END IF;
    prev_round := curr_round;
    
    -- Gates must be PASS or FAIL
    IF NOT (
      elem->>'g1' IN ('PASS', 'FAIL') AND
      elem->>'g2' IN ('PASS', 'FAIL') AND
      elem->>'g3' IN ('PASS', 'FAIL')
    ) THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql 
   IMMUTABLE
   SET search_path = public;

-- -----------------------------------------------------------------------------
-- Main table: ghost_runs
-- -----------------------------------------------------------------------------

CREATE TABLE ghost_runs (
  -- Identity
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_hash TEXT NOT NULL,
  decision_fingerprint TEXT NOT NULL,
  fingerprint_key_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Operational metrics
  rounds_used SMALLINT NOT NULL CHECK (rounds_used >= 0 AND rounds_used <= 2),
  calls_used SMALLINT NOT NULL CHECK (calls_used >= 0 AND calls_used <= 6),
  tokens_used INT NOT NULL CHECK (tokens_used >= 0),
  
  -- Outcome
  final_status TEXT NOT NULL CHECK (final_status IN ('CONVERGED', 'FORCED', 'ABORTED')),
  forced_reason TEXT,
  abort_reason TEXT,
  gate_results JSONB NOT NULL,
  template_version TEXT NOT NULL,
  
  -- Governance
  legal_hold BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_reason TEXT,
  deleted_by TEXT,
  
  -- ==========================================================================
  -- CONSTRAINTS (Phase 9A Rev 3 LOCKED)
  -- ==========================================================================
  
  -- Outcome integrity: forced_reason only when FORCED
  CONSTRAINT forced_reason_status CHECK (
    (final_status = 'FORCED' AND forced_reason IN ('round_cap', 'call_cap', 'token_cap', 'timeout'))
    OR
    (final_status != 'FORCED' AND forced_reason IS NULL)
  ),
  
  -- Outcome integrity: abort_reason only when ABORTED
  CONSTRAINT abort_reason_status CHECK (
    (final_status = 'ABORTED' AND abort_reason IN ('gpt_failure', 'audit_failure', 'internal_error'))
    OR
    (final_status != 'ABORTED' AND abort_reason IS NULL)
  ),
  
  -- Outcome integrity: CONVERGED has neither reason (explicit)
  CONSTRAINT converged_no_reasons CHECK (
    final_status != 'CONVERGED' 
    OR 
    (forced_reason IS NULL AND abort_reason IS NULL)
  ),
  
  -- Deletion consistency: deleted_at NULL implies others NULL
  CONSTRAINT deletion_fields_null_together CHECK (
    (deleted_at IS NULL AND deleted_reason IS NULL AND deleted_by IS NULL)
    OR
    (deleted_at IS NOT NULL AND deleted_reason IS NOT NULL AND deleted_by IS NOT NULL)
  ),
  
  -- Legal hold enforcement: cannot soft-delete while held
  CONSTRAINT legal_hold_prevents_delete CHECK (
    NOT (legal_hold = TRUE AND deleted_at IS NOT NULL)
  ),
  
  -- Gate results structural validation
  CONSTRAINT gate_results_valid CHECK (
    validate_gate_results(gate_results)
  ),
  
  -- Deleted reason enum
  CONSTRAINT deleted_reason_enum CHECK (
    deleted_reason IS NULL 
    OR 
    deleted_reason IN ('RETENTION_EXPIRED', 'DATA_PROTECTION_REQUEST', 'INCIDENT_CONTAINMENT', 'LEGAL_HOLD_RELEASE', 'ADMIN_CORRECTION')
  )
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

-- Primary lookups
CREATE INDEX idx_ghost_runs_created_at ON ghost_runs(created_at);
CREATE INDEX idx_ghost_runs_fingerprint ON ghost_runs(decision_fingerprint);
CREATE INDEX idx_ghost_runs_snapshot ON ghost_runs(snapshot_hash);

-- Governance workflows
CREATE INDEX idx_ghost_runs_legal_hold ON ghost_runs(legal_hold) WHERE legal_hold = TRUE;

-- Retention workflow: eligible for soft-delete
CREATE INDEX idx_ghost_runs_retention_eligible ON ghost_runs(created_at) 
  WHERE deleted_at IS NULL AND legal_hold = FALSE;

-- Hard-delete workflow: soft-deleted records
CREATE INDEX idx_ghost_runs_soft_deleted ON ghost_runs(deleted_at) 
  WHERE deleted_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE ghost_runs ENABLE ROW LEVEL SECURITY;
-- No policies = anon/authenticated blocked
-- Service role bypasses for Edge Function operations

-- -----------------------------------------------------------------------------
-- Admin soft-delete procedure (SECURITY HARDENED)
-- Access restricted to service role / admin only
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_delete_audit_record(
  p_audit_id UUID,
  p_reason TEXT,
  p_admin_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_legal_hold BOOLEAN;
BEGIN
  -- Set search_path to prevent search_path hijacking attacks
  -- This is a security best practice for SECURITY DEFINER functions
  
  -- Check legal hold first (for clear error message)
  SELECT legal_hold INTO v_legal_hold
  FROM public.ghost_runs
  WHERE audit_id = p_audit_id;
  
  IF v_legal_hold IS NULL THEN
    RAISE EXCEPTION 'Audit record not found: %', p_audit_id;
  END IF;
  
  IF v_legal_hold = TRUE THEN
    RAISE EXCEPTION 'Cannot delete record under legal hold: %', p_audit_id;
  END IF;
  
  -- Perform soft delete
  UPDATE public.ghost_runs
  SET 
    deleted_at = NOW(),
    deleted_reason = p_reason,
    deleted_by = p_admin_id
  WHERE audit_id = p_audit_id
    AND deleted_at IS NULL;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql 
   SECURITY DEFINER
   SET search_path = public;

-- Revoke execute from public (no anonymous access)
REVOKE EXECUTE ON FUNCTION admin_delete_audit_record(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_delete_audit_record(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_delete_audit_record(UUID, TEXT, TEXT) FROM authenticated;

-- Grant execute only to service_role (Edge Functions use this)
GRANT EXECUTE ON FUNCTION admin_delete_audit_record(UUID, TEXT, TEXT) TO service_role;

-- Comment documenting access control
COMMENT ON FUNCTION admin_delete_audit_record IS 
  'Soft-delete audit record. Access restricted to service_role only. '
  'Legal hold prevents deletion. Requires all three parameters: '
  'audit_id (UUID), reason (TEXT from allowed enum), admin_id (TEXT).';

-- -----------------------------------------------------------------------------
-- Rollback (DOWN migration)
-- -----------------------------------------------------------------------------

-- To rollback, run:
-- REVOKE EXECUTE ON FUNCTION admin_delete_audit_record(UUID, TEXT, TEXT) FROM service_role;
-- DROP FUNCTION IF EXISTS admin_delete_audit_record(UUID, TEXT, TEXT);
-- DROP TABLE IF EXISTS ghost_runs;
-- DROP FUNCTION IF EXISTS validate_gate_results(JSONB);
