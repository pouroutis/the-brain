// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Environment Configuration (Phase 3 — Integration)
// =============================================================================

/**
 * Environment configuration with safe fallbacks.
 * Uses Vite's import.meta.env for environment variables.
 *
 * Required env vars (in .env or .env.local):
 *   VITE_SUPABASE_URL=https://your-project.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-key (optional, not needed for Edge Functions)
 */

// -----------------------------------------------------------------------------
// Environment Variables
// -----------------------------------------------------------------------------

const getEnvVar = (key: string, fallback?: string): string => {
  const value = import.meta.env[key];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  console.warn(`[env] Missing environment variable: ${key}`);
  return '';
};

const getBoolEnvVar = (key: string, fallback: boolean = false): boolean => {
  const value = import.meta.env[key];
  if (value === undefined || value === '') {
    return fallback;
  }
  return value === 'true' || value === '1';
};

// -----------------------------------------------------------------------------
// Configuration Object
// -----------------------------------------------------------------------------

export const env = {
  /**
   * Supabase project URL
   * Example: https://fgjjbxznstbxqtcjmtzv.supabase.co
   */
  supabaseUrl: getEnvVar('VITE_SUPABASE_URL'),

  /**
   * Supabase anon key (optional for Edge Functions that don't require auth)
   */
  supabaseAnonKey: getEnvVar('VITE_SUPABASE_ANON_KEY', ''),

  /**
   * Whether we're in development mode
   */
  isDev: import.meta.env.DEV,

  /**
   * Whether we're in production mode
   */
  isProd: import.meta.env.PROD,

  /**
   * Force all advisors to respond
   * When true, ignores CALL_CLAUDE/CALL_GEMINI flags and always calls all 3 agents
   * Set to true via VITE_FORCE_ALL_ADVISORS=true to override gatekeeping
   * Default: false (gatekeeping enabled, tests pass)
   */
  forceAllAdvisors: getBoolEnvVar('VITE_FORCE_ALL_ADVISORS', false),

  /**
   * Project Discussion Mode
   * When true, injects project context into all agent prompts
   * Useful for discussing The Brain's own development
   * Default: false
   */
  projectDiscussionMode: getBoolEnvVar('VITE_PROJECT_DISCUSSION_MODE', false),
} as const;

// -----------------------------------------------------------------------------
// Derived Configuration
// -----------------------------------------------------------------------------

/**
 * Base URL for Supabase Edge Functions
 */
export const FUNCTIONS_BASE_URL = env.supabaseUrl
  ? `${env.supabaseUrl}/functions/v1`
  : '';

/**
 * Agent endpoint URLs
 */
export const AGENT_ENDPOINTS = {
  gpt: `${FUNCTIONS_BASE_URL}/openai-proxy`,
  claude: `${FUNCTIONS_BASE_URL}/anthropic-proxy`,
  gemini: `${FUNCTIONS_BASE_URL}/gemini-proxy`,
} as const;

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/**
 * Check if the environment is properly configured
 */
export function validateEnv(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!env.supabaseUrl) {
    errors.push('VITE_SUPABASE_URL is not set');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Log environment status (safe for console, no secrets)
 */
export function logEnvStatus(): void {
  const { valid, errors } = validateEnv();

  if (valid) {
    console.log('[env] Configuration valid');
    console.log(`[env] Supabase URL: ${env.supabaseUrl}`);
    console.log(`[env] Functions base: ${FUNCTIONS_BASE_URL}`);
    console.log(`[env] Force all advisors: ${env.forceAllAdvisors}`);
    console.log(`[env] Project discussion mode: ${env.projectDiscussionMode}`);
  } else {
    console.error('[env] Configuration errors:', errors);
  }
}
