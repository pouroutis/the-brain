// =============================================================================
// The Brain — CORS Headers Utility
// Phase 9B: Explicit allowlist (no wildcards)
// =============================================================================

/**
 * Allowed origins for CORS
 * Per locked infra: explicit Vercel allowlist, no wildcards
 */
const ALLOWED_ORIGINS = [
  'https://the-brain-ten.vercel.app',
  'http://localhost:5173',  // Local development
  'http://localhost:3000',  // Alternative local port
];

/**
 * Get CORS headers for a specific origin
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  // Check if origin is in allowlist
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle CORS preflight requests
 */
export function handleCors(req: Request): Response | null {
  const origin = req.headers.get('origin');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }
  return null;
}

/**
 * Create JSON response with CORS headers
 */
export function jsonResponse(req: Request, data: unknown, status = 200): Response {
  const origin = req.headers.get('origin');
  
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create error response with CORS headers
 */
export function errorResponse(req: Request, message: string, status = 500): Response {
  return jsonResponse(req, { error: message }, status);
}
