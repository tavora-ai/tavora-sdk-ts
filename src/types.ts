// Shared types mirroring the Go SDK structs in sdk/*.go.
// Field names match the JSON tags on the Go side.

export interface App {
  id: string;
  team_id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

/** Result of POST /api/sdk/app/seed. Idempotent: when the
 *  app already had any agent, `already_seeded` is true and no
 *  mutation happens. */
export interface SeedAppResult {
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

export interface AppMetrics {
  tokens: TokenMetrics;
  agents: AgentMetrics;
  evals: EvalMetrics;
}

// ---- files (Storage) ----
//
// App-scoped raw blob storage. Distinct from `Document`
// (RAG-indexed view) and `Index` (RAG container) — Files is the
// universal-bytes primitive everything else can reference.
// Sha256-keyed dedup short-circuit on upload: re-uploading identical
// bytes returns the existing File row instead of creating a duplicate.

// File + Collection types removed in the 2026-05-11 positioning rewrite.
// Customer file storage and persistent structured records belong in the
// customer's backend (PocketBase / Supabase / their own DB), exposed to
// the agent via MCP. See the SDK CONTRACT for the deprecation note.

// ---- indexes (RAG containers) ----

export interface Index {
  id: string;
  app_id: string;
  name: string;
  description: string;
  /** Customer-owned arbitrary data — Tavora never interprets this. Round-trips as opaque JSON. */
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateIndexInput {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/** PATCH semantics: omitted metadata preserves current; pass `{}` to clear. */
export interface UpdateIndexInput {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

// ---- secret vaults ----

export interface SecretVault {
  id: string;
  app_id: string;
  name: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Redacted view of a secret. Never contains plaintext or the encrypted
 *  blob — only metadata safe to put on the wire. */
export interface RedactedSecret {
  vault_id: string;
  name: string;
  kek_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSecretVaultInput {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateSecretVaultInput {
  metadata?: Record<string, unknown>;
}

// ---- documents ----

export interface Document {
  id: string;
  app_id: string;
  index_id: string;
  filename: string;
  content_type: string;
  file_size: number;
  /** "pending" | "processing" | "ready" | "stored" | "error" — "stored"
   *  is for opaque artifacts (e.g. .json, source code) that aren't run
   *  through the chunk + embed pipeline but still round-trip via list/get. */
  status: string;
  error_message: string | null;
  page_count: number | null;
  chunk_count: number;
  /** Optional logical name; uniqueness is enforced over (store, name)
   *  among latest non-deleted versions. */
  name: string | null;
  version: number;
  is_latest: boolean;
  /** Free-form provenance JSON. Conventionally includes `source`,
   *  `task`, `type`, `tags.*`. */
  metadata: Record<string, unknown>;
  parent_id: string | null;
  created_by_api_key_id: string | null;
  /** Hex-encoded sha256 of the uploaded bytes. Server-computed on
   *  upload; stable across replays. Use to detect duplicates via
   *  ListDocumentsInput.contentSha256 / duplicateOf. */
  content_sha256: string | null;
  /** ISO 8601 when soft-deleted; null for live documents. */
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListDocumentsInput {
  limit?: number;
  offset?: number;
  indexId?: string;
  /** ILIKE filter on filename. */
  q?: string;
  /** metadata->>'source' equality filter — shorthand for the
   *  most-asked-for provenance dimension. */
  source?: string;
  /** metadata @> jsonb containment filter. */
  metadata?: Record<string, string>;
  /** Limit results to artifacts whose parent_id equals this ID.
   *  The natural way to fetch the auto-generated markdown sibling of a
   *  PDF: pass the PDF's ID here. */
  parentId?: string;
  /** Filter on metadata.derived_from. The pipeline stamps "extraction"
   *  on auto-generated markdown siblings. */
  derivedFrom?: string;
  /** Match exact content hash. */
  contentSha256?: string;
  /** Sugar over contentSha256 — server resolves this document's hash
   *  and excludes the source itself. "Is this PDF already uploaded?" */
  duplicateOf?: string;
  includeDeleted?: boolean;
}

export interface ListDocumentsResult {
  data: Document[];
  total: number;
  has_more: boolean;
}

export interface UploadDocumentInput {
  indexId: string;
  /** File-like payload. In the browser pass a `File`; in Node use
   * `openAsBlob(path)` or `new Blob([await readFile(path)])`. */
  file: Blob;
  /** Optional filename override. Required when `file` is a bare `Blob`
   * (no `.name`). */
  filename?: string;

  // ---- provenance (round-tripped via document metadata) ----

  /** Logical name; enables version-on-rewrite for (indexId, name). */
  name?: string;
  /** Shorthand for metadata.source — which agent produced the artifact. */
  source?: string;
  /** Shorthand for metadata.task — logical task or session ID. */
  task?: string;
  /** Shorthand for metadata.type — patch / spec / note / state / etc. */
  type?: string;
  /** Flat key=value tags merged into metadata. */
  tags?: Record<string, string>;
  /** Arbitrary metadata; merged with the shorthand fields above. */
  metadata?: Record<string, string>;
  /** ID of an existing document this artifact derives from. */
  parentId?: string;

  /** Optimistic concurrency. Server returns 409 when the latest
   *  (indexId, name) version doesn't equal `ifVersion`. */
  ifVersion?: number;
}

export interface SearchInput {
  query: string;
  indexId?: string;
  top_k?: number;
  min_score?: number;
  /** Response shape selector. Default "chunk" (one row per chunk).
   *  "document" returns one row per distinct document with the best
   *  chunk inlined as a preview — server-side dedup. Use the
   *  `searchDocuments` method to get the typed document-shaped
   *  response without flipping this manually. */
  result_type?: 'chunk' | 'document';
}

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  filename: string;
  /** Logical name of the parent document (null if the artifact had none). */
  document_name: string | null;
  /** Provenance metadata of the parent document — avoids an N+1 fetch
   *  when the caller wants to render `source` per hit. */
  document_metadata: Record<string, unknown>;
  content: string;
  score: number;
  chunk_index: number;
  metadata: Record<string, unknown>;
}

/** Document-shaped search result returned by `searchDocuments` (or
 *  `search` with `result_type: "document"`). One row per distinct
 *  document with the best chunk inlined as a preview. */
export interface DocumentSearchResult {
  document_id: string;
  index_id: string;
  filename: string;
  document_name: string | null;
  document_metadata: Record<string, unknown>;
  parent_id: string | null;
  content_sha256: string | null;
  score: number;
  best_chunk: {
    chunk_id: string;
    chunk_index: number;
    preview: string;
  };
}

export interface GetDocumentByNameInput {
  indexId: string;
  name: string;
  /** Pin a specific historical version; omit for the latest non-deleted one. */
  version?: number;
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
  index_id?: string;
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
  app_id: string;
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
  index_id?: string;
}

export interface SendMessageResult {
  user_message: ConversationMessage;
  message: ConversationMessage;
  token_usage: ChatCompletionUsage;
}

// ---- agents ----

export interface AgentSession {
  id: string;
  app_id: string;
  title: string;
  system_prompt: string;
  model: string;
  tools_config: unknown;
  metadata: unknown;
  status: string;
  /** Pinned indexes for the agent's `search()` calls. Empty/undefined
   *  = "all indexes in this app". */
  index_ids?: string[];
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

  /** `agent_id` + `target` drive the "run against staged draft" path.
   *  Set `target: "draft"` with `agent_id` = the server agent UUID
   *  to pick up persona+model+skills from `agents.draft_config`
   *  (populated by the browser editor or by `tavora dev`). Target
   *  is "live" by default; an explicit value other than "live" or
   *  "draft" is rejected. */
  agent_id?: string;
  target?: 'live' | 'draft';

  /** Restrict the sandbox's `search()` to a subset of indexes. Each id
   *  must belong to the caller's app. Omitted = "all indexes in this
   *  app"; explicit empty array = sandbox can't search anything. */
  index_ids?: string[];
}

export interface RunSummary {
  session_id: string;
  steps: number;
  tokens: {
    prompt: number;
    completion: number;
  };
}

/** Per-LLM-call token usage on a step event. Mirrors the server's
 *  `internal/agent.CallTokens`. Only emitted on events that involve an
 *  LLM call (think / respond) — undefined for tool_call, tool_result,
 *  error, input_request, done. */
export interface CallTokens {
  prompt: number;
  completion: number;
}

/** Discriminator values for `AgentEvent.type`. Tavora's reasoning
 *  model is "agent writes JavaScript, sandbox runs it" — these
 *  event types reflect that, not the function-calling vocabulary
 *  (think/tool_call/tool_result) of other agent platforms. New types
 *  are additive — consumers that don't recognize one should treat it
 *  as an opaque step rather than crashing. */
export const EventType = {
  /** Partial LLM output (text emitted before a JS block, side-channel
   *  sandbox logging). */
  SandboxEvent: 'sandbox_event',
  /** Agent emitted a complete JS block; sandbox about to run it. */
  ExecuteJS: 'execute_js',
  /** Sandbox finished running a block. */
  ExecuteJSResult: 'execute_js_result',
  /** Sandbox primitive mutated agent-session data. */
  DataUpdate: 'data_update',
  /** Agent's final natural-language answer. */
  Response: 'response',
  /** Agent paused for user input — see asInputRequest + respondToAgentInput. */
  InputRequest: 'input_request',
  /** Terminal — Summary holds run aggregates. */
  Done: 'done',
  /** Terminal — Content holds the error message. */
  Error: 'error',
} as const;

export type EventTypeName = (typeof EventType)[keyof typeof EventType];

export interface AgentEvent {
  type: string;
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  summary?: RunSummary;
  /** Per-call token usage. Server emits this on think / respond events.
   *  Pre-Phase-A this field was missing from the SDK type, silently
   *  dropping the data. */
  tokens?: CallTokens;
}

/** isTerminalEvent ends the SSE iteration. Use to break out of
 *  `for await` loops without comparing strings. */
export function isTerminalEvent(e: AgentEvent): boolean {
  return e.type === EventType.Done || e.type === EventType.Error;
}

/** Typed view of an `input_request` event. The agent has paused and is
 *  waiting for `respondToAgentInput(sessionId, requestId, value)` —
 *  block until you have the value, then call respond. */
export interface AgentInputRequest {
  requestId: string;
  /** "confirm" | "choice" | "text" */
  inputType: string;
  message: string;
  /** Populated when inputType === "choice". */
  options: string[];
  placeholder: string;
}

/** Returns a typed AgentInputRequest if the event is `input_request`,
 *  null otherwise. */
export function asInputRequest(e: AgentEvent): AgentInputRequest | null {
  if (e.type !== EventType.InputRequest) return null;
  const a = (e.args ?? {}) as Record<string, unknown>;
  const optionsRaw = a['options'];
  return {
    requestId: typeof a['request_id'] === 'string' ? (a['request_id'] as string) : '',
    inputType: typeof a['input_type'] === 'string' ? (a['input_type'] as string) : '',
    message:
      typeof a['message'] === 'string' && (a['message'] as string) !== ''
        ? (a['message'] as string)
        : (e.content ?? ''),
    options: Array.isArray(optionsRaw)
      ? (optionsRaw.filter((o) => typeof o === 'string') as string[])
      : [],
    placeholder: typeof a['placeholder'] === 'string' ? (a['placeholder'] as string) : '',
  };
}

// ---- MCP servers ----

export interface MCPServer {
  id: string;
  app_id: string;
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
  app_id: string;
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
  app_id: string;
  name: string;
  description: string;
  created_by: string;

  // Live config — the runtime reads these for new sessions. Mirrored
  // onto agent_versions on each publish.
  persona_md: string;
  /** JSON array of SkillBinding. Server returns parsed; older callers
   *  may have stored as string. */
  skills_json: unknown;
  /** JSON array of store IDs. Same dual-shape caveat. */
  stores_json: unknown;
  provider: string;
  model: string;
  enabled_capabilities: string[] | null;

  // Per-agent operator settings (PR5 of agent simplification).
  eval_suite_id: string | null;
  run_eval_on_publish: boolean;

  // Draft slot — non-null when unpublished edits are staged. The
  // runtime is unaffected by the draft.
  draft_config: DraftConfig | null;

  active_version_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;

  /** Code-first markers, non-null when the agent is managed by
   *  `tavora dev` from a local tavora/ folder. `code_first_project`
   *  is the project name from tavora.jsonc; `code_first_local_id` is
   *  the `id` field in agent.jsonc. SDK callers use these to look up
   *  an agent UUID by local id without source-syncing first
   *  (`listAgentConfigs` + filter). */
  code_first_project?: string | null;
  code_first_local_id?: string | null;
}

/** DraftConfig is the staged next-state of an agent. The frontend
 *  always sends the complete intended state — partial-merge isn't
 *  supported, so callers should construct this fully (typically from
 *  the agent's current live columns). */
export interface DraftConfig {
  persona_md: string;
  skills: SkillBinding[];
  stores: string[];
  provider: string;
  model: string;
  enabled_capabilities?: string[];
  eval_suite_id?: string;
  eval_suite_version?: string;
}

/** PublishResult is what publishAgent and revertAgent return — the
 *  updated agent row plus the new history snapshot appended on the
 *  same transaction. */
export interface PublishResult {
  agent: AgentConfig;
  version: AgentVersion;
}

/** UpdateAgentSettingsInput patches per-agent operator settings.
 *  Pass `eval_suite_id: ""` to clear the pin; omit a field to leave
 *  it unchanged. */
export interface UpdateAgentSettingsInput {
  eval_suite_id?: string;
  run_eval_on_publish?: boolean;
}

/** EvalTarget selects which persona an advisory eval uses for its
 *  sessions. "live" reads the published persona; "draft" reads the
 *  staged draft and 409s when nothing is staged. */
export type EvalTarget = 'live' | 'draft';

/** EvalRunResult wraps the row created by runAgentEval. Wrapped so
 *  future fields can land without breaking callers. */
export interface EvalRunResult {
  run: EvalRun;
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

export interface CreateAgentConfigInput {
  name: string;
  description?: string;
}

// UpdateAgentConfigInput + CreateAgentVersionInput were removed when
// the corresponding REST endpoints went away. Rename via
// `sourceRename`; promote via `publishAgent` (UI path) or
// `sourceDeploy` (CLI path) — both append a kind='published' row
// through the same internal path.

// ---- code-first source-* (matches tavora-go's /api/sdk/source-*) ----

/** A single file in a SourceSyncManifest — path + sha256 content hash
 *  + size + base64-or-raw bytes. The server records the hash for
 *  future content-addressed dedupe; today it always reads `content`. */
export interface SourceFile {
  path: string;
  hash: string;
  size: number;
  /** UTF-8 string for text files (.jsonc, .md, .js, .json) or
   *  base64-encoded bytes for anything else. */
  content?: string;
}

/** Per-agent slice of the manifest. `source_hash` is the hash of every
 *  (path, content) pair under this agent's folder in sorted-path
 *  order — stable across operating systems. */
export interface SourceAgent {
  id: string;
  sourceHash: string;
  files: SourceFile[];
}

/** Payload `tavora dev` (or any SourceSync caller) sends on every
 *  debounced change. The server persists a dev draft from it. */
export interface SourceSyncManifest {
  project: string;
  environment?: string;
  sourceHash: string;
  agents: SourceAgent[];
  generatedAt: string;
}

/** AI-friendly issue shape. Mirrors the CLI's local validator output:
 *  file + line + code + message + repair hint. `severity` is "fatal"
 *  or "warn" — fatals block sync. */
export interface SourceValidationIssue {
  file?: string;
  line?: number;
  column?: number;
  code: string;
  message: string;
  hint?: string;
  severity: 'fatal' | 'warn';
}

export interface SourceSyncAgentResult {
  localId: string;
  agentId: string;
  draftId: string;
  sourceHash: string;
}

export interface SourceSyncResult {
  draftHash: string;
  agents: SourceSyncAgentResult[];
  syncedAt: string;
  serverIssues?: SourceValidationIssue[];
}

export interface SourceDeployInput {
  project: string;
  environment?: string;
  /** Limit the deploy to a single agent. Empty deploys all agents
   *  for this project. */
  localAgentId?: string;
  /** Tri-state override of `agent.jsonc → deploy.runEvals`. Leave
   *  undefined to honor the file's setting. */
  runEvals?: boolean;
}

export interface DeployedAgentInfo {
  localId: string;
  agentId: string;
  versionId: string;
  semver: string;
}

export interface SourceDeployResult {
  version: string;
  agents: DeployedAgentInfo[];
  deployedAt: string;
  serverIssues?: SourceValidationIssue[];
}

export interface SourceRenameInput {
  project: string;
  oldLocalId: string;
  newLocalId: string;
}

export interface SourceRenameResult {
  agentId: string;
  oldLocalId: string;
  newLocalId: string;
}

export interface SourceDeleteInput {
  project: string;
  localId: string;
  /** Must be true; the server returns "force_required" otherwise. The
   *  CLI surfaces a confirmation prompt before setting this. */
  force: boolean;
}

export interface SourceDeleteResult {
  agentId: string;
  localId: string;
  deleted: boolean;
}

// ---- scheduled runs ----

export interface ScheduledRun {
  id: string;
  app_id: string;
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

/** Patch fields on an existing scheduled run. Every field is optional;
 *  omitted fields are left alone. cron_expression changes recompute
 *  the next-run trigger; other fields don't disturb the schedule. */
export interface UpdateScheduledRunInput {
  name?: string;
  cron_expression?: string;
  message?: string;
  enabled?: boolean;
}

// ---- evals ----

export interface EvalCase {
  id: string;
  app_id: string;
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

/** Patch fields on an existing eval case. Same shape as create — every
 *  field is optional; omitted fields are left alone. Editing a case
 *  mid-eval-cycle changes what "passing" means for any suite-version
 *  that references it on subsequent runs. */
export type UpdateEvalCaseInput = Partial<CreateEvalCaseInput>;

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
  app_id: string;
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


// ---- tool policies + approvals (Phase 14) ----

export interface ToolPolicy {
  id: string;
  app_id: string;
  /** null = app-default row; non-null = per-version override */
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
  app_id: string;
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
  /** omit to target the app-default row */
  agent_version_id?: string;
  tool_name: string;
  /** "allow" | "deny" | "approve" */
  mode: string;
  config?: Record<string, unknown>;
}

// ---- prompt templates ----

export interface PromptTemplate {
  id: string;
  app_id: string;
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
  app_id: string;
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
