// =============================================================================
// The Brain — Production Guards
// Phase 11: Production Readiness
// Kill-switch, daily caps, circuit breaker — all fail-closed
// =============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================================
// CONFIGURATION (Environment Variables)
// =============================================================================

/**
 * Production guard configuration
 * All values fail-closed (conservative defaults if not set)
 */
export interface GuardConfig {
  /** Global kill-switch: 'true' = reject all requests */
  killSwitch: boolean;
  /** Maximum runs per day (default: 1000) */
  dailyCap: number;
  /** Consecutive failures to trip circuit breaker (default: 5) */
  circuitBreakerThreshold: number;
  /** Time window to check for failures in ms (default: 300000 = 5 min) */
  circuitBreakerWindowMs: number;
  /** Production mode flag */
  isProduction: boolean;
}

/**
 * Load guard configuration from environment
 * Fail-closed: missing/invalid values use conservative defaults
 */
export function loadGuardConfig(): GuardConfig {
  const killSwitchRaw = Deno.env.get('GHOST_KILL_SWITCH') ?? '';
  const dailyCapRaw = Deno.env.get('GHOST_DAILY_CAP') ?? '';
  const circuitThresholdRaw = Deno.env.get('GHOST_CIRCUIT_BREAKER_THRESHOLD') ?? '';
  const circuitWindowRaw = Deno.env.get('GHOST_CIRCUIT_BREAKER_WINDOW_MS') ?? '';
  const modeRaw = Deno.env.get('GHOST_MODE_ENV') ?? 'production';

  // Parse with fail-closed defaults
  const dailyCap = parseInt(dailyCapRaw, 10);
  const circuitThreshold = parseInt(circuitThresholdRaw, 10);
  const circuitWindow = parseInt(circuitWindowRaw, 10);

  return {
    killSwitch: killSwitchRaw.toLowerCase() === 'true',
    dailyCap: isNaN(dailyCap) || dailyCap <= 0 ? 1000 : dailyCap,
    circuitBreakerThreshold: isNaN(circuitThreshold) || circuitThreshold <= 0 ? 5 : circuitThreshold,
    circuitBreakerWindowMs: isNaN(circuitWindow) || circuitWindow <= 0 ? 300_000 : circuitWindow,
    isProduction: modeRaw.toLowerCase() !== 'development',
  };
}

// =============================================================================
// GUARD RESULT TYPES
// =============================================================================

export type GuardErrorCode = 
  | 'GHOST_KILLED'
  | 'GHOST_DAILY_CAP_EXCEEDED'
  | 'GHOST_CIRCUIT_OPEN';

export interface GuardResult {
  allowed: boolean;
  errorCode?: GuardErrorCode;
  errorMessage?: string;
}

const GUARD_PASS: GuardResult = { allowed: true };

// =============================================================================
// KILL-SWITCH GUARD
// =============================================================================

/**
 * Check global kill-switch
 * Fail-closed: any error in checking = reject
 */
export function checkKillSwitch(config: GuardConfig): GuardResult {
  try {
    if (config.killSwitch) {
      return {
        allowed: false,
        errorCode: 'GHOST_KILLED',
        errorMessage: 'Service temporarily disabled',
      };
    }
    return GUARD_PASS;
  } catch {
    // Fail-closed
    return {
      allowed: false,
      errorCode: 'GHOST_KILLED',
      errorMessage: 'Service unavailable',
    };
  }
}

// =============================================================================
// DAILY CAP GUARD
// =============================================================================

/**
 * Check daily request cap
 * Queries ghost_runs table for today's count
 * Fail-closed: DB error = reject
 */
export async function checkDailyCap(
  config: GuardConfig,
  supabase: SupabaseClient
): Promise<GuardResult> {
  try {
    // Get start of today (UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // Count today's runs
    const { count, error } = await supabase
      .from('ghost_runs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayIso);

    if (error) {
      console.error('Daily cap check failed:', error);
      // Fail-closed
      return {
        allowed: false,
        errorCode: 'GHOST_DAILY_CAP_EXCEEDED',
        errorMessage: 'Unable to verify usage limits',
      };
    }

    const todayCount = count ?? 0;

    if (todayCount >= config.dailyCap) {
      return {
        allowed: false,
        errorCode: 'GHOST_DAILY_CAP_EXCEEDED',
        errorMessage: 'Daily request limit reached. Please try again tomorrow.',
      };
    }

    return GUARD_PASS;
  } catch (err) {
    console.error('Daily cap check exception:', err);
    // Fail-closed
    return {
      allowed: false,
      errorCode: 'GHOST_DAILY_CAP_EXCEEDED',
      errorMessage: 'Unable to verify usage limits',
    };
  }
}

// =============================================================================
// CIRCUIT BREAKER GUARD
// =============================================================================

/**
 * Check circuit breaker state
 * Trips if N consecutive recent requests failed (ABORTED status)
 * Fail-closed: DB error = reject
 */
export async function checkCircuitBreaker(
  config: GuardConfig,
  supabase: SupabaseClient
): Promise<GuardResult> {
  try {
    // Get timestamp for window start
    const windowStart = new Date(Date.now() - config.circuitBreakerWindowMs);
    const windowStartIso = windowStart.toISOString();

    // Get recent runs within window, ordered by most recent first
    const { data, error } = await supabase
      .from('ghost_runs')
      .select('final_status')
      .gte('created_at', windowStartIso)
      .order('created_at', { ascending: false })
      .limit(config.circuitBreakerThreshold);

    if (error) {
      console.error('Circuit breaker check failed:', error);
      // Fail-closed
      return {
        allowed: false,
        errorCode: 'GHOST_CIRCUIT_OPEN',
        errorMessage: 'Unable to verify system health',
      };
    }

    // If we have fewer runs than threshold, circuit is closed
    if (!data || data.length < config.circuitBreakerThreshold) {
      return GUARD_PASS;
    }

    // Check if all recent runs are ABORTED
    const allAborted = data.every(run => run.final_status === 'ABORTED');

    if (allAborted) {
      return {
        allowed: false,
        errorCode: 'GHOST_CIRCUIT_OPEN',
        errorMessage: 'Service experiencing issues. Please try again in a few minutes.',
      };
    }

    return GUARD_PASS;
  } catch (err) {
    console.error('Circuit breaker check exception:', err);
    // Fail-closed
    return {
      allowed: false,
      errorCode: 'GHOST_CIRCUIT_OPEN',
      errorMessage: 'Unable to verify system health',
    };
  }
}

// =============================================================================
// COMBINED GUARD CHECK
// =============================================================================

/**
 * Run all production guards in sequence
 * Short-circuits on first failure
 * Fail-closed throughout
 */
export async function runProductionGuards(
  supabase: SupabaseClient
): Promise<GuardResult> {
  const config = loadGuardConfig();

  // 1. Kill-switch (synchronous, no DB)
  const killResult = checkKillSwitch(config);
  if (!killResult.allowed) {
    return killResult;
  }

  // 2. Daily cap (requires DB)
  const capResult = await checkDailyCap(config, supabase);
  if (!capResult.allowed) {
    return capResult;
  }

  // 3. Circuit breaker (requires DB)
  const circuitResult = await checkCircuitBreaker(config, supabase);
  if (!circuitResult.allowed) {
    return circuitResult;
  }

  return GUARD_PASS;
}

// =============================================================================
// SUPABASE CLIENT FACTORY
// =============================================================================

/**
 * Create Supabase client for guard checks
 * Returns null if credentials missing (fail-closed at call site)
 */
export function createGuardClient(): SupabaseClient | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}
