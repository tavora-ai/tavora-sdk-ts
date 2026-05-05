// Error types for the Tavora SDK. Mirrors tavora-sdk-go/errors.go so
// agents that switch SDKs find the same recovery primitives.
//
// Pre-customer change: `statusCode` is now `status` (shorter, matches
// HTTP terminology) and `details` captures structured fields the
// server returns alongside `code` and `message`. Use `asVersionConflict`
// to recover from optimistic-concurrency failures without parsing
// human-readable strings.

export class TavoraAPIError extends Error {
  readonly status: number;
  readonly code?: string;
  /** The raw server-supplied message — without the "tavora: ... (status
   *  N)" wrapper Error.message adds for human-readable logging. Use
   *  `apiMessage` when you want to render the server's text verbatim
   *  or compare against an exact string in tests. */
  readonly apiMessage: string;
  /** Server-supplied structured fields beyond code+message
   *  (e.g. `current_version` on a version_conflict). */
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    code?: string,
    details: Record<string, unknown> = {},
  ) {
    super(`tavora: ${message} (status ${status})`);
    this.name = 'TavoraAPIError';
    this.status = status;
    this.code = code;
    this.apiMessage = message;
    this.details = details;
  }
}

export function isNotFound(err: unknown): boolean {
  return err instanceof TavoraAPIError && err.status === 404;
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof TavoraAPIError && err.status === 401;
}

/** Typed view of a `version_conflict` error returned by uploadDocument
 *  when `ifVersion` doesn't match the latest live version of (store,
 *  name). `currentVersion` is what to re-read against before retrying. */
export interface VersionConflict {
  error: TavoraAPIError;
  currentVersion: number;
}

/** Returns a typed VersionConflict if and only if the server set
 *  code="version_conflict". Caller pattern:
 *
 *      const conflict = asVersionConflict(err);
 *      if (conflict) {
 *        // re-read at conflict.currentVersion and retry
 *      }
 */
export function asVersionConflict(err: unknown): VersionConflict | null {
  if (!(err instanceof TavoraAPIError) || err.code !== 'version_conflict') {
    return null;
  }
  const v = err.details['current_version'];
  const currentVersion = typeof v === 'number' ? v : 0;
  return { error: err, currentVersion };
}
