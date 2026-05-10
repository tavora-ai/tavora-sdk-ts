import { TavoraAPIError } from './errors.js';
import type {
  Product,
  SeedProductResult,
  ProductMetrics,
  Index,
  CreateIndexInput,
  UpdateIndexInput,
  File as TavoraFile,
  UploadFileInput,
  ListFilesInput,
  ListFilesResult,
  Collection,
  CollectionDocument,
  FindCollectionInput,
  UpdateCollectionInput,
  RemoveCollectionInput,
  Document,
  ListDocumentsInput,
  ListDocumentsResult,
  UploadDocumentInput,
  GetDocumentByNameInput,
  SearchInput,
  SearchResult,
  DocumentSearchResult,
  ChatCompletionInput,
  ChatCompletionResult,
  Conversation,
  CreateConversationInput,
  ConversationDetail,
  SendMessageInput,
  SendMessageResult,
  AgentSession,
  AgentSessionDetail,
  CreateAgentSessionInput,
  AgentEvent,
  MCPServer,
  CreateMCPServerInput,
  UpdateMCPServerInput,
  TestMCPServerResult,
  Skill,
  CreateSkillInput,
  AgentConfig,
  AgentVersion,
  AgentDeployment,
  CreateAgentConfigInput,
  UpdateAgentConfigInput,
  CreateAgentVersionInput,
  UpsertDeploymentInput,
  ScheduledRun,
  CreateScheduledRunInput,
  EvalCase,
  CreateEvalCaseInput,
  EvalRun,
  EvalRunDetail,
  RunEvalInput,
  EvalSuite,
  EvalSuiteVersion,
  AgentPromotion,
  CreateSuiteInput,
  NewSuiteVersionInput,
  ProposePromotionInput,
  ToolPolicy,
  ApprovalRequest,
  UpsertToolPolicyInput,
  PromptTemplate,
  CreatePromptTemplateInput,
  UpdatePromptTemplateInput,
  StudioTrace,
  StudioReplayConfig,
  StudioFixRequest,
  StudioFixSuggestion,
  AuditListFilter,
  AuditListPage,
  AuditExportFilter,
} from './types.js';

export interface ClientOptions {
  /** Override the fetch implementation (useful for tests). Defaults to the platform `fetch`. */
  fetch?: typeof fetch;
}

