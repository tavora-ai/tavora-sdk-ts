// Documents SDK parity tests. Mirrors tavora-sdk-go/documents_test.go —
// every assertion that exists on the Go side has a TS equivalent so
// drift between the two SDKs is caught at unit-test time, not in
// production.

import { describe, expect, it } from 'vitest';
import { TavoraAPIError } from '../src/errors.js';
import type { Document, DocumentSearchResult, SearchResult } from '../src/types.js';
import { TestServer } from './test-server.js';

describe('listDocuments', () => {
  it('returns the parsed page and sends limit/offset defaults', async () => {
    const ts = new TestServer();
    ts.on('GET', '/api/sdk/documents', 200, {
      data: [{ id: 'doc_1', filename: 'readme.md' } as Document],
      total: 1,
      has_more: false,
    });

    const res = await ts.client().listDocuments();

    expect(res.total).toBe(1);
    expect(res.data[0]?.filename).toBe('readme.md');
    const url = new URL(ts.lastRequest().url);
    expect(url.pathname).toBe('/api/sdk/documents');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('offset')).toBe('0');
  });

  it('forwards every filter to the query string', async () => {
    const ts = new TestServer();
    ts.on('GET', '/api/sdk/stores/st_1/documents', 200, {
      data: [],
      total: 0,
      has_more: false,
    });

    await ts.client().listDocuments({
      storeId: 'st_1',
      limit: 10,
      offset: 5,
      q: 'readme',
      source: 'claude-code',
      metadata: { task: 'refactor' },
      parentId: 'parent-uuid',
      derivedFrom: 'extraction',
      contentSha256: 'abc123',
      duplicateOf: 'dup-uuid',
      includeDeleted: true,
    });

    const url = new URL(ts.lastRequest().url);
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('offset')).toBe('5');
    expect(url.searchParams.get('q')).toBe('readme');
    expect(url.searchParams.get('source')).toBe('claude-code');
    expect(url.searchParams.get('metadata.task')).toBe('refactor');
    expect(url.searchParams.get('parent_id')).toBe('parent-uuid');
    expect(url.searchParams.get('derived_from')).toBe('extraction');
    expect(url.searchParams.get('content_sha256')).toBe('abc123');
    expect(url.searchParams.get('duplicate_of')).toBe('dup-uuid');
    expect(url.searchParams.get('include_deleted')).toBe('true');
  });
});

describe('getDocumentByName', () => {
  it('hits the by-name endpoint and resolves latest by default', async () => {
    const ts = new TestServer();
    ts.on('GET', '/api/sdk/stores/st_1/documents/by-name/current_plan', 200, {
      id: 'doc_42',
      name: 'current_plan',
      version: 3,
    } as Document);

    const doc = await ts.client().getDocumentByName({
      storeId: 'st_1',
      name: 'current_plan',
    });

    expect(doc.id).toBe('doc_42');
    expect(doc.version).toBe(3);
    const url = new URL(ts.lastRequest().url);
    expect(url.pathname).toBe('/api/sdk/stores/st_1/documents/by-name/current_plan');
    expect(url.searchParams.get('version')).toBeNull();
  });

  it('passes the version param when pinned', async () => {
    const ts = new TestServer();
    ts.on('GET', '/api/sdk/stores/st_1/documents/by-name/current_plan', 200, {
      id: 'doc_42',
      version: 2,
    } as Document);

    await ts.client().getDocumentByName({
      storeId: 'st_1',
      name: 'current_plan',
      version: 2,
    });

    const url = new URL(ts.lastRequest().url);
    expect(url.searchParams.get('version')).toBe('2');
  });

  it('URL-encodes names with special characters', async () => {
    const ts = new TestServer();
    ts.on('GET', '/api/sdk/stores/st_1/documents/by-name/sub%2Fname', 200, {
      id: 'x',
    } as Document);

    await ts.client().getDocumentByName({
      storeId: 'st_1',
      name: 'sub/name',
    });

    const url = new URL(ts.lastRequest().url);
    expect(url.pathname).toBe('/api/sdk/stores/st_1/documents/by-name/sub%2Fname');
  });
});

describe('listDocumentVersions', () => {
  it('unwraps the `versions` envelope', async () => {
    const ts = new TestServer();
    ts.on(
      'GET',
      '/api/sdk/stores/st_1/documents/by-name/current_plan/versions',
      200,
      {
        versions: [
          { id: 'doc_43', version: 2, is_latest: true },
          { id: 'doc_42', version: 1, is_latest: false },
        ] as Document[],
      },
    );

    const versions = await ts.client().listDocumentVersions('st_1', 'current_plan');
    expect(versions).toHaveLength(2);
    expect(versions[0]?.version).toBe(2);
  });
});

