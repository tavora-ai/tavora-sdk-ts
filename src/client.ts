import { TavoraAPIError } from './errors.js';
import type {
  Workspace,
  Store,
  CreateStoreInput,
  UpdateStoreInput,
  Document,
  ListDocumentsInput,
  ListDocumentsResult,
  UploadDocumentInput,
  SearchInput,
  SearchResult,
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
   * @param apiKey  - Workspace-scoped API key (starts with `tvr_`), created in the admin UI.
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
      try {
        const payload = (await res.json()) as { message?: string; code?: string };
        msg = payload.message ?? msg;
        code = payload.code;
      } catch {
        // non-JSON error body
      }
      throw new TavoraAPIError(res.status, msg, code);
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

  // ---- workspace ----

  /** Fetch the workspace bound to this client's API key. */
  getWorkspace(): Promise<Workspace> {
    return this.get<Workspace>('/api/sdk/space');
  }

  // ---- stores ----

  async listStores(): Promise<Store[]> {
    const resp = await this.get<{ stores: Store[] }>('/api/sdk/stores');
    return resp.stores;
  }
  async getStore(id: string): Promise<Store> {
    const resp = await this.get<{ store: Store }>(`/api/sdk/stores/${id}`);
    return resp.store;
  }
  createStore(input: CreateStoreInput): Promise<Store> {
    return this.post<Store>('/api/sdk/stores', input);
  }
  updateStore(id: string, input: UpdateStoreInput): Promise<Store> {
    return this.patch<Store>(`/api/sdk/stores/${id}`, input);
  }
  deleteStore(id: string): Promise<void> {
    return this.del(`/api/sdk/stores/${id}`);
  }

  // ---- documents ----

  /**
   * Upload a document to a store. Accepts a `Blob` (browser `File`, or
   * `new Blob([...])` in Node 20+). For filesystem paths in Node, use
   * `openAsBlob(path)` from `node:fs`.
   */
  async uploadDocument(input: UploadDocumentInput): Promise<Document> {
    const form = new FormData();
    form.set('store_id', input.storeId);
    const filename =
      input.filename ?? ('name' in input.file && typeof input.file.name === 'string'
        ? input.file.name
        : 'upload.bin');
    form.set('file', input.file, filename);
    return this.request<Document>(
      'POST',
      `/api/sdk/stores/${input.storeId}/documents`,
      form,
    );
  }

  async listDocuments(input: ListDocumentsInput = {}): Promise<ListDocumentsResult> {
    const limit = input.limit && input.limit > 0 ? input.limit : 50;
    const offset = input.offset ?? 0;
    const path = input.storeId
      ? `/api/sdk/stores/${input.storeId}/documents?limit=${limit}&offset=${offset}`
      : `/api/sdk/documents?limit=${limit}&offset=${offset}`;
    return this.get<ListDocumentsResult>(path);
  }
  getDocument(id: string): Promise<Document> {
    return this.get<Document>(`/api/sdk/documents/${id}`);
  }
  deleteDocument(id: string): Promise<void> {
    return this.del(`/api/sdk/documents/${id}`);
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const path = input.storeId
      ? `/api/sdk/stores/${input.storeId}/search`
      : '/api/sdk/search';
    const resp = await this.post<{ results: SearchResult[] }>(path, input);
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
}