export class Client {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  /**
   * Create a new Tavora SDK client.
   *
   * @param baseURL - Tavora API server (e.g. `https://api.tavora.ai`).
   * @param apiKey  - Product-scoped API key (starts with `tvr_`), created in the admin UI.
   */
  constructor(baseURL: string, apiKey: string, opts: ClientOptions = {}) {
    this.baseURL = baseURL.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error(
        'tavora: no fetch implementation found. Pass opts.fetch, or use Node 20+ / a modern browser.',
      );
    }
  }

  // ---- low-level ----

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('X-API-Key', this.apiKey);
    if (body !== undefined && !(body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await this.fetchImpl(`${this.baseURL}${path}`, {
      ...init,
      method,
      headers,
      body: body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    if (!res.ok) {
      let msg = res.statusText;
      let code: string | undefined;
      const details: Record<string, unknown> = {};
      try {
        const payload = (await res.json()) as Record<string, unknown>;
        if (typeof payload['message'] === 'string') msg = payload['message'];
        if (typeof payload['code'] === 'string') code = payload['code'];
        for (const [k, v] of Object.entries(payload)) {
          if (k !== 'message' && k !== 'code') details[k] = v;
        }
      } catch {
        // non-JSON error body
      }
      throw new TavoraAPIError(res.status, msg, code, details);
    }
    return (await res.json()) as T;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
  private patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }
  private put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }
  private del(path: string): Promise<void> {
    return this.request<void>('DELETE', path);
  }

  // ---- product ----

  /** Fetch the product bound to this client's API key. */
  getProduct(): Promise<Product> {
    return this.get<Product>('/api/sdk/space');
  }

  /** Ensure the product has the platform-invariant default agent
   *  (one agent + v1.0.0 version + minimal eval suite). Idempotent:
   *  if any agent already exists, returns `already_seeded: true` with
   *  no mutation. Equivalent to what signup runs after creating a
   *  brand-new product. */
  seedProduct(): Promise<SeedProductResult> {
    return this.post<SeedProductResult>('/api/sdk/product/seed');
  }

  // ---- metrics ----

  /** Aggregated metrics for the product (token usage, agent session
   *  counts, eval run aggregates). Useful for billing dashboards and
   *  health checks. */
  getMetrics(): Promise<ProductMetrics> {
    return this.get<ProductMetrics>('/api/sdk/metrics');
  }

  // ---- files (Storage) ----
  //
  // Raw blob storage. Distinct from documents (RAG-indexed) and
  // indexes (RAG containers). Sha256-keyed dedup on upload — re-
  // uploading identical bytes returns the existing File.

  /** Upload bytes. Server returns the existing File row when the same
   *  (product, content_sha256) exists; the SDK shape is the same
   *  either way — caller doesn't need to distinguish. */
  async uploadFile(input: UploadFileInput): Promise<TavoraFile> {
    const form = new FormData();
    const filename =
      input.filename ?? ('name' in input.file && typeof input.file.name === 'string'
        ? input.file.name
        : 'upload.bin');
    form.set('file', input.file, filename);
    if (input.filename !== undefined) form.set('filename', input.filename);
    return this.request<TavoraFile>('POST', '/api/sdk/files', form);
  }

  async listFiles(input: ListFilesInput = {}): Promise<ListFilesResult> {
    const params = new URLSearchParams();
    params.set('limit', String(input.limit && input.limit > 0 ? input.limit : 50));
    params.set('offset', String(input.offset ?? 0));
    if (input.contentType) params.set('content_type', input.contentType);
    if (input.contentSha256) params.set('content_sha256', input.contentSha256);
    if (input.includeDeleted) params.set('include_deleted', 'true');
    return this.get<ListFilesResult>(`/api/sdk/files?${params.toString()}`);
  }

  /** File metadata. For raw bytes use {@link getFileContent}. */
  getFile(id: string): Promise<TavoraFile> {
    return this.get<TavoraFile>(`/api/sdk/files/${id}`);
  }

  /** Stream the raw bytes. Returns a `Response` so the caller controls
   *  whether to .blob(), .arrayBuffer(), .text(), or pipe. */
  async getFileContent(id: string): Promise<Response> {
    const res = await this.fetchImpl(`${this.baseURL}/api/sdk/files/${id}/content`, {
      method: 'GET',
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) {
      let msg = res.statusText;
      let code: string | undefined;
      try {
        const payload = (await res.json()) as { message?: string; code?: string };
        msg = payload.message ?? msg;
        code = payload.code;
      } catch {
        // ignore non-JSON
      }
      throw new TavoraAPIError(res.status, msg, code);
    }
    return res;
  }

  /** Soft-delete (idempotent). For permanent removal use
   *  {@link deleteFileHard} — fails if any live document references
   *  the file (FK ON DELETE RESTRICT). */
  deleteFile(id: string): Promise<void> {
    return this.del(`/api/sdk/files/${id}`);
  }

  deleteFileHard(id: string): Promise<void> {
    return this.del(`/api/sdk/files/${id}?hard=true`);
  }

  // ---- indexes (RAG containers) ----

  async listIndexes(): Promise<Index[]> {
    const resp = await this.get<{ indexes: Index[] }>('/api/sdk/indexes');
    return resp.indexes;
  }
  async getIndex(id: string): Promise<Index> {
    const resp = await this.get<{ index: Index }>(`/api/sdk/indexes/${id}`);
    return resp.index;
  }
  createIndex(input: CreateIndexInput): Promise<Index> {
    return this.post<Index>('/api/sdk/indexes', input);
  }
  updateIndex(id: string, input: UpdateIndexInput): Promise<Index> {
    return this.patch<Index>(`/api/sdk/indexes/${id}`, input);
  }
  deleteIndex(id: string): Promise<void> {
    return this.del(`/api/sdk/indexes/${id}`);
  }

  // ---- collections ----
  // Mongo-style JSON document buckets the agent uses for typed working
  // memory. Distinct from `indexes` (RAG vectors) and from per-run `data`.
  // Filter operators: $gt, $gte, $lt, $lte, $ne, $in. Callbacks
  // (.onInsert/.onUpdate/.onRemove/.onQuery) are sandbox-only.

  async listCollections(): Promise<Collection[]> {
    const resp = await this.get<{ collections: Collection[] }>(
      '/api/sdk/collections',
    );
    return resp.collections;
  }

  /** Idempotently reserve a collection name. Returns the (possibly
   *  pre-existing) collection record. */
  async createCollection(name: string): Promise<Collection> {
    const resp = await this.post<{ collection: Collection }>(
      '/api/sdk/collections',
      { name },
    );
    return resp.collection;
  }

  /** Drop the bucket entirely (rows + metadata). Idempotent — dropping
   *  a missing collection is not an error. */
  dropCollection(name: string): Promise<void> {
    return this.del(`/api/sdk/collections/${encodeURIComponent(name)}`);
  }

  /** Insert one document; returns the server-assigned _id. */
  async insertCollectionDocument(
    name: string,
    document: CollectionDocument,
  ): Promise<number> {
    const resp = await this.post<{ id: number }>(
      `/api/sdk/collections/${encodeURIComponent(name)}/documents`,
      { document },
    );
    return resp.id;
  }

  /** Insert a batch in order; returns assigned _ids in the same order. */
  async insertCollectionDocuments(
    name: string,
    documents: CollectionDocument[],
  ): Promise<number[]> {
    const resp = await this.post<{ ids: number[] }>(
      `/api/sdk/collections/${encodeURIComponent(name)}/documents`,
      { documents },
    );
    return resp.ids;
  }

  /** Run a filter+opts query. Empty input returns every document. */
  async findCollectionDocuments(
    name: string,
    input: FindCollectionInput = {},
  ): Promise<CollectionDocument[]> {
    const resp = await this.post<{ documents: CollectionDocument[] }>(
      `/api/sdk/collections/${encodeURIComponent(name)}/find`,
      input,
    );
    return resp.documents;
  }

  /** Merge `updates` into every doc matching `filter`. Returns count touched. */
  async updateCollectionDocuments(
    name: string,
    input: UpdateCollectionInput,
  ): Promise<number> {
    const resp = await this.post<{ updated: number }>(
      `/api/sdk/collections/${encodeURIComponent(name)}/update`,
      input,
    );
    return resp.updated;
  }

  /** Delete every doc matching `filter`. Returns count removed. */
  async removeCollectionDocuments(
    name: string,
    input: RemoveCollectionInput,
  ): Promise<number> {
    const resp = await this.post<{ removed: number }>(
      `/api/sdk/collections/${encodeURIComponent(name)}/remove`,
      input,
    );
    return resp.removed;
  }

  // ---- documents ----

  /**
   * Upload a document to a store. Accepts a `Blob` (browser `File`, or
   * `new Blob([...])` in Node 20+). For filesystem paths in Node, use
   * `openAsBlob(path)` from `node:fs`.
   *
   * Provenance fields (`name`, `source`, `task`, `type`, `tags`,
   * `metadata`, `parentId`) round-trip through document metadata.
   * Setting `name` enables version-on-rewrite — re-uploading the same
   * (indexId, name) bumps `version` instead of creating a duplicate.
   * Pass `ifVersion` for optimistic concurrency (409 on mismatch).
   *
   * Indexable file types (.pdf, .md, .txt, .csv, .html, .docx, .xlsx,
   * images) get chunk + embed processing. Other types are stored opaque
   * (`status: "stored"`) — listable, fetchable, deletable, but not
   * semantically searchable.
   */
  async uploadDocument(input: UploadDocumentInput): Promise<Document> {
    const form = new FormData();
    form.set('index_id', input.indexId);
    const filename =
      input.filename ?? ('name' in input.file && typeof input.file.name === 'string'
        ? input.file.name
        : 'upload.bin');
    form.set('file', input.file, filename);

    if (input.name !== undefined) form.set('name', input.name);
    if (input.parentId !== undefined) form.set('parent_id', input.parentId);
    if (input.ifVersion !== undefined) form.set('if_version', String(input.ifVersion));

    const meta: Record<string, string> = { ...(input.metadata ?? {}) };
    if (input.source !== undefined) meta.source = input.source;
    if (input.task !== undefined) meta.task = input.task;
    if (input.type !== undefined) meta.type = input.type;
    if (input.tags) Object.assign(meta, input.tags);
    if (Object.keys(meta).length > 0) form.set('metadata', JSON.stringify(meta));

    return this.request<Document>(
      'POST',
      `/api/sdk/indexes/${input.indexId}/documents`,
      form,
    );
  }

  async listDocuments(input: ListDocumentsInput = {}): Promise<ListDocumentsResult> {
    const limit = input.limit && input.limit > 0 ? input.limit : 50;
    const offset = input.offset ?? 0;
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (input.q) params.set('q', input.q);
    if (input.source) params.set('source', input.source);
    if (input.includeDeleted) params.set('include_deleted', 'true');
    if (input.parentId) params.set('parent_id', input.parentId);
    if (input.derivedFrom) params.set('derived_from', input.derivedFrom);
    if (input.contentSha256) params.set('content_sha256', input.contentSha256);
    if (input.duplicateOf) params.set('duplicate_of', input.duplicateOf);
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        params.set(`metadata.${k}`, v);
      }
    }
    const base = input.indexId
      ? `/api/sdk/indexes/${input.indexId}/documents`
      : '/api/sdk/documents';
    return this.get<ListDocumentsResult>(`${base}?${params.toString()}`);
  }

  /** Fetch a document by ID. Soft-deleted documents return 404. */
  getDocument(id: string): Promise<Document> {
    return this.get<Document>(`/api/sdk/documents/${id}`);
  }

  /** Resolve the latest non-deleted version of (indexId, name), or a
   *  specific historical version when `version` is set. The agent-facing
   *  addressing primitive — "give me the current plan." */
  getDocumentByName(input: GetDocumentByNameInput): Promise<Document> {
    const path = `/api/sdk/indexes/${input.indexId}/documents/by-name/${encodeURIComponent(input.name)}`;
    return this.get<Document>(input.version !== undefined ? `${path}?version=${input.version}` : path);
  }

  /** All versions of (indexId, name), newest first, including
   *  soft-deleted ones — the artifact history. */
  async listDocumentVersions(indexId: string, name: string): Promise<Document[]> {
    const resp = await this.get<{ versions: Document[] }>(
      `/api/sdk/indexes/${indexId}/documents/by-name/${encodeURIComponent(name)}/versions`,
    );
    return resp.versions;
  }

  /** Soft-delete a document (sets `deleted_at` and clears `is_latest`).
   *  Use {@link deleteDocumentHard} for permanent removal. */
  deleteDocument(id: string): Promise<void> {
    return this.del(`/api/sdk/documents/${id}`);
  }

  /** Permanently delete a document and its on-disk file. Sparingly —
   *  soft-delete is the default for a reason. */
  deleteDocumentHard(id: string): Promise<void> {
    return this.del(`/api/sdk/documents/${id}?hard=true`);
  }

  /** Chunk-shaped semantic search. Use {@link searchDocuments} for
   *  document-shaped, server-deduped results. */
  async search(input: SearchInput): Promise<SearchResult[]> {
    const path = input.indexId
      ? `/api/sdk/indexes/${input.indexId}/search`
      : '/api/sdk/search';
    const resp = await this.post<{ results: SearchResult[] }>(path, {
      ...input,
      result_type: 'chunk',
    });
    return resp.results;
  }

  /** Document-shaped semantic search — one row per distinct document,
   *  ranked by best-chunk score, with that chunk inlined as a preview.
   *  Use when the agent's question is "what artifacts are about X"
   *  rather than "what passages are about X". */
  async searchDocuments(input: SearchInput): Promise<DocumentSearchResult[]> {
    const path = input.indexId
      ? `/api/sdk/indexes/${input.indexId}/search`
      : '/api/sdk/search';
    const resp = await this.post<{ results: DocumentSearchResult[] }>(path, {
      ...input,
      result_type: 'document',
    });
    return resp.results;
  }

  // ---- chat ----

  chatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult> {
    return this.post<ChatCompletionResult>('/api/sdk/chat/completions', input);
  }

  createConversation(input: CreateConversationInput = {}): Promise<Conversation> {
    return this.post<Conversation>('/api/sdk/conversations', input);
  }
  async listConversations(limit = 50, offset = 0): Promise<Conversation[]> {
    const resp = await this.get<{ conversations: Conversation[] }>(
      `/api/sdk/conversations?limit=${limit}&offset=${offset}`,
    );
    return resp.conversations;
  }
  getConversation(id: string): Promise<ConversationDetail> {
    return this.get<ConversationDetail>(`/api/sdk/conversations/${id}`);
  }
  deleteConversation(id: string): Promise<void> {
    return this.del(`/api/sdk/conversations/${id}`);
  }
  sendMessage(conversationID: string, input: SendMessageInput): Promise<SendMessageResult> {
    return this.post<SendMessageResult>(
      `/api/sdk/conversations/${conversationID}/messages`,
      input,
    );
  }

  // ---- agents ----

  async getAgentSystemPrompt(): Promise<string> {
    const resp = await this.get<{ prompt: string }>('/api/sdk/agents/system-prompt');
    return resp.prompt;
  }
  createAgentSession(input: CreateAgentSessionInput = {}): Promise<AgentSession> {
    return this.post<AgentSession>('/api/sdk/agents', input);
  }
  async listAgentSessions(limit = 50, offset = 0): Promise<AgentSession[]> {
    const resp = await this.get<{ sessions: AgentSession[] }>(
      `/api/sdk/agents?limit=${limit}&offset=${offset}`,
    );
    return resp.sessions;
  }
  getAgentSession(id: string): Promise<AgentSessionDetail> {
    return this.get<AgentSessionDetail>(`/api/sdk/agents/${id}`);
  }
  deleteAgentSession(id: string): Promise<void> {
    return this.del(`/api/sdk/agents/${id}`);
  }

  /** Resolve an `input_request` event so the paused SSE stream can
   *  continue. Encode `value` per the request's inputType:
   *    - "confirm" → boolean
   *    - "choice"  → string (one of the offered options)
   *    - "text"    → string
   *  The server matches by requestId; calling this for an
   *  already-resolved or unknown requestId returns 4xx. */
  respondToAgentInput(sessionID: string, requestID: string, value: unknown): Promise<void> {
    return this.request<void>(
      'POST',
      `/api/sdk/agents/${sessionID}/input`,
      { request_id: requestID, value },
    );
  }

  /**
   * Send a message to an agent session and stream execution events.
   *
   * Returns an async iterator yielding each `AgentEvent` from the SSE
   * stream, terminating on `done` or `error`. Abort the request by
   * passing an `AbortSignal` through `init.signal`.
   *
   * @example
   * ```ts
   * for await (const evt of client.runAgent(sessionId, 'Hello')) {
   *   if (evt.type === 'response') console.log(evt.content);
   * }
   * ```
   */
  async *runAgent(
    sessionID: string,
    message: string,
    init: { signal?: AbortSignal } = {},
  ): AsyncGenerator<AgentEvent, void, void> {
    const res = await this.fetchImpl(`${this.baseURL}/api/sdk/agents/${sessionID}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({ message }),
      signal: init.signal,
    });

    if (!res.ok) {
      let msg = res.statusText;
      let code: string | undefined;
      try {
        const payload = (await res.json()) as { message?: string; code?: string };
        msg = payload.message ?? msg;
        code = payload.code;
      } catch {
        // ignore non-JSON
      }
      throw new TavoraAPIError(res.status, msg, code);
    }

    const body = res.body;
    if (!body) return;

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6);
            try {
              const evt = JSON.parse(raw) as AgentEvent;
              yield evt;
              if (currentEvent === 'done' || currentEvent === 'error') return;
            } catch {
              // skip malformed frames
            }
            currentEvent = '';
          }
        }
      }
    } finally {
      reader.releaseLock?.();
    }
  }

  // ---- MCP servers ----

  async listMCPServers(): Promise<MCPServer[]> {
    const resp = await this.get<{ servers: MCPServer[] }>('/api/sdk/mcp-servers');
    return resp.servers;
  }
  getMCPServer(id: string): Promise<MCPServer> {
    return this.get<MCPServer>(`/api/sdk/mcp-servers/${id}`);
  }
  createMCPServer(input: CreateMCPServerInput): Promise<MCPServer> {
    return this.post<MCPServer>('/api/sdk/mcp-servers', input);
  }
  updateMCPServer(id: string, input: UpdateMCPServerInput): Promise<MCPServer> {
    return this.patch<MCPServer>(`/api/sdk/mcp-servers/${id}`, input);
  }
  deleteMCPServer(id: string): Promise<void> {
    return this.del(`/api/sdk/mcp-servers/${id}`);
  }
  /** Dial an MCP server, capture its tool list, and materialise a skill row. Returns drift vs the prior snapshot. */
  testMCPServer(id: string): Promise<TestMCPServerResult> {
    return this.post<TestMCPServerResult>(`/api/sdk/mcp-servers/${id}/test`);
  }

  // ---- skills ----

  async listSkills(): Promise<Skill[]> {
    const resp = await this.get<{ skills: Skill[] }>('/api/sdk/skills');
    return resp.skills;
  }
  getSkill(id: string): Promise<Skill> {
    return this.get<Skill>(`/api/sdk/skills/${id}`);
  }
  createSkill(input: CreateSkillInput): Promise<Skill> {
    return this.post<Skill>('/api/sdk/skills', input);
  }
  deleteSkill(id: string): Promise<void> {
    return this.del(`/api/sdk/skills/${id}`);
  }

  /** Fetch the canonical "how to write a Tavora skill module" guide as
   *  Markdown. The server generates the doc from live runtime
   *  introspection (registered primitives, reserved names), so the
   *  content stays in sync with the sandbox the skill will run in.
   *
   *  Intended use: tooling fetches this and prints it or writes it to a
   *  file the user hands to an LLM (e.g. Claude Code) for skill
   *  authoring. */
  async getSkillAuthoringGuide(): Promise<string> {
    const res = await this.fetchImpl(`${this.baseURL}/api/sdk/skills/authoring-guide`, {
      method: 'GET',
      headers: { 'X-API-Key': this.apiKey, Accept: 'text/markdown' },
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const payload = (await res.json()) as { message?: string };
        msg = payload.message ?? msg;
      } catch {
        // ignore non-JSON
      }
      throw new TavoraAPIError(res.status, msg);
    }
    return await res.text();
  }

  // ---- agent configs (Phase 11 versioned agents) ----

  createAgentConfig(input: CreateAgentConfigInput): Promise<AgentConfig> {
    return this.post<AgentConfig>('/api/sdk/agent-configs', input);
  }
  listAgentConfigs(): Promise<AgentConfig[]> {
    return this.get<AgentConfig[]>('/api/sdk/agent-configs');
  }
  getAgentConfig(agentID: string): Promise<AgentConfig> {
    return this.get<AgentConfig>(`/api/sdk/agent-configs/${agentID}`);
  }
  updateAgentConfig(agentID: string, input: UpdateAgentConfigInput): Promise<AgentConfig> {
    return this.patch<AgentConfig>(`/api/sdk/agent-configs/${agentID}`, input);
  }
  deleteAgentConfig(agentID: string): Promise<void> {
    return this.del(`/api/sdk/agent-configs/${agentID}`);
  }
  /** Pin an active version on the AgentConfig. Future phases will guard
   *  this behind eval-gated promotion. */
  setActiveAgentVersion(agentID: string, versionID: string): Promise<AgentConfig> {
    return this.put<AgentConfig>(`/api/sdk/agent-configs/${agentID}/active-version`, {
      version_id: versionID,
    });
  }

  createAgentVersion(agentID: string, input: CreateAgentVersionInput): Promise<AgentVersion> {
    return this.post<AgentVersion>(`/api/sdk/agent-configs/${agentID}/versions`, input);
  }
  listAgentVersions(agentID: string): Promise<AgentVersion[]> {
    return this.get<AgentVersion[]>(`/api/sdk/agent-configs/${agentID}/versions`);
  }
  getAgentVersion(agentID: string, versionID: string): Promise<AgentVersion> {
    return this.get<AgentVersion>(`/api/sdk/agent-configs/${agentID}/versions/${versionID}`);
  }

  upsertAgentDeployment(agentID: string, input: UpsertDeploymentInput): Promise<AgentDeployment> {
    return this.post<AgentDeployment>(`/api/sdk/agent-configs/${agentID}/deployments`, input);
  }
  listAgentDeployments(agentID: string): Promise<AgentDeployment[]> {
    return this.get<AgentDeployment[]>(`/api/sdk/agent-configs/${agentID}/deployments`);
  }

  // ---- scheduled runs ----

  async listScheduledRuns(): Promise<ScheduledRun[]> {
    const resp = await this.get<{ scheduled_runs: ScheduledRun[] }>('/api/sdk/scheduled-runs');
    return resp.scheduled_runs;
  }
  getScheduledRun(id: string): Promise<ScheduledRun> {
    return this.get<ScheduledRun>(`/api/sdk/scheduled-runs/${id}`);
  }
  createScheduledRun(input: CreateScheduledRunInput): Promise<ScheduledRun> {
    return this.post<ScheduledRun>('/api/sdk/scheduled-runs', input);
  }
  deleteScheduledRun(id: string): Promise<void> {
    return this.del(`/api/sdk/scheduled-runs/${id}`);
  }

  // ---- evals ----

  createEvalCase(input: CreateEvalCaseInput): Promise<EvalCase> {
    return this.post<EvalCase>('/api/sdk/evals', input);
  }
  async listEvalCases(): Promise<EvalCase[]> {
    const resp = await this.get<{ cases: EvalCase[] }>('/api/sdk/evals');
    return resp.cases;
  }
  deleteEvalCase(id: string): Promise<void> {
    return this.del(`/api/sdk/evals/${id}`);
  }
  runEval(input: RunEvalInput = {}): Promise<EvalRun> {
    return this.post<EvalRun>('/api/sdk/evals/run', input);
  }
  async listEvalRuns(): Promise<EvalRun[]> {
    const resp = await this.get<{ runs: EvalRun[] }>('/api/sdk/eval-runs');
    return resp.runs;
  }
  getEvalRun(id: string): Promise<EvalRunDetail> {
    return this.get<EvalRunDetail>(`/api/sdk/eval-runs/${id}`);
  }

  // ---- eval suites + promotions (Phase 12) ----

  createSuite(input: CreateSuiteInput): Promise<EvalSuite> {
    return this.post<EvalSuite>('/api/sdk/eval-suites', input);
  }
  listSuites(): Promise<EvalSuite[]> {
    return this.get<EvalSuite[]>('/api/sdk/eval-suites');
  }
  getSuite(suiteID: string): Promise<EvalSuite> {
    return this.get<EvalSuite>(`/api/sdk/eval-suites/${suiteID}`);
  }
  deleteSuite(suiteID: string): Promise<void> {
    return this.del(`/api/sdk/eval-suites/${suiteID}`);
  }
  /** Freeze the suite's case membership into an immutable version. Omit
   *  `case_ids` to inherit the suite's current active-version
   *  membership — the common bump-version path. */
  newSuiteVersion(suiteID: string, input: NewSuiteVersionInput = {}): Promise<EvalSuiteVersion> {
    return this.post<EvalSuiteVersion>(`/api/sdk/eval-suites/${suiteID}/versions`, input);
  }

  /** Propose pinning an agent version at a target. The returned
   *  promotion starts in `pending_eval`; the server-side eval runner
   *  drives it to `pending_approval` (or `failed_eval`) once the
   *  attached suite finishes. */
  proposePromotion(input: ProposePromotionInput): Promise<AgentPromotion> {
    return this.post<AgentPromotion>('/api/sdk/promotions', input);
  }
  approvePromotion(promotionID: string): Promise<AgentPromotion> {
    return this.post<AgentPromotion>(`/api/sdk/promotions/${promotionID}/approve`);
  }
  /** Reject a pending promotion. Reason must be non-empty. */
  rejectPromotion(promotionID: string, reason: string): Promise<AgentPromotion> {
    return this.post<AgentPromotion>(`/api/sdk/promotions/${promotionID}/reject`, { reason });
  }
  getPromotion(promotionID: string): Promise<AgentPromotion> {
    return this.get<AgentPromotion>(`/api/sdk/promotions/${promotionID}`);
  }
  listPendingPromotions(): Promise<AgentPromotion[]> {
    return this.get<AgentPromotion[]>('/api/sdk/promotions/pending');
  }

  // ---- tool policies + approvals (Phase 14) ----

  /** All policies for the product — product-defaults and
   *  per-version overrides interleaved. Caller filters by
   *  `agent_version_id == null` to see only defaults. */
  listToolPolicies(): Promise<ToolPolicy[]> {
    return this.get<ToolPolicy[]>('/api/sdk/tool-policies');
  }
  /** Create or update a policy row keyed by `(product, version, tool)`.
   *  Last-write-wins on concurrent upserts. */
  upsertToolPolicy(input: UpsertToolPolicyInput): Promise<ToolPolicy> {
    return this.put<ToolPolicy>('/api/sdk/tool-policies', input);
  }
  /** Remove a policy row. The tool falls back to any product-default
   *  row (when deleting a version-override) or to the code default
   *  (allow for most tools, deny for fetch). */
  deleteToolPolicy(policyID: string): Promise<void> {
    return this.del(`/api/sdk/tool-policies/${policyID}`);
  }

  /** Tool calls currently parked on an admin decision. Server caps
   *  `limit` at 500. */
  listPendingApprovals(limit = 0, offset = 0): Promise<ApprovalRequest[]> {
    let path = '/api/sdk/approval-requests/pending';
    if (limit > 0 || offset > 0) {
      path += `?limit=${limit}&offset=${offset}`;
    }
    return this.get<ApprovalRequest[]>(path);
  }
  /** Unblock a parked tool call. Returns 400 if already resolved. */
  approveApprovalRequest(approvalID: string): Promise<ApprovalRequest> {
    return this.post<ApprovalRequest>(`/api/sdk/approval-requests/${approvalID}/approve`);
  }
  /** Reject a parked tool call with a required reason. */
  rejectApprovalRequest(approvalID: string, reason: string): Promise<ApprovalRequest> {
    return this.post<ApprovalRequest>(`/api/sdk/approval-requests/${approvalID}/reject`, { reason });
  }

  // ---- prompt templates ----

  async listPromptTemplates(): Promise<PromptTemplate[]> {
    const resp = await this.get<{ templates: PromptTemplate[] }>('/api/sdk/prompt-templates');
    return resp.templates;
  }
  getPromptTemplate(id: string): Promise<PromptTemplate> {
    return this.get<PromptTemplate>(`/api/sdk/prompt-templates/${id}`);
  }
  createPromptTemplate(input: CreatePromptTemplateInput): Promise<PromptTemplate> {
    return this.post<PromptTemplate>('/api/sdk/prompt-templates', input);
  }
  updatePromptTemplate(id: string, input: UpdatePromptTemplateInput): Promise<PromptTemplate> {
    return this.patch<PromptTemplate>(`/api/sdk/prompt-templates/${id}`, input);
  }
  deletePromptTemplate(id: string): Promise<void> {
    return this.del(`/api/sdk/prompt-templates/${id}`);
  }

  // ---- studio ----

  /** Enriched trace for Studio debugging. Steps are unparsed so
   *  renderers can introspect the raw shape for each step_type. */
  getStudioTrace(sessionID: string): Promise<StudioTrace> {
    return this.get<StudioTrace>(`/api/sdk/studio/${sessionID}`);
  }

  /** Replay an agent session from a specific step. Returns an async
   *  iterator yielding each `AgentEvent` from the SSE stream — same
   *  shape as `runAgent`. The new session ID arrives via a
   *  `replay_started` event. */
  async *replayFromStep(
    sessionID: string,
    config: StudioReplayConfig,
    init: { signal?: AbortSignal } = {},
  ): AsyncGenerator<AgentEvent, void, void> {
    const res = await this.fetchImpl(`${this.baseURL}/api/sdk/studio/${sessionID}/replay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(config),
      signal: init.signal,
    });

    if (!res.ok) {
      let msg = res.statusText;
      let code: string | undefined;
      try {
        const payload = (await res.json()) as { message?: string; code?: string };
        msg = payload.message ?? msg;
        code = payload.code;
      } catch {
        // ignore non-JSON
      }
      throw new TavoraAPIError(res.status, msg, code);
    }

    const body = res.body;
    if (!body) return;

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6);
            try {
              const evt = JSON.parse(raw) as AgentEvent;
              yield evt;
              if (currentEvent === 'done' || currentEvent === 'error') return;
            } catch {
              // skip malformed frames
            }
            currentEvent = '';
          }
        }
      }
    } finally {
      reader.releaseLock?.();
    }
  }

  /** AI fix suggestion for a failed run. Server runs Gemini with the
   *  trace, returns prompt-change suggestions and an optional eval-case
   *  template you can land via `createEvalCase`. */
  analyzeFix(sessionID: string, req: StudioFixRequest): Promise<StudioFixSuggestion> {
    return this.post<StudioFixSuggestion>(`/api/sdk/studio/${sessionID}/analyze`, req);
  }

  // ---- audit log (Phase 13) ----

  /** Page through the product's audit log. All filter fields
   *  optional; server caps `limit` at 500. */
  listAuditLog(filter: AuditListFilter = {}): Promise<AuditListPage> {
    const q = new URLSearchParams();
    if (filter.action) q.set('action', filter.action);
    if (filter.actor_user_id) q.set('actor_user_id', filter.actor_user_id);
    if (filter.subject_type) q.set('subject_type', filter.subject_type);
    if (filter.from) q.set('from', filter.from);
    if (filter.to) q.set('to', filter.to);
    if (filter.limit && filter.limit > 0) q.set('limit', String(filter.limit));
    if (filter.offset && filter.offset > 0) q.set('offset', String(filter.offset));
    const qs = q.toString();
    return this.get<AuditListPage>(`/api/sdk/audit-log${qs ? '?' + qs : ''}`);
  }

  /** Bulk export the audit log as raw bytes (CSV or JSON). Callers
   *  typically write the bytes to disk for SOC2 evidence collection.
   *  Defaults to JSON if `format` is omitted. */
  async exportAuditLog(filter: AuditExportFilter = {}): Promise<Uint8Array> {
    const q = new URLSearchParams();
    q.set('format', filter.format ?? 'json');
    if (filter.action) q.set('action', filter.action);
    if (filter.subject_type) q.set('subject_type', filter.subject_type);
    if (filter.from) q.set('from', filter.from);
    if (filter.to) q.set('to', filter.to);
    const res = await this.fetchImpl(`${this.baseURL}/api/sdk/audit-log/export?${q}`, {
      method: 'GET',
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const payload = (await res.json()) as { message?: string };
        msg = payload.message ?? msg;
      } catch {
        // ignore non-JSON
      }
      throw new TavoraAPIError(res.status, msg);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}
