// =============================================================================
// The Brain — File Context Tests (Batch 7)
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  isFileExcluded,
  truncateFileContent,
  buildCeoFileContext,
} from '../utils/contextBuilder';
import type { FileEntry } from '../types/brain';

// =============================================================================
// isFileExcluded
// =============================================================================

describe('isFileExcluded', () => {
  it('blocks .env files', () => {
    expect(isFileExcluded('.env', '.env')).not.toBeNull();
    expect(isFileExcluded('.env.local', '.env.local')).not.toBeNull();
    expect(isFileExcluded('.env.production', '.env.production')).not.toBeNull();
  });

  it('blocks node_modules', () => {
    expect(isFileExcluded('index.js', 'node_modules/lodash/index.js')).not.toBeNull();
  });

  it('blocks dist directory', () => {
    expect(isFileExcluded('bundle.js', 'dist/bundle.js')).not.toBeNull();
  });

  it('blocks build directory', () => {
    expect(isFileExcluded('app.js', 'build/app.js')).not.toBeNull();
  });

  it('blocks .git directory', () => {
    expect(isFileExcluded('HEAD', '.git/HEAD')).not.toBeNull();
  });

  it('blocks lock files', () => {
    expect(isFileExcluded('yarn.lock', 'yarn.lock')).not.toBeNull();
    expect(isFileExcluded('composer.lock', 'composer.lock')).not.toBeNull();
  });

  it('blocks binary file extensions', () => {
    expect(isFileExcluded('logo.png', 'src/logo.png')).not.toBeNull();
    expect(isFileExcluded('font.woff2', 'fonts/font.woff2')).not.toBeNull();
  });

  it('allows TypeScript source files', () => {
    expect(isFileExcluded('brain.ts', 'src/types/brain.ts')).toBeNull();
  });

  it('allows package.json', () => {
    expect(isFileExcluded('package.json', 'package.json')).toBeNull();
  });

  it('allows README', () => {
    expect(isFileExcluded('README.md', 'README.md')).toBeNull();
  });

  it('allows config files', () => {
    expect(isFileExcluded('tsconfig.json', 'tsconfig.json')).toBeNull();
    expect(isFileExcluded('vitest.config.ts', 'vitest.config.ts')).toBeNull();
  });
});

// =============================================================================
// truncateFileContent
// =============================================================================

describe('truncateFileContent', () => {
  it('returns content unchanged if under limit', () => {
    const content = 'short file content';
    const result = truncateFileContent(content);
    expect(result.content).toBe(content);
    expect(result.isTruncated).toBe(false);
  });

  it('truncates large content preserving start and end', () => {
    const content = 'A'.repeat(25_000);
    const result = truncateFileContent(content);
    expect(result.isTruncated).toBe(true);
    expect(result.content).toContain('TRUNCATED');
    expect(result.content.length).toBeLessThan(content.length);
    // Should start with As and end with As
    expect(result.content.startsWith('A')).toBe(true);
    expect(result.content.endsWith('A')).toBe(true);
  });
});

// =============================================================================
// buildCeoFileContext
// =============================================================================

describe('buildCeoFileContext', () => {
  const makeFile = (name: string, content: string, path?: string): FileEntry => ({
    id: `test-${name}`,
    name,
    path: path ?? `src/${name}`,
    content,
    originalSize: content.length,
    isTruncated: false,
    addedAt: Date.now(),
  });

  it('returns empty string for no files', () => {
    expect(buildCeoFileContext([])).toBe('');
  });

  it('returns empty string for undefined/null-ish input', () => {
    expect(buildCeoFileContext(undefined as unknown as FileEntry[])).toBe('');
    expect(buildCeoFileContext(null as unknown as FileEntry[])).toBe('');
  });

  it('wraps files in correct delimiters', () => {
    const files = [makeFile('test.ts', 'const x = 1;')];
    const result = buildCeoFileContext(files);

    expect(result).toContain('CEO_FILE_CONTEXT_START');
    expect(result).toContain('CEO_FILE_CONTEXT_END');
    expect(result).toContain('--- FILE: src/test.ts');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('--- END FILE ---');
  });

  it('includes multiple files', () => {
    const files = [
      makeFile('a.ts', 'file A'),
      makeFile('b.ts', 'file B'),
    ];
    const result = buildCeoFileContext(files);

    expect(result).toContain('--- FILE: src/a.ts');
    expect(result).toContain('--- FILE: src/b.ts');
  });

  it('marks truncated files', () => {
    const file: FileEntry = {
      id: 'trunc',
      name: 'big.ts',
      path: 'src/big.ts',
      content: 'truncated content',
      originalSize: 25000,
      isTruncated: true,
      addedAt: Date.now(),
    };
    const result = buildCeoFileContext([file]);

    expect(result).toContain('TRUNCATED from 25000');
  });
});
