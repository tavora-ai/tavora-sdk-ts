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

const ws = await client.getWorkspace();
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
| Workspace | `getWorkspace` |
| Stores | `listStores`, `getStore`, `createStore`, `updateStore`, `deleteStore` |
| Documents | `uploadDocument`, `listDocuments`, `getDocument`, `deleteDocument`, `search` |
| Chat | `chatCompletion`, `createConversation`, `listConversations`, `getConversation`, `deleteConversation`, `sendMessage` |
| Agents | `getAgentSystemPrompt`, `createAgentSession`, `listAgentSessions`, `getAgentSession`, `deleteAgentSession`, `runAgent` (streaming async iterator) |
| MCP servers | `listMCPServers`, `getMCPServer`, `createMCPServer`, `updateMCPServer`, `deleteMCPServer`, `testMCPServer` |

## Uploading a document

**Node:**

```ts
import { openAsBlob } from 'node:fs';

const store = await client.createStore({ name: 'Support docs' });
const file = await openAsBlob('./faq.md');
await client.uploadDocument({ storeId: store.id, file, filename: 'faq.md' });
```

**Browser:**

```ts
const [file] = input.files; // from <input type="file">
await client.uploadDocument({ storeId, file });
```

## Browser-side usage

For browsers that need SDK access without exposing a long-lived key, use
Tavora's session-token exchange — see
[Browser-side chat](https://docs.tavora.ai/sdk/browser-app/).

## Versioning

This SDK follows semantic versioning. The API is stable; breaking
changes land in major-version bumps.

## License

[MIT](./LICENSE)
