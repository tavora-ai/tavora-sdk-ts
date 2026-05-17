// Agentic chat REPL — TypeScript mirror of examples/chat (Go).
//
// Drives the full agent reasoning loop: every turn goes through
// createAgentSession + runAgent, so the model can execute JavaScript
// in the Goja sandbox, call MCP tools, fetch URLs, and compose
// multi-step work per turn. One session is reused across all turns.
//
// Usage:
//   export TAVORA_URL=http://localhost:8080
//   export TAVORA_API_KEY=tvr_...
//   npm run build && npm start
//
// Flags: --title, --system-prompt, --tools, --model
// REPL commands: /exit, /quit, /reset, /help

import { parseArgs } from 'node:util';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output, stderr } from 'node:process';
import { Client, type AgentSession, type AgentEvent } from '@tavora/sdk';

const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant running inside Tavora's code-reasoning sandbox.

When a task needs computation, live data, or multi-step work, use execute_js to write a single JavaScript program that solves it. For simple factual questions, just answer directly.`;

interface Args {
  title: string;
  systemPrompt: string;
  tools: string[];
  model: string;
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      title: { type: 'string', default: '' },
      'system-prompt': { type: 'string', default: DEFAULT_SYSTEM_PROMPT },
      tools: { type: 'string', default: '' },
      model: { type: 'string', default: '' },
    },
  });
  return {
    title: values.title ?? '',
    systemPrompt: values['system-prompt'] ?? DEFAULT_SYSTEM_PROMPT,
    tools: parseTools(values.tools ?? ''),
    model: values.model ?? '',
  };
}

function parseTools(csv: string): string[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const url = process.env.TAVORA_URL;
  const key = process.env.TAVORA_API_KEY;
  if (!url || !key) {
    stderr.write('set TAVORA_URL and TAVORA_API_KEY environment variables\n');
    process.exit(1);
  }

  const args = parseCliArgs();
  const client = new Client(url, key);

  const ws = await client.getProject();
  output.write(`Connected to project: ${ws.name}\n`);

  const title = args.title || 'Chat';
  let session = await createSession(client, title, args);
  output.write(`Session:   ${session.id}\n`);
  if (args.tools.length > 0) {
    output.write(`Tools:     ${args.tools.join(', ')}\n`);
  }
  output.write('\nType a message. /help for commands, /exit to quit.\n\n');

  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const raw = await rl.question('You: ');
      const msg = raw.trim();
      if (!msg) continue;

      if (msg === '/exit' || msg === '/quit') return;
      if (msg === '/help') {
        printHelp();
        continue;
      }
      if (msg === '/reset') {
        try {
          session = await createSession(client, title, args);
          output.write(`[new session: ${session.id}]\n\n`);
        } catch (err) {
          stderr.write(`[reset failed: ${(err as Error).message}]\n`);
        }
        continue;
      }

      try {
        await runTurn(client, session.id, msg);
      } catch (err) {
        stderr.write(`[run failed: ${(err as Error).message}]\n`);
      }
      output.write('\n');
    }
  } finally {
    rl.close();
  }
}

async function createSession(client: Client, title: string, args: Args): Promise<AgentSession> {
  return client.createAgentSession({
    title,
    system_prompt: args.systemPrompt,
    tools: args.tools.length > 0 ? args.tools : undefined,
    model: args.model || undefined,
  });
}

async function runTurn(client: Client, sessionID: string, message: string) {
  for await (const evt of client.runAgent(sessionID, message)) {
    handleEvent(evt);
  }
}

function handleEvent(evt: AgentEvent) {
  switch (evt.type) {
    case 'tool_call':
      stderr.write(`  [tool_call] ${evt.tool ?? ''} ${JSON.stringify(evt.args ?? {})}\n`);
      break;
    case 'tool_result':
      stderr.write(`  [tool_result] ${evt.tool ?? ''}\n`);
      break;
    case 'execute_js':
      stderr.write(`  [execute_js] ${truncate(evt.content ?? '', 120)}\n`);
      break;
    case 'execute_js_result':
      stderr.write(`  [execute_js_result] ${truncate(evt.content ?? '', 120)}\n`);
      break;
    case 'sandbox_event': {
      const kind = (evt.args?.kind as string | undefined) ?? 'sandbox';
      const summary = (evt.args?.summary as string | undefined) ?? '';
      stderr.write(`  [${kind}] ${truncate(summary, 100)}\n`);
      break;
    }
    case 'response':
      output.write(`\nAgent: ${evt.content ?? ''}\n`);
      break;
    case 'error':
      stderr.write(`  [error] ${evt.content ?? ''}\n`);
      break;
    case 'done':
      if (evt.summary) {
        stderr.write(
          `\n[${evt.summary.steps} steps · ${evt.summary.tokens.prompt} prompt + ${evt.summary.tokens.completion} completion tokens]\n`,
        );
      }
      break;
  }
}

function truncate(s: string, n: number): string {
  const cleaned = s.trim().replace(/\n/g, ' \u23ce ');
  return cleaned.length <= n ? cleaned : `${cleaned.slice(0, n)}\u2026`;
}

function printHelp() {
  output.write('Commands:\n');
  output.write('  /exit, /quit   Leave the chat\n');
  output.write('  /reset         Start a fresh session (drops history)\n');
  output.write('  /help          Show this help\n');
}

main().catch((err) => {
  stderr.write(`error: ${(err as Error).message}\n`);
  process.exit(1);
});
