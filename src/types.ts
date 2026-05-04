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

/** Result of POST /api/sdk/workspace/seed. Idempotent: when the
 *  workspace already had any agent, `already_seeded` is true and no
 *  mutation happens. */
export interface SeedWorkspaceResult {
  already_seeded: boolean;
  agent_id?: string;
  agent_name?: string;
}

// ---- metrics ----

export interface TokenMetrics {
  prompt_tokens: number;
  candidate_tokens: number;
  total_tokens: number;
  request_count: number;
}

export interface AgentMetrics {
  total_sessions: number;
  active_sessions: number;
  completed_sessions: number;
  error_sessions: number;
  total_steps: number;
}

export interface EvalMetrics {
  total_runs: number;
  completed_runs: number;
  total_passed: number;
  total_failed: number;
  average_score: number;
}

export interface WorkspaceMetrics {
  tokens: TokenMetrics;
  agents: AgentMetrics;
  evals: EvalMetrics;
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
  /** Pin the session to an immutable agent version. When set, the
   *  runtime resolves persona, model, and skills_json filtering from
   *  the version, and any inline title/system_prompt/tools you also
   *  pass act as overrides only. Omit for an ad-hoc session. */
  agent_version_id?: string;
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

// ---- skills ----

export interface Skill {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  /** "prompt" | "webhook" | "module" | "mcp" */
  type: string;
  prompt: string;
  config: unknown;
  parameters: unknown;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  type?: string;
  prompt?: string;
  config?: unknown;
  parameters?: unknown;
}

// ---- agent configs (versioned agents, Phase 11) ----

export interface AgentConfig {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  created_by: string;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

/** SkillBinding pins a skill at a specific version inside an AgentVersion. */
export interface SkillBinding {
  skill_id: string;
  version: string;
}

/** AgentVersion is an immutable snapshot of an AgentConfig. */
export interface AgentVersion {
  id: string;
  agent_id: string;
  semver: string;
  persona_md: string;
  /** JSON-serialized array of SkillBinding. Read with `JSON.parse(version.skills_json as string)`
   *  on the client; servers that already parsed return an array. Type left unknown
   *  to bridge both call paths. */
  skills_json: unknown;
  /** JSON-serialized array of store IDs. Same caveat as skills_json. */
  stores_json: unknown;
  provider: string;
  model: string;
  eval_suite_id: string | null;
  eval_suite_version: string | null;
  created_by: string;
  created_at: string;
}

export interface AgentDeployment {
  id: string;
  agent_id: string;
  version_id: string;
  /** "api" | "channel_binding" | "none" */
  target_type: string;
  target_ref: string;
  status: string;
  deployed_by: string;
  deployed_at: string;
}

export interface CreateAgentConfigInput {
  name: string;
  description?: string;
}

export interface UpdateAgentConfigInput {
  name: string;
  description?: string;
}

/** When `from_version_id` is set the server performs copy-on-write from
 *  that version (non-empty fields here override; zero fields inherit).
 *  Otherwise a stand-alone version is created and `model` is required. */
export interface CreateAgentVersionInput {
  from_version_id?: string;
  /** auto-bumps if empty */
  semver?: string;
  persona_md?: string;
  skills?: SkillBinding[];
  stores?: string[];
  provider?: string;
  model?: string;
  eval_suite_id?: string;
  eval_suite_version?: string;
}

export interface UpsertDeploymentInput {
  version_id: string;
  /** defaults to "api" */
  target_type?: string;
  target_ref?: string;
}

// ---- scheduled runs ----

export interface ScheduledRun {
  id: string;
  workspace_id: string;
  agent_session_id: string;
  name: string;
  cron_expression: string;
  message: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  last_error: string;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduledRunInput {
  agent_session_id: string;
  name?: string;
  cron_expression: string;
  message: string;
}

// ---- evals ----

export interface EvalCase {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  set_name: string;
  type: string;
  config: unknown;
  prompt: string;
  criteria: string;
  system_prompt: string;
  tools: unknown;
  pass_threshold: number;
  created_at: string;
}

export interface CreateEvalCaseInput {
  name: string;
  description?: string;
  set_name?: string;
  type?: string;
  config?: unknown;
  prompt: string;
  criteria: string;
  system_prompt?: string;
  tools?: string[];
  pass_threshold?: number;
}

export interface EvalRun {
  id: string;
  status: string;
  total_cases: number;
  passed: number;
  failed: number;
  average_score: number;
  judge_model: string;
  created_at: string;
}

export interface EvalResult {
  id: string;
  case_name: string;
  set_name: string;
  score: number;
  pass: boolean;
  reasoning: string;
  response: string;
  tool_calls: unknown;
  duration_ms: number;
  error: string;
}

export interface EvalRunDetail {
  run: EvalRun;
  results: EvalResult[];
}

export interface RunEvalInput {
  set_filter?: string;
  judge_model?: string;
}

// ---- eval suites + promotions (Phase 12) ----

export interface EvalSuite {
  id: string;
  workspace_id: string;
  agent_id: string | null;
  name: string;
  description: string;
  threshold: number;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvalSuiteVersion {
  id: string;
  suite_id: string;
  semver: string;
  created_at: string;
}

export interface AgentPromotion {
  id: string;
  version_id: string;
  target_type: string;
  target_ref: string;
  eval_run_id: string | null;
  /** pending_eval | pending_approval | approved | rejected | deployed | failed_eval */
  status: string;
  approver_user_id: string | null;
  decided_at: string | null;
  reason: string;
  proposed_by: string;
  proposed_at: string;
  updated_at: string;
}

export interface CreateSuiteInput {
  name: string;
  description?: string;
  /** 0–1; defaults to 0.8 server-side if omitted */
  threshold?: number;
  /** optional: attach to an agent at create time */
  agent_id?: string;
}

export interface NewSuiteVersionInput {
  /** New membership snapshot. Omit (not empty []) to inherit from the
   *  suite's active version — the common bump-version path. */
  case_ids?: string[];
}

export interface ProposePromotionInput {
  version_id: string;
  /** defaults to "api" */
  target_type?: string;
  target_ref?: string;
}

// ---- tool policies + approvals (Phase 14) ----

export interface ToolPolicy {
  id: string;
  workspace_id: string;
  /** null = workspace-default row; non-null = per-version override */
  agent_version_id: string | null;
  tool_name: string;
  /** "allow" | "deny" | "approve" */
  mode: string;
  config_json: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequest {
  id: string;
  workspace_id: string;
  session_id: string | null;
  agent_version_id: string | null;
  policy_id: string | null;
  tool_name: string;
  args_json: unknown;
  /** "pending" | "approved" | "rejected" | "expired" */
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_reason: string;
  webhook_url: string;
  webhook_delivered_at: string | null;
  requested_at: string;
  updated_at: string;
}

export interface UpsertToolPolicyInput {
  /** omit to target the workspace-default row */
  agent_version_id?: string;
  tool_name: string;
  /** "allow" | "deny" | "approve" */
  mode: string;
  config?: Record<string, unknown>;
}

// ---- prompt templates ----

export interface PromptTemplate {
  id: string;
  workspace_id: string;
  name: string;
  content: string;
  variables: unknown;
  created_at: string;
  updated_at: string;
}

export interface CreatePromptTemplateInput {
  name: string;
  content: string;
  variables?: string[];
}

export interface UpdatePromptTemplateInput {
  name: string;
  content: string;
  variables?: string[];
}

// ---- studio ----

export interface StudioTrace {
  session: AgentSession;
  /** Each step is the raw record; shape depends on step_type and is
   *  intentionally unparsed so Studio renderers can introspect freely. */
  steps: unknown[];
  system_prompt: string;
  tools: string[];
  memory: Record<string, string>;
}

export interface StudioReplayConfig {
  from_step: number;
  system_prompt?: string;
  message?: string;
}

export interface StudioFixRequest {
  failed_steps: number[];
  expected_outcome: string;
}

export interface StudioFixSuggestion {
  prompt_changes: string;
  eval_case?: {
    name: string;
    prompt: string;
    criteria: string;
  };
  reasoning: string;
}

// ---- audit log (Phase 13) ----

export interface TenantAuditEntry {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  actor_api_key_id: string | null;
  action: string;
  subject_type: string;
  subject_id: string;
  agent_version_id: string | null;
  session_id: string | null;
  metadata: unknown;
  created_at: string;
}

export interface AuditListPage {
  entries: TenantAuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

/** Filter for ListAuditLog. All fields optional. Dates are ISO 8601
 *  strings (zero-value omits the bound). */
export interface AuditListFilter {
  action?: string;
  actor_user_id?: string;
  subject_type?: string;
  /** ISO 8601 timestamp; omit for no lower bound */
  from?: string;
  /** ISO 8601 timestamp; omit for no upper bound */
  to?: string;
  /** server caps at 500; 0 = server default */
  limit?: number;
  offset?: number;
}

/** Filter for ExportAuditLog. Returned bytes are CSV or JSON depending
 *  on the format. */
export interface AuditExportFilter {
  /** "json" (default) or "csv" */
  format?: 'json' | 'csv';
  action?: string;
  subject_type?: string;
  from?: string;
  to?: string;
}
