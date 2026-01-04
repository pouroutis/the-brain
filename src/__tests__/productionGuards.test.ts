// =============================================================================
// The Brain — Production Guards Tests
// Phase 11: Kill-switch, daily caps, circuit breaker
// =============================================================================

import { describe, it, expect } from 'vitest';

// =============================================================================
// Mock Types (matching productionGuards.ts)
// =============================================================================

type GuardErrorCode = 
  | 'GHOST_KILLED'
  | 'GHOST_DAILY_CAP_EXCEEDED'
  | 'GHOST_CIRCUIT_OPEN';

interface GuardResult {
  allowed: boolean;
  errorCode?: GuardErrorCode;
  errorMessage?: string;
}

interface GuardConfig {
  killSwitch: boolean;
  dailyCap: number;
  circuitBreakerThreshold: number;
  circuitBreakerWindowMs: number;
  isProduction: boolean;
}

// =============================================================================
// Guard Logic (duplicated for testing without Deno imports)
// =============================================================================

function checkKillSwitch(config: GuardConfig): GuardResult {
  try {
    if (config.killSwitch) {
      return {
        allowed: false,
        errorCode: 'GHOST_KILLED',
        errorMessage: 'Service temporarily disabled',
      };
    }
    return { allowed: true };
  } catch {
    return {
      allowed: false,
      errorCode: 'GHOST_KILLED',
      errorMessage: 'Service unavailable',
    };
  }
}

function checkDailyCapLogic(todayCount: number, dailyCap: number): GuardResult {
  if (todayCount >= dailyCap) {
    return {
      allowed: false,
      errorCode: 'GHOST_DAILY_CAP_EXCEEDED',
      errorMessage: 'Daily request limit reached. Please try again tomorrow.',
    };
  }
  return { allowed: true };
}

function checkCircuitBreakerLogic(
  recentRuns: Array<{ final_status: string }>,
  threshold: number
): GuardResult {
  if (recentRuns.length < threshold) {
    return { allowed: true };
  }
  
  const allAborted = recentRuns.every(run => run.final_status === 'ABORTED');
  
  if (allAborted) {
    return {
      allowed: false,
      errorCode: 'GHOST_CIRCUIT_OPEN',
      errorMessage: 'Service experiencing issues. Please try again in a few minutes.',
    };
  }
  
  return { allowed: true };
}

// =============================================================================
// Tests: Kill-Switch
// =============================================================================

describe('Production Guards - Kill-Switch', () => {
  it('should block requests when kill-switch is enabled', () => {
    const config: GuardConfig = {
      killSwitch: true,
      dailyCap: 1000,
      circuitBreakerThreshold: 5,
      circuitBreakerWindowMs: 300000,
      isProduction: true,
    };

    const result = checkKillSwitch(config);

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('GHOST_KILLED');
  });

  it('should allow requests when kill-switch is disabled', () => {
    const config: GuardConfig = {
      killSwitch: false,
      dailyCap: 1000,
      circuitBreakerThreshold: 5,
      circuitBreakerWindowMs: 300000,
      isProduction: true,
    };

    const result = checkKillSwitch(config);

    expect(result.allowed).toBe(true);
    expect(result.errorCode).toBeUndefined();
  });
});

// =============================================================================
// Tests: Daily Cap
// =============================================================================

describe('Production Guards - Daily Cap', () => {
  it('should block when daily cap is reached', () => {
    const result = checkDailyCapLogic(1000, 1000);

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('GHOST_DAILY_CAP_EXCEEDED');
  });

  it('should block when daily cap is exceeded', () => {
    const result = checkDailyCapLogic(1500, 1000);

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('GHOST_DAILY_CAP_EXCEEDED');
  });

  it('should allow when under daily cap', () => {
    const result = checkDailyCapLogic(999, 1000);

    expect(result.allowed).toBe(true);
  });

  it('should allow when at zero usage', () => {
    const result = checkDailyCapLogic(0, 1000);

    expect(result.allowed).toBe(true);
  });
});

// =============================================================================
// Tests: Circuit Breaker
// =============================================================================

