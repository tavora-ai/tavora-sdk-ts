// Shared types mirroring the Go SDK structs in sdk/*.go.
// Field names match the JSON tags on the Go side.

export interface Workspace {
  id: string;
  team_id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

// ---- stores ----

export interface Store {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreateStoreInput {
  name: string;
  description?: string;
}

export interface UpdateStoreInput {
  name: string;
  description?: string;
}

// ---- documents ----

export interface Document {
  id: string;
  workspace_id: string;
  store_id: string;
  filename: string;
  content_type: string;
  file_size: number;
  status: string;
  error_message: string | null;
  page_count: number | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface ListDocumentsInput {
  limit?: number;
  offset?: number;
  storeId?: string;
}

export interface ListDocumentsResult {
  data: Document[];
  total: number;
  has_more: boolean;
}

export interface UploadDocumentInput {
  storeId: string;
  /** File-like payload. In the browser pass a `File`; in Node use
   * `openAsBlob(path)` or `new Blob([await readFile(path)])`. */
  file: Blob;
  /** Optional filename override. Required when `file` is a bare `Blob`
   * (no `.name`). */
  filename?: string;
}

export interface SearchInput {
  query: string;
  storeId?: string;
  top_k?: number;
  min_score?: number;
}

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  filename: string;
  content: string;
  score: number;
  chunk_index: number;
}

// ---- chat ----

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatCompletionInput {
  model?: string;
  messages: ChatMessage[];
  use_rag?: boolean;
  store_id?: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResult {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: ChatCompletionUsage;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  title: string;
  system_prompt: string;
  model: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export interface CreateConversationInput {
  title?: string;
  system_prompt?: string;
  model?: string;
  metadata?: unknown;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: ConversationMessage[];
  token_usage: ChatCompletionUsage | null;
}

export interface SendMessageInput {
  content: string;
  use_rag?: boolean;
  store_id?: string;
}

export interface SendMessageResult {
  user_message: ConversationMessage;
  message: ConversationMessage;
  token_usage: ChatCompletionUsage;
}

// ---- agents ----

export interface AgentSession {
  id: string;
  workspace_id: string;
  title: string;
  system_prompt: string;
  model: string;
  tools_config: unknown;
  metadata: unknown;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AgentStep {
  id: string;
  session_id: string;
  step_index: number;
  step_type: string;
  content: string;
  tool_name: string;
  tool_args: unknown;
  duration_ms: number;
  created_at: string;
}

export interface AgentSessionDetail {
  session: AgentSession;
  steps: AgentStep[];
}

export interface CreateAgentSessionInput {
  title?: string;
  system_prompt?: string;
  model?: string;
  tools?: string[];
  metadata?: unknown;
}

export interface RunSummary {
  session_id: string;
  steps: number;
  tokens: {
    prompt: number;
    completion: number;
  };
}

export interface AgentEvent {
  type: string;
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  summary?: RunSummary;
}

// ---- MCP servers ----

export interface MCPServer {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  transport: string;
  auth_config: unknown;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_tested_at?: string | null;
  tool_count?: number;
  skill_enabled?: boolean | null;
}

export interface CreateMCPServerInput {
  name: string;
  url: string;
  transport?: string;
  auth_config?: unknown;
}

export interface UpdateMCPServerInput {
  name?: string;
  url?: string;
  transport?: string;
  auth_config?: unknown;
  enabled?: boolean;
}

export interface MCPToolSchema {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface MCPToolChange {
  name: string;
  what: string;
}

export interface MCPToolDrift {
  added: string[];
  removed: string[];
  changed: MCPToolChange[];
}

export interface TestMCPServerResult {
  skill: Record<string, unknown>;
  tools: MCPToolSchema[];
  drift: MCPToolDrift;
  is_first_test: boolean;
}
