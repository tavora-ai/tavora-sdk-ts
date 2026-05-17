# Changelog

All notable changes to `@tavora/sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project follows pre-v1 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
where minor bumps may carry breaking changes.

## [Unreleased]

## [0.4.0] — 2026-05-17

The code-first pivot. Source-sync (`PUT /api/sdk/source-sync`,
driven by `tavora dev` from a local `tavora/` folder) is now the
single writer for agents, skills, eval cases, and MCP server
bindings. The platform's matching mutator endpoints came off, and
this release prunes the client to match.

### Added

- **Code-first source APIs.** `sourceSync`, `sourceValidate`,
  `sourceDeploy`, `sourceRename`, `sourceDelete`. These are what
  the `tavora` CLI uses internally to author agents from a local
  folder; application code rarely calls them directly.
- **Code-first markers on `AgentConfig`** —
  `code_first_project` and `code_first_local_id` (the project +
  local-id pair from `tavora.jsonc` / `agent.jsonc`) are now
  exposed so callers can resolve a server agent UUID by local id
  without source-syncing first.
- **`agent_id` + `target` on `CreateAgentSessionInput`** — drives
  the "run against staged draft" path used by `tavora run --draft`.

### Removed (BREAKING)

- **Draft + publish flow.** `updateAgentDraft`,
  `discardAgentDraft`, `publishAgent`, `revertAgent`, and the
  `DraftConfig` / `PublishResult` types are gone. Promotion is
  `sourceDeploy`-only.
- **Agent-version writes.** `createAgentConfig`,
  `updateAgentConfig`, `setActiveAgentVersion`,
  `createAgentVersion` are gone. Agents are scaffolded via
  `tavora init` and modified via the local folder.
- **MCP server registry.** `listMCPServers`, `getMCPServer`,
  `createMCPServer`, `updateMCPServer`, `deleteMCPServer`,
  `testMCPServer` removed; `MCPServer`, `CreateMCPServerInput`,
  `UpdateMCPServerInput`, `TestMCPServerResult`, `MCPToolSchema`,
  `MCPToolChange`, `MCPToolDrift` types deleted. MCP servers are
  now declared inline in `agent.jsonc → mcp` and flow through
  `sourceSync`.
- **Skill CRUD.** `createSkill`, `deleteSkill` are gone;
  `CreateSkillInput` removed. Skills are authored as `.js` / `.md`
  files under `tavora/agents/<id>/skills/`.
- **Eval-case writes.** `createEvalCase`, `updateEvalCase`,
  `deleteEvalCase`, `runEval` are gone; `CreateEvalCaseInput`,
  `UpdateEvalCaseInput`, `RunEvalInput` removed. Cases live as
  JSON files under `tavora/agents/<id>/evals/`. Trigger advisory
  runs per agent via `runAgentEval`.
- **Eval-suite writes.** `createSuite`, `deleteSuite`,
  `newSuiteVersion` are gone; `CreateSuiteInput`,
  `NewSuiteVersionInput` removed. Suites are read-only via SDK;
  the Phase-12 promotion gate was dismantled.
- **Tool policies + approvals.** `listToolPolicies`,
  `upsertToolPolicy`, `deleteToolPolicy`, `listPendingApprovals`,
  `approveApprovalRequest`, `rejectApprovalRequest` removed;
  `ToolPolicy`, `ApprovalRequest`, `UpsertToolPolicyInput` types
  deleted. Phase-14 came off the platform on 2026-05-13.
- **`seedApp`** — there's no in-server starter agent seed
  anymore; agents land via `sourceSync` when the operator runs
  `tavora init` + `tavora dev`.
- **`run_eval_on_publish` + `draft_config` fields** on
  `AgentConfig`. The browser no longer publishes; run-on-deploy
  is a `tavora deploy --run-evals` flag.

### Changed

- **`AgentConfig` shape narrowed.** Live config (persona, skills,
  stores, provider, model) lives on the agent row directly;
  `AgentVersion` rows are append-only history snapshots written
  by the code-first publish path.
- **`updateAgentSettings`** is the only `agent_configs` mutator
  left and only patches the `eval_suite_id` pin.

### Migration guide

```ts
// before (v0.3.x)
const draft = { persona_md: "...", skills: [...], ... };
await client.updateAgentDraft(agentID, draft);
await client.publishAgent(agentID);