describe('uploadDocument', () => {
  it('encodes provenance + name into the multipart body', async () => {
    const ts = new TestServer();
    ts.on('POST', '/api/sdk/stores/st_1/documents', 201, {
      id: 'doc_new',
      store_id: 'st_1',
      filename: 'plan.md',
    } as Document);

    const file = new Blob(['# plan\n'], { type: 'text/markdown' });
    await ts.client().uploadDocument({
      storeId: 'st_1',
      file,
      filename: 'plan.md',
      name: 'current_plan',
      source: 'claude-code',
      task: 'refactor-auth',
      tags: { branch: 'main' },
      metadata: { extra: 'value' },
    });

    const req = ts.lastRequest();
    expect(req.method).toBe('POST');
    expect(req.formData).not.toBeNull();
    const fd = req.formData!;
    expect(fd.get('store_id')).toBe('st_1');
    expect(fd.get('name')).toBe('current_plan');
    const meta = JSON.parse(fd.get('metadata') as string) as Record<string, string>;
    expect(meta.source).toBe('claude-code');
    expect(meta.task).toBe('refactor-auth');
    expect(meta.branch).toBe('main');
    expect(meta.extra).toBe('value');
  });

  it('forwards if_version for optimistic concurrency', async () => {
    const ts = new TestServer();
    ts.on('POST', '/api/sdk/stores/st_1/documents', 201, { id: 'x' } as Document);

    await ts.client().uploadDocument({
      storeId: 'st_1',
      file: new Blob(['v3'], { type: 'text/markdown' }),
      filename: 'plan.md',
      name: 'current_plan',
      ifVersion: 2,
    });

    const fd = ts.lastRequest().formData!;
    expect(fd.get('if_version')).toBe('2');
  });

  it('surfaces structured server errors with code and details', async () => {
    const ts = new TestServer();
    ts.on('POST', '/api/sdk/stores/st_1/documents', 409, {
      code: 'version_conflict',
      message: 'if_version does not match current version',
      current_version: 7,
    });

    await expect(
      ts.client().uploadDocument({
        storeId: 'st_1',
        file: new Blob(['v100']),
        filename: 'plan.md',
        name: 'current_plan',
        ifVersion: 99,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'version_conflict',
    });
  });
});

describe('deleteDocument', () => {
  it('soft-deletes by default (no ?hard=true)', async () => {
    const ts = new TestServer();
    ts.on('DELETE', '/api/sdk/documents/doc_1', 204, null);

    await ts.client().deleteDocument('doc_1');

    const url = new URL(ts.lastRequest().url);
    expect(url.searchParams.has('hard')).toBe(false);
  });

  it('passes hard=true for permanent deletion', async () => {
    const ts = new TestServer();
    ts.on('DELETE', '/api/sdk/documents/doc_1', 204, null);

    await ts.client().deleteDocumentHard('doc_1');

    const url = new URL(ts.lastRequest().url);
    expect(url.searchParams.get('hard')).toBe('true');
  });
});

describe('search', () => {
  it('forces result_type=chunk and unwraps results', async () => {
    const ts = new TestServer();
    ts.on('POST', '/api/sdk/search', 200, {
      results: [
        {
          chunk_id: 'ch_1',
          document_id: 'doc_1',
          filename: 'plan.md',
          document_name: 'plan',
          document_metadata: { source: 'claude-code' },
          content: 'hello world',
          score: 0.95,
          chunk_index: 0,
          metadata: {},
        } as SearchResult,
      ],
    });

    const hits = await ts.client().search({ query: 'hello', top_k: 5 });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.document_name).toBe('plan');
    expect(hits[0]?.document_metadata.source).toBe('claude-code');
    const body = JSON.parse(ts.lastRequest().body!) as {
      query: string;
      result_type: string;
    };
    expect(body.query).toBe('hello');
    expect(body.result_type).toBe('chunk');
  });
});

describe('searchDocuments', () => {
  it('sends result_type=document and parses the document-shaped result', async () => {
    const ts = new TestServer();
    ts.on('POST', '/api/sdk/search', 200, {
      results: [
        {
          document_id: 'doc_1',
          store_id: 'st_1',
          filename: 'plan.md',
          document_name: 'plan',
          document_metadata: { source: 'claude-code' },
          parent_id: null,
          content_sha256: 'abc',
          score: 0.88,
          best_chunk: { chunk_id: 'ch_1', chunk_index: 0, preview: '# plan' },
        } as DocumentSearchResult,
      ],
    });

    const hits = await ts.client().searchDocuments({ query: 'plan' });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.score).toBe(0.88);
    expect(hits[0]?.best_chunk.preview).toBe('# plan');
    const body = JSON.parse(ts.lastRequest().body!) as { result_type: string };
    expect(body.result_type).toBe('document');
  });
});

describe('TavoraAPIError', () => {
  it('captures status, code, and message from the response body', async () => {
    const ts = new TestServer();
    ts.on('GET', '/api/sdk/documents/missing', 404, {
      code: 'NOT_FOUND',
      message: 'document not found',
    });

    try {
      await ts.client().getDocument('missing');
      throw new Error('expected error');
    } catch (err) {
      expect(err).toBeInstanceOf(TavoraAPIError);
      const apiErr = err as TavoraAPIError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe('NOT_FOUND');
      expect(apiErr.apiMessage).toBe('document not found');
    }
  });
});
