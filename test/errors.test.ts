// TS error helpers — mirrors tavora-sdk-go/errors_test.go.

import { describe, expect, it } from 'vitest';
import {
  TavoraAPIError,
  asVersionConflict,
  isNotFound,
  isUnauthorized,
} from '../src/errors.js';

describe('TavoraAPIError', () => {
  it('captures status, code, apiMessage and details from the constructor', () => {
    const err = new TavoraAPIError(409, 'if_version mismatch', 'version_conflict', {
      current_version: 7,
    });
    expect(err.status).toBe(409);
    expect(err.code).toBe('version_conflict');
    expect(err.apiMessage).toBe('if_version mismatch');
    expect(err.details['current_version']).toBe(7);
    // Error.message wraps for human-readable logging.
    expect(err.message).toContain('if_version mismatch');
    expect(err.message).toContain('409');
  });

  it('defaults details to an empty object', () => {
    const err = new TavoraAPIError(500, 'boom');
    expect(err.details).toEqual({});
  });
});

describe('asVersionConflict', () => {
  it('extracts currentVersion from a version_conflict error', () => {
    const err = new TavoraAPIError(409, 'mismatch', 'version_conflict', {
      current_version: 3,
    });
    const conflict = asVersionConflict(err);
    expect(conflict).not.toBeNull();
    expect(conflict!.currentVersion).toBe(3);
    expect(conflict!.error).toBe(err);
  });

  it('returns null for non-conflict API errors', () => {
    const err = new TavoraAPIError(404, 'missing', 'NOT_FOUND');
    expect(asVersionConflict(err)).toBeNull();
  });

  it('returns null for non-API errors', () => {
    expect(asVersionConflict(new Error('plain error'))).toBeNull();
    expect(asVersionConflict(undefined)).toBeNull();
    expect(asVersionConflict(null)).toBeNull();
  });

  it('treats missing/non-numeric current_version as 0 rather than throwing', () => {
    const err = new TavoraAPIError(409, 'no version field', 'version_conflict');
    expect(asVersionConflict(err)?.currentVersion).toBe(0);
  });
});

describe('isNotFound / isUnauthorized', () => {
  it('matches on status code', () => {
    expect(isNotFound(new TavoraAPIError(404, 'x'))).toBe(true);
    expect(isNotFound(new TavoraAPIError(401, 'x'))).toBe(false);
    expect(isUnauthorized(new TavoraAPIError(401, 'x'))).toBe(true);
    expect(isUnauthorized(new TavoraAPIError(404, 'x'))).toBe(false);
  });

  it('returns false for non-API errors without throwing', () => {
    expect(isNotFound(new Error('whatever'))).toBe(false);
    expect(isUnauthorized('not an error')).toBe(false);
  });
});
