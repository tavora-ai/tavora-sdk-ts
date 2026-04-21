export class TavoraAPIError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(`tavora: ${message} (status ${statusCode})`);
    this.name = 'TavoraAPIError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isNotFound(err: unknown): boolean {
  return err instanceof TavoraAPIError && err.statusCode === 404;
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof TavoraAPIError && err.statusCode === 401;
}
