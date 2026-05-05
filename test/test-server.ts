// Mock fetch + request recorder used by the SDK unit tests. Intentionally
// tiny — mirrors the Go SDK's testhelper_test.go pattern: register canned
// responses per (method, path), record the requests the SDK actually
// sends so the asserts can check shape.

import { Client } from '../src/client.js';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  formData: FormData | null;
}

export interface CannedResponse {
  status: number;
  body: unknown; // serialized as JSON
  rawBody?: string; // takes precedence when set
  contentType?: string;
}

export class TestServer {
  readonly baseURL = 'http://test.invalid';
  private routes = new Map<string, CannedResponse>();
  readonly requests: RecordedRequest[] = [];

  on(method: string, path: string, status: number, body: unknown): void {
    this.routes.set(`${method} ${path}`, { status, body });
  }

  /** Match by method + path prefix (ignores query string). */
  onPath(method: string, pathPrefix: string, status: number, body: unknown): void {
    this.routes.set(`${method} ${pathPrefix}`, { status, body });
  }

  client(): Client {
    return new Client(this.baseURL, 'tvr_test', { fetch: this.fetch });
  }

  fetch: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const path = url.pathname; // ignore query for routing
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      headers[k] = v;
    });

    let body: string | null = null;
    let formData: FormData | null = null;
    const ct = req.headers.get('content-type') ?? '';
    if (ct.includes('multipart/form-data')) {
      formData = await req.clone().formData();
    } else {
      body = await req.clone().text();
    }
    this.requests.push({
      method: req.method,
      url: req.url,
      headers,
      body: body || null,
      formData,
    });

    // Try exact match first; then prefix match.
    let route = this.routes.get(`${req.method} ${path}`);
    if (!route) {
      for (const [key, val] of this.routes) {
        const [m, p] = key.split(' ', 2);
        if (m === req.method && path.startsWith(p ?? '')) {
          route = val;
          break;
        }
      }
    }
    if (!route) {
      return new Response(
        JSON.stringify({ message: `no route registered for ${req.method} ${path}` }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    }

    if (route.rawBody !== undefined) {
      return new Response(route.rawBody, {
        status: route.status,
        headers: { 'content-type': route.contentType ?? 'application/json' },
      });
    }
    // 204 (and 1xx/205/304) reject any body per the Fetch spec.
    const noBody = route.status === 204 || route.status === 304 || route.status === 205;
    return new Response(noBody ? null : JSON.stringify(route.body), {
      status: route.status,
      headers: { 'content-type': 'application/json' },
    });
  };

  lastRequest(): RecordedRequest {
    const r = this.requests.at(-1);
    if (!r) throw new Error('no requests recorded');
    return r;
  }
}
