# @tavora/sdk

The official TypeScript SDK for the [Tavora](https://tavora.ai) agentic
intelligence platform. Runs in Node ≥ 20 and any browser with native
`fetch`. Zero runtime dependencies.

See [docs.tavora.ai](https://docs.tavora.ai) for the full platform docs.

## Installation

```sh
npm install @tavora/sdk
# or
pnpm add @tavora/sdk
# or
yarn add @tavora/sdk
```

## Quickstart

```ts
import { Client } from '@tavora/sdk';

const client = new Client('https://api.tavora.ai', 'tvr_your-api-key');

const ws = await client.getApp();
console.log('Connected to', ws.name);

const session = await client.createAgentSession({
  title: 'Hello',
  system_prompt: 'You are a helpful assistant.',
});

for await (const evt of client.runAgent(session.id, 'Summarise my docs.')) {
  if (evt.type === 'response') console.log(evt.content);
}
```

## Scope

| Area | Methods |
|---|---|
| App | `getApp` |
| Storage | `uploadFile`, `listFiles`, `getFile`, `getFileContent`, `deleteFile`, `deleteFileHard` |
| Indexes (RAG containers) | `listIndexes`, `getIndex`, `createIndex`, `updateIndex`, `deleteIndex` |
| Documents (RAG-indexed) | `uploadDocument`, `getDocument`, `getDocumentByName`, `listDocuments`, `listDocumentVersions`, `deleteDocument`, `deleteDocumentHard`, `search`, `searchDocuments` |
| Chat | `chatCompletion`, `createConversation`, `listConversations`, `getConversation`, `deleteConversation`, `sendMessage` |
| Agents | `getAgentSystemPrompt`, `createAgentSession`, `listAgentSessions`, `getAgentSession`, `deleteAgentSession`, `runAgent` (streaming async iterator) |
| MCP servers | `listMCPServers`, `getMCPServer`, `createMCPServer`, `updateMCPServer`, `deleteMCPServer`, `testMCPServer` |

## Uploading a document

**Node:**

```ts
import { openAsBlob } from 'node:fs';

const index = await client.createIndex({ name: 'Support docs' });
const file = await openAsBlob('./faq.md');
await client.uploadDocument({ indexId: index.id, file, filename: 'faq.md' });
```

**Browser:**

```ts
const [file] = input.files; // from <input type="file">
await client.uploadDocument({ indexId, file });
```

## Storage (raw bytes)

Files is the universal-bytes layer — screenshots, JSON, opaque
binary that doesn't need RAG indexing. SHA256-keyed dedup on upload:
re-uploading identical bytes returns the existing File row instead
of creating a duplicate.

```ts
const file = await client.uploadFile({ file: blob, filename: 'note.txt' });
const meta = await client.getFile(file.id);
const res  = await client.getFileContent(file.id); // Response — pipe / .blob() / .text()
```

## Document-mode search

Default `search()` returns chunks (one row per matched chunk).
`searchDocuments()` returns one row per distinct document, server-
deduped, with the best chunk inlined as `best_chunk.preview`. Use
when the agent's question is "what artifacts are about X" rather
than "what passages are about X".

## Errors

Failures throw `TavoraAPIError` with `status`, `code`, `apiMessage`
(raw server message), and a `details` record of structured fields.
`asVersionConflict(err)` extracts `currentVersion` for retry flows.

## Agent events

`runAgent()` yields `AgentEvent` objects. `AgentEvent.tokens?:
CallTokens` reports per-step LLM cost. The `EventType` const enum
disambiguates the SSE event kind. `asInputRequest(evt)` + the
`respondToAgentInput()` method implement the pause-for-input flow
agents trigger from the sandbox.

## Browser-side usage

For browsers that need SDK access without exposing a long-lived key, use
Tavora's session-token exchange — see
[Browser-side chat](https://docs.tavora.ai/sdk/browser-app/).

## Versioning

This SDK follows semantic versioning. The API is stable; breaking
changes land in major-version bumps.

## License

[MIT](./LICENSE)