// after (v0.4.0)
// 1. Edit tavora/agents/<id>/persona.md + agent.jsonc locally.
// 2. tavora dev  (auto-syncs as you save)
// 3. tavora deploy  (publishes an immutable version)
// The SDK only consumes the deployed agent at runtime via
// createAgentSession({ agent_id: ... }).
```

```ts
// before (v0.3.x)
const mcp = await client.createMCPServer({
  name: 'tasklist-example',
  url: 'https://example.com/mcp',
  // ...
});

// after (v0.4.0)
// Declare inline in tavora/agents/<id>/agent.jsonc:
//   "mcp": [{
//     "name": "tasklist-example",
//     "url": "${APP_PUBLIC_URL}/mcp",
//     "transport": "streamable_http",
//     "auth": {"type":"bearer","tokenRef":"TASKLIST_BEARER"}
//   }]
// Then tavora deploy.
```

## [0.3.0] — 2026-05-15

### Removed (BREAKING)

- **Memory stores API** — `MemoryStore`, `MemoryEntry`,
  `CreateMemoryStoreInput`, `UpdateMemoryStoreInput`, and the
  client methods `listMemoryStores`, `getMemoryStore`,
  `createMemoryStore`, `updateMemoryStore`, `deleteMemoryStore`,
  `listMemoryEntries`, `putMemoryEntry`, `deleteMemoryEntry`.
  The `remember()` / `recall()` / `memories()` sandbox primitives
  were also removed from agent JS — cross-session memory now
  lives in the customer's database, injected as context at
  session-create.
- **Tenant facade** — `Tenant`, `ProvisionTenantInput`,
  `UpdateTenantInput`, and the client methods `listTenants`,
  `getTenant`, `provisionTenant`, `updateTenant`, `archiveTenant`.
  The platform no longer models per-end-customer state behind an
  opaque `tenant_ref`; end-user isolation moves to the customer's
  app layer.
- **Session-pinned credentials vault** — `memory_store_id`,
  `secret_vault_id`, and `tenant_ref` fields removed from both
  `AgentSession` and `CreateAgentSessionInput`. Sessions inherit
  credentials from the app's designated vault (see "Changed" below).
- **`secret(name)` sandbox primitive** — gone from the agent's
  JS vocabulary. Tools (LLM dispatcher, Brave search) read
  credentials internally from the app vault; the agent never
  touches plaintext.
- `StudioTrace.memory` — no longer populated; field dropped.

### Changed

- **One credentials vault per app.** The app designates one
  `secret_vault` via `PUT /api/sdk/app/vault` (was
  `/app/llm-vault`). The runtime LLM resolver reads provider
  keys (`openai_api_key`, `anthropic_api_key`,
  `gemini_api_key`, `openrouter_api_key`, `edenai_api_key`,
  `ollama_base_url`) and the Brave search pack reads
  `brave_api_key` from the same vault on every dispatch.
- The `TenantAuditEntry` type name is retained for schema
  continuity (the underlying `tenant_audit_log` table is
  unchanged) but the documentation no longer describes it
  as tenant-scoped.

### Migration guide

If your code creates agent sessions with primitive pins:

```ts
// before (v0.2.x)
const session = await client.createAgentSession({
  memory_store_id: 'store-uuid',
  secret_vault_id: 'vault-uuid',
  tenant_ref: 'acme-corp',
});

// after (v0.3.0)
const session = await client.createAgentSession({
  index_ids: ['index-uuid'], // search() scoping survives
});
```

For per-end-user state, manage it in your own database and inject
relevant facts via `system_prompt` or the initial user message at
session-create time.

To replace `agent.secret("openai_api_key")` from inside skill
code: store the key in the app's vault, designate the vault via
`PUT /api/sdk/app/vault`, and the LLM resolver picks it up
automatically.

## [0.2.1] — earlier releases

See git history.
