import { TavoraAPIError } from './errors.js';
import type {
  App,
  SeedAppResult,
  AppMetrics,
  Index,
  CreateIndexInput,
  UpdateIndexInput,
  MemoryStore,
  MemoryEntry,
  CreateMemoryStoreInput,
  UpdateMemoryStoreInput,
  SecretVault,
  RedactedSecret,
  CreateSecretVaultInput,
  UpdateSecretVaultInput,
  Tenant,
  ProvisionTenantInput,
  UpdateTenantInput,
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
  CreateAgentConfigInput,
  UpdateAgentConfigInput,
  CreateAgentVersionInput,
  DraftConfig,
  PublishResult,
  UpdateAgentSettingsInput,
  EvalRunResult,
  EvalTarget,
  ScheduledRun,
  UpdateScheduledRunInput,
  CreateScheduledRunInput,
  EvalCase,
  CreateEvalCaseInput,
  UpdateEvalCaseInput,
  EvalRun,
  EvalRunDetail,
  RunEvalInput,
  EvalSuite,
  EvalSuiteVersion,
  CreateSuiteInput,
  NewSuiteVersionInput,
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
   * @param apiKey  - App-scoped API key (starts with `tvr_`), created in the admin UI.
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
  private del<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // ---- app ----

  /** Fetch the app bound to this client's API key. */
  getApp(): Promise<App> {
    return this.get<App>('/api/sdk/space');
  }

  /** Ensure the app has the platform-invariant default agent
   *  (one agent + v1.0.0 version + minimal eval suite). Idempotent:
   *  if any agent already exists, returns `already_seeded: true` with
   *  no mutation. Equivalent to what signup runs after creating a
   *  brand-new app. */
  seedApp(): Promise<SeedAppResult> {
    return this.post<SeedAppResult>('/api/sdk/app/seed');
  }

  // ---- metrics ----

  /** Aggregated metrics for the app (token usage, agent session
   *  counts, eval run aggregates). Useful for billing dashboards and
   *  health checks. */
  getMetrics(): Promise<AppMetrics> {
    return this.get<AppMetrics>('/api/sdk/metrics');
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

  // ---- memory stores ----
  //
  // Named, app-scoped persistent key/value buckets the agent reads via
  // `remember()` / `recall()` / `memories()` when its session is pinned
  // to a store. Survives session end; legacy per-session `agent_memory`
  // stays ephemeral when no pin is set.

  async listMemoryStores(): Promise<MemoryStore[]> {
    const resp = await this.get<{ memory_stores: MemoryStore[] }>('/api/sdk/memory-stores');
    return resp.memory_stores;
  }
  getMemoryStore(id: string): Promise<MemoryStore> {
    return this.get<MemoryStore>(`/api/sdk/memory-stores/${id}`);
  }
  /** Create a memory store. 409 if the name already exists in the app. */
  createMemoryStore(input: CreateMemoryStoreInput): Promise<MemoryStore> {
    return this.post<MemoryStore>('/api/sdk/memory-stores', input);
  }
  /** Patch metadata. PATCH semantics: omitted Metadata preserves current. */
  updateMemoryStore(id: string, input: UpdateMemoryStoreInput): Promise<MemoryStore> {
    return this.patch<MemoryStore>(`/api/sdk/memory-stores/${id}`, input);
  }
  /** Delete the store and (by FK cascade) every entry inside it. */
  deleteMemoryStore(id: string): Promise<void> {
    return this.del(`/api/sdk/memory-stores/${id}`);
  }
  async listMemoryEntries(storeId: string): Promise<MemoryEntry[]> {
    const resp = await this.get<{ entries: MemoryEntry[] }>(`/api/sdk/memory-stores/${storeId}/entries`);
    return resp.entries;
  }
  /** Upsert (key, value) — inserts when absent, overwrites when present. */
  putMemoryEntry(storeId: string, key: string, value: string): Promise<MemoryEntry> {
    return this.put<MemoryEntry>(
      `/api/sdk/memory-stores/${storeId}/entries/${encodeURIComponent(key)}`,
      { value },
    );
  }
  /** Idempotent — 204 even when the entry is already absent. */
  deleteMemoryEntry(storeId: string, key: string): Promise<void> {
    return this.del(`/api/sdk/memory-stores/${storeId}/entries/${encodeURIComponent(key)}`);
  }

  // ---- secret vaults ----
  //
  // Envelope-encrypted, app-scoped vaults of named secrets the agent
  // reads via `secret(name)` in the sandbox when its session is pinned
  // to a vault. The SDK NEVER returns plaintext — set takes a value
  // and returns the redacted view; list returns redacted in bulk;
  // there's no get-plaintext endpoint by design. The only way to
  // retrieve a value is from inside an agent session.
  //
  // Endpoints return 503 when the server has no `TAVORA_SECRET_KEK`
  // configured (secret vaults disabled).

  async listSecretVaults(): Promise<SecretVault[]> {
    const resp = await this.get<{ secret_vaults: SecretVault[] }>('/api/sdk/secret-vaults');
    return resp.secret_vaults;
  }
  getSecretVault(id: string): Promise<SecretVault> {
    return this.get<SecretVault>(`/api/sdk/secret-vaults/${id}`);
  }
  createSecretVault(input: CreateSecretVaultInput): Promise<SecretVault> {
    return this.post<SecretVault>('/api/sdk/secret-vaults', input);
  }
  updateSecretVault(id: string, input: UpdateSecretVaultInput): Promise<SecretVault> {
    return this.patch<SecretVault>(`/api/sdk/secret-vaults/${id}`, input);
  }
  /** Deletes the vault and (by FK cascade) every secret inside it. Irreversible. */
  deleteSecretVault(id: string): Promise<void> {
    return this.del(`/api/sdk/secret-vaults/${id}`);
  }
  async listSecrets(vaultId: string): Promise<RedactedSecret[]> {
    const resp = await this.get<{ secrets: RedactedSecret[] }>(`/api/sdk/secret-vaults/${vaultId}/secrets`);
    return resp.secrets;
  }
  /** Encrypt + store. Fresh DEK + nonce on every write. Returns the redacted view. */
  putSecret(vaultId: string, name: string, value: string): Promise<RedactedSecret> {
    return this.put<RedactedSecret>(
      `/api/sdk/secret-vaults/${vaultId}/secrets/${encodeURIComponent(name)}`,
      { value },
    );
  }
  /** Idempotent — 204 even when absent. */
  deleteSecret(vaultId: string, name: string): Promise<void> {
    return this.del(`/api/sdk/secret-vaults/${vaultId}/secrets/${encodeURIComponent(name)}`);
  }

  // ---- tenant facade ----
  //
  // Customers pass an opaque `tenant_ref` string on session create and
  // the platform isolates state (memory, secrets, audit, future rate
  // limits) behind it. These endpoints exist for pre-provisioning + admin;
  // first-touch session-create auto-provisions.
  //
  // The platform never models the customer's user/org schema — the ref
  // is opaque, UTF-8, 1–256 bytes.

  async listTenants(): Promise<Tenant[]> {
    const resp = await this.get<{ tenants: Tenant[] }>('/api/sdk/tenants');
    return resp.tenants;
  }
  /** Get-or-lazy-create. Returns the same refs across calls — pin is stable. */
  getTenant(tenantRef: string): Promise<Tenant> {
    return this.get<Tenant>(`/api/sdk/tenants/${encodeURIComponent(tenantRef)}`);
  }
  /** Explicit pre-provision. Idempotent. */
  provisionTenant(input: ProvisionTenantInput): Promise<Tenant> {
    return this.post<Tenant>('/api/sdk/tenants', input);
  }
  /** Override pinned refs / metadata. Pointer-distinguished omit-vs-clear. */
  updateTenant(tenantRef: string, input: UpdateTenantInput): Promise<Tenant> {
    return this.patch<Tenant>(`/api/sdk/tenants/${encodeURIComponent(tenantRef)}`, input);
  }
  /** Soft-delete. Frees the canonical tenant_ref slot so a later session-create
   *  with the same ref lazy-creates a fresh tenant. */
  archiveTenant(tenantRef: string): Promise<void> {
    return this.del(`/api/sdk/tenants/${encodeURIComponent(tenantRef)}`);
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

  // ---- draft + publish (PR3 of agent simplification) ----

  /** Stage a complete proposed next-state in the agent's draft_config.
   *  The runtime is unaffected; the live config keeps serving sessions
   *  until publish. Body is the entire DraftConfig — partial merges
   *  are not supported. */
  updateAgentDraft(agentID: string, draft: DraftConfig): Promise<AgentConfig> {
    return this.patch<AgentConfig>(`/api/sdk/agent-configs/${agentID}/draft`, draft);
  }
  /** Clear the staged draft. Idempotent — discarding when no draft
   *  exists is a no-op (still audited). */
  discardAgentDraft(agentID: string): Promise<AgentConfig> {
    return this.del<AgentConfig>(`/api/sdk/agent-configs/${agentID}/draft`);
  }
  /** Promote the staged draft to live: appends an immutable
   *  agent_versions snapshot, mirrors the new live columns, clears
   *  draft_config, audits — all in one transaction. 409 when no
   *  draft is staged. */
  publishAgent(agentID: string): Promise<PublishResult> {
    return this.post<PublishResult>(`/api/sdk/agent-configs/${agentID}/publish`);
  }
  /** Publish a named historical version as the new live config. Same
   *  audit/version-append semantics as publishAgent — a revert is a
   *  publish whose source is an existing history row. */
  revertAgent(agentID: string, versionID: string): Promise<PublishResult> {
    return this.post<PublishResult>(`/api/sdk/agent-configs/${agentID}/revert`, {
      version_id: versionID,
    });
  }

  // ---- settings + advisory eval (PR5 of agent simplification) ----

  /** Patch per-agent operator settings. Pass `eval_suite_id: ""` to
   *  clear the pin; omit a field to leave it unchanged. */
  updateAgentSettings(agentID: string, input: UpdateAgentSettingsInput): Promise<AgentConfig> {
    return this.patch<AgentConfig>(`/api/sdk/agent-configs/${agentID}/settings`, input);
  }
  /** Trigger an advisory async eval against the agent's pinned suite.
   *  target="draft" uses the staged persona instead of the published
   *  one; pass undefined for the default (live). */
  runAgentEval(agentID: string, target?: EvalTarget): Promise<EvalRunResult> {
    const qs = target ? `?target=${encodeURIComponent(target)}` : '';
    return this.post<EvalRunResult>(`/api/sdk/agent-configs/${agentID}/eval-runs${qs}`);
  }
  /** Most-recent N eval runs for the agent's pinned suite. Default 5
   *  server-side; max 50. */
  listAgentEvalRuns(agentID: string, limit?: number): Promise<EvalRun[]> {
    const qs = limit && limit > 0 ? `?limit=${limit}` : '';
    return this.get<EvalRun[]>(`/api/sdk/agent-configs/${agentID}/eval-runs${qs}`);
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
  /** Edit name / cron / message / enabled on an existing scheduled run.
   *  Next-run timestamp is recomputed only when the cron expression
   *  changes; otherwise the schedule keeps its existing trigger. */
  updateScheduledRun(id: string, input: UpdateScheduledRunInput): Promise<ScheduledRun> {
    return this.patch<ScheduledRun>(`/api/sdk/scheduled-runs/${id}`, input);
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
  /** Edit prompt / criteria / config / threshold on an existing eval
   *  case. The case keeps its identity; suite-version memberships that
   *  reference it surface the updated content on the next run. */
  updateEvalCase(id: string, input: UpdateEvalCaseInput): Promise<EvalCase> {
    return this.patch<EvalCase>(`/api/sdk/evals/${id}`, input);
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

  // ---- eval suites ----

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

  // ---- tool policies + approvals (Phase 14) ----

  /** All policies for the app — app-defaults and
   *  per-version overrides interleaved. Caller filters by
   *  `agent_version_id == null` to see only defaults. */
  listToolPolicies(): Promise<ToolPolicy[]> {
    return this.get<ToolPolicy[]>('/api/sdk/tool-policies');
  }
  /** Create or update a policy row keyed by `(app, version, tool)`.
   *  Last-write-wins on concurrent upserts. */
  upsertToolPolicy(input: UpsertToolPolicyInput): Promise<ToolPolicy> {
    return this.put<ToolPolicy>('/api/sdk/tool-policies', input);
  }
  /** Remove a policy row. The tool falls back to any app-default
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

  /** Page through the app's audit log. All filter fields
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