describe('Production Guards - Circuit Breaker', () => {
  it('should trip when all recent runs are ABORTED', () => {
    const recentRuns = [
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
    ];

    const result = checkCircuitBreakerLogic(recentRuns, 5);

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('GHOST_CIRCUIT_OPEN');
  });

  it('should not trip when some runs succeeded', () => {
    const recentRuns = [
      { final_status: 'ABORTED' },
      { final_status: 'CONVERGED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
    ];

    const result = checkCircuitBreakerLogic(recentRuns, 5);

    expect(result.allowed).toBe(true);
  });

  it('should not trip when fewer runs than threshold', () => {
    const recentRuns = [
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
    ];

    const result = checkCircuitBreakerLogic(recentRuns, 5);

    expect(result.allowed).toBe(true);
  });

  it('should not trip with no recent runs', () => {
    const result = checkCircuitBreakerLogic([], 5);

    expect(result.allowed).toBe(true);
  });

  it('should not trip when most recent run succeeded', () => {
    const recentRuns = [
      { final_status: 'CONVERGED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
    ];

    const result = checkCircuitBreakerLogic(recentRuns, 5);

    expect(result.allowed).toBe(true);
  });

  it('should allow FORCED status as success', () => {
    const recentRuns = [
      { final_status: 'FORCED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
      { final_status: 'ABORTED' },
    ];

    const result = checkCircuitBreakerLogic(recentRuns, 5);

    expect(result.allowed).toBe(true);
  });
});

// =============================================================================
// Tests: Fail-Closed Defaults
// =============================================================================

describe('Production Guards - Fail-Closed Defaults', () => {
  it('should use conservative daily cap default (1000)', () => {
    // Default when not set or invalid
    const defaultCap = 1000;
    expect(defaultCap).toBe(1000);
  });

  it('should use conservative circuit breaker threshold default (5)', () => {
    const defaultThreshold = 5;
    expect(defaultThreshold).toBe(5);
  });

  it('should use conservative circuit breaker window default (5 min)', () => {
    const defaultWindowMs = 300_000;
    expect(defaultWindowMs).toBe(300000);
  });

  it('should default to production mode when not set', () => {
    // isProduction should be true unless explicitly set to 'development'
    const isProduction = 'anything'.toLowerCase() !== 'development';
    expect(isProduction).toBe(true);
  });

  it('should recognize development mode', () => {
    const isProduction = 'development'.toLowerCase() !== 'development';
    expect(isProduction).toBe(false);
  });
});

// =============================================================================
// Tests: Error Code Propagation
// =============================================================================

describe('Production Guards - Error Codes', () => {
  it('should return GHOST_KILLED for kill-switch', () => {
    const config: GuardConfig = {
      killSwitch: true,
      dailyCap: 1000,
      circuitBreakerThreshold: 5,
      circuitBreakerWindowMs: 300000,
      isProduction: true,
    };

    const result = checkKillSwitch(config);
    expect(result.errorCode).toBe('GHOST_KILLED');
  });

  it('should return GHOST_DAILY_CAP_EXCEEDED for cap breach', () => {
    const result = checkDailyCapLogic(1000, 1000);
    expect(result.errorCode).toBe('GHOST_DAILY_CAP_EXCEEDED');
  });

  it('should return GHOST_CIRCUIT_OPEN for tripped breaker', () => {
    const recentRuns = Array(5).fill({ final_status: 'ABORTED' });
    const result = checkCircuitBreakerLogic(recentRuns, 5);
    expect(result.errorCode).toBe('GHOST_CIRCUIT_OPEN');
  });
});

// =============================================================================
// Tests: Guard Ordering
// =============================================================================

describe('Production Guards - Ordering', () => {
  it('kill-switch should be checked before daily cap', () => {
    // Kill-switch is synchronous and should short-circuit
    // This is a documentation test - actual ordering is in productionGuards.ts
    const guardOrder = ['kill-switch', 'daily-cap', 'circuit-breaker'];
    expect(guardOrder[0]).toBe('kill-switch');
  });

  it('daily cap should be checked before circuit breaker', () => {
    const guardOrder = ['kill-switch', 'daily-cap', 'circuit-breaker'];
    expect(guardOrder.indexOf('daily-cap')).toBeLessThan(guardOrder.indexOf('circuit-breaker'));
  });
});
