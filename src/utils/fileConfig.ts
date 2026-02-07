// =============================================================================
// The Brain — File Context Configuration (Batch 7)
// Constants for CEO file injection size guards and exclusions.
// =============================================================================

/** Maximum total characters across all project files */
export const MAX_TOTAL_FILE_CHARS = 50_000;

/** Maximum characters per single file */
export const MAX_SINGLE_FILE_CHARS = 20_000;

/** Characters to keep from file start when truncating */
export const FILE_TRUNCATION_KEEP_START = 8_000;

/** Characters to keep from file end when truncating */
export const FILE_TRUNCATION_KEEP_END = 2_000;

/**
 * File path patterns that are always excluded (security + noise).
 * Checked against the full relative path.
 */
export const EXCLUDED_PATH_PATTERNS: RegExp[] = [
  /^\.env/i,               // .env, .env.local, .env.production, etc.
  /[/\\]\.env/i,           // nested .env files
  /[/\\]node_modules[/\\]/i,
  /^node_modules[/\\]/i,
  /[/\\]dist[/\\]/i,
  /^dist[/\\]/i,
  /[/\\]build[/\\]/i,
  /^build[/\\]/i,
  /[/\\]\.git[/\\]/i,
  /^\.git[/\\]/i,
  /\.lock$/i,              // package-lock.json, yarn.lock, pnpm-lock.yaml
];

/**
 * File extensions that indicate binary content (not useful as text context).
 */
export const BINARY_EXTENSIONS: string[] = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.bz2',
  '.pdf', '.doc', '.docx',
  '.mp3', '.mp4', '.wav', '.avi',
  '.exe', '.dll', '.so', '.dylib',
];
