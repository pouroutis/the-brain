// =============================================================================
// The Brain — Ghost Mode Canonicalization
// Phase 9B: Implements Phase 9A Rev 3 canonical serialization
// =============================================================================

import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';
import { encode as hexEncode } from 'https://deno.land/std@0.168.0/encoding/hex.ts';

/**
 * Snapshot configuration for audit trail
 */
export interface SnapshotConfig {
  ghost_config_version: string;
  gate_definitions_version: string;
  max_rounds: number;
  max_calls: number;
  max_tokens: number;
  synthesis_reserve: number;
  timeout_ms: number;
}

/**
 * Current snapshot configuration (Phase 8 LOCKED values)
 */
export const CURRENT_SNAPSHOT: SnapshotConfig = {
  ghost_config_version: '1.0.0',
  gate_definitions_version: '1.0.0',
  max_rounds: 2,
  max_calls: 6,
  max_tokens: 4000,
  synthesis_reserve: 1000,
  timeout_ms: 90000,
};

/**
 * Current fingerprint key version
 */
export const FINGERPRINT_KEY_VERSION = 'v1';

/**
 * Template version for audit trail
 */
export const TEMPLATE_VERSION = '1.0.0';

/**
 * Canonicalize snapshot configuration to JSON
 * Per Phase 9A Rev 3:
 * - Keys sorted alphabetically
 * - No whitespace (compact)
 * - Numbers as integers (no decimals)
 * - Strings in double quotes
 * - UTF-8 encoding
 */
export function canonicalizeSnapshot(config: SnapshotConfig): string {
  // Sort keys alphabetically and serialize compactly
  const sorted = {
    gate_definitions_version: config.gate_definitions_version,
    ghost_config_version: config.ghost_config_version,
    max_calls: config.max_calls,
    max_rounds: config.max_rounds,
    max_tokens: config.max_tokens,
    synthesis_reserve: config.synthesis_reserve,
    timeout_ms: config.timeout_ms,
  };
  return JSON.stringify(sorted);
}

/**
 * Compute SHA-256 hash of snapshot configuration
 */
export async function computeSnapshotHash(config: SnapshotConfig): Promise<string> {
  const canonical = canonicalizeSnapshot(config);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new TextDecoder().decode(hexEncode(new Uint8Array(hashBuffer)));
}

/**
 * Normalize prompt for fingerprinting
 * Per Phase 9A Rev 3: lowercase, trim, collapse whitespace
 */
export function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Compute HMAC-SHA256 decision fingerprint
 * Per Phase 9A Rev 3:
 * fingerprint = HMAC-SHA256(
 *   key: SERVER_AUDIT_SECRET_<version>,
 *   data: normalize(prompt) + "|" + template_version + "|" + snapshot_hash
 * )
 * 
 * @param prompt - User's original prompt
 * @param templateVersion - Version of prompts used
 * @param snapshotHash - Hash of system configuration
 * @param secretKey - Server audit secret (versioned)
 */
export async function computeDecisionFingerprint(
  prompt: string,
  templateVersion: string,
  snapshotHash: string,
  secretKey: string
): Promise<string> {
  const normalizedPrompt = normalizePrompt(prompt);
  const data = `${normalizedPrompt}|${templateVersion}|${snapshotHash}`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const messageData = encoder.encode(data);
  
  // Import key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Compute HMAC
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  
  return new TextDecoder().decode(hexEncode(new Uint8Array(signature)));
}

/**
 * Get the audit secret for the given key version
 */
export function getAuditSecret(keyVersion: string): string {
  // In production, these would be stored in Deno.env
  // Key rotation: add new versions here, keep old for verification
  const secrets: Record<string, string> = {
    v1: Deno.env.get('SERVER_AUDIT_SECRET_V1') ?? '',
  };
  
  const secret = secrets[keyVersion];
  if (!secret) {
    throw new Error(`Unknown fingerprint key version: ${keyVersion}`);
  }
  
  return secret;
}
