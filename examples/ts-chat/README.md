# ts-chat

TypeScript mirror of `examples/chat` (Go). A multi-turn agentic REPL
driven through the standalone `@tavora/sdk` package — every user turn
goes through `createAgentSession` + `runAgent`, so the model can execute
JavaScript in the Goja sandbox, call MCP tools, fetch URLs, and compose
multi-step work per turn. One session is reused across all turns.

## Running

```bash
# 1. Build the standalone SDK (only needed the first time or after SDK changes).
# from the tavora-sdk-ts repo root
npm install && npm run build

# 2. Build and run this example.
cd examples/ts-chat
npm install
npm run build

export TAVORA_URL=http://localhost:8080
export TAVORA_API_KEY=tvr_...
npm start
```

## Flags

```
--title "..."           Session title (default: "Chat")
--system-prompt "..."   Agent system prompt (default: built-in)
--tools search,fetch Comma-separated sandbox tools to enable
--model gemini-2.5-pro  Override the model (default: project default)
```

## REPL commands

- `/exit`, `/quit` — leave
- `/reset` — start a fresh session (drops history)
- `/help` — show commands

## What this demonstrates

- Using `@tavora/sdk` from Node
- `runAgent` as an async iterator over SSE events (`tool_call`,
  `execute_js`, `response`, `done`, …)
- Session reuse across turns for conversation history
