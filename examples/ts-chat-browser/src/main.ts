// Browser demo for @tavora/sdk. Uses a project API key entered
// in the top bar; for production you'd mint a session-scoped key
// server-side (see /docs/sdk/browser-project) rather than paste a
// long-lived tvr_... into the browser.

import { Client, TavoraAPIError, type AgentSession, type AgentEvent } from '@tavora/sdk';

const els = {
  baseUrl: document.querySelector<HTMLInputElement>('#baseUrl')!,
  apiKey: document.querySelector<HTMLInputElement>('#apiKey')!,
  connect: document.querySelector<HTMLButtonElement>('#connect')!,
  status: document.querySelector<HTMLSpanElement>('#status')!,
  turns: document.querySelector<HTMLElement>('#turns')!,
  message: document.querySelector<HTMLTextAreaElement>('#message')!,
  send: document.querySelector<HTMLButtonElement>('#send')!,
};

let client: Client | null = null;
let session: AgentSession | null = null;

const storedKey = localStorage.getItem('tvr_demo_key');
if (storedKey) els.apiKey.value = storedKey;

els.connect.addEventListener('click', () => void connect());
els.send.addEventListener('click', () => void send());
els.message.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void send();
  }
});

async function connect() {
  const baseUrl = els.baseUrl.value.trim();
  const apiKey = els.apiKey.value.trim();
  if (!baseUrl || !apiKey) {
    setStatus('error: URL and API key required');
    return;
  }
  localStorage.setItem('tvr_demo_key', apiKey);
  els.connect.disabled = true;
  setStatus('connecting…');
  try {
    client = new Client(baseUrl, apiKey);
    const ws = await client.getProject();
    session = await client.createAgentSession({
      title: 'Browser chat',
      system_prompt:
        "You are a helpful assistant running inside Tavora's code-reasoning sandbox. " +
        'For multi-step work use execute_js; for simple questions answer directly.',
    });
    setStatus(`connected · project ${ws.name} · session ${short(session.id)}`);
    els.message.disabled = false;
    els.send.disabled = false;
    els.message.focus();
  } catch (err) {
    setStatus(`error: ${errorMessage(err)}`);
    client = null;
    session = null;
  } finally {
    els.connect.disabled = false;
  }
}

async function send() {
  if (!client || !session) return;
  const msg = els.message.value.trim();
  if (!msg) return;
  els.message.value = '';
  els.message.disabled = true;
  els.send.disabled = true;
  appendTurn('user', msg);
  const agentTurn = appendTurn('agent', '');
  const trace = appendTrace();

  try {
    for await (const evt of client.runAgent(session.id, msg)) {
      renderEvent(evt, agentTurn, trace);
    }
  } catch (err) {
    trace.textContent += `\n[error] ${errorMessage(err)}`;
  } finally {
    els.message.disabled = false;
    els.send.disabled = false;
    els.message.focus();
  }
}

function renderEvent(evt: AgentEvent, agentTurn: HTMLElement, trace: HTMLElement) {
  switch (evt.type) {
    case 'execute_js':
      trace.textContent += `\n[execute_js] ${truncate(evt.content ?? '', 120)}`;
      break;
    case 'execute_js_result':
      trace.textContent += `\n[execute_js_result] ${truncate(evt.content ?? '', 120)}`;
      break;
    case 'tool_call':
      trace.textContent += `\n[tool_call] ${evt.tool ?? ''} ${JSON.stringify(evt.args ?? {})}`;
      break;
    case 'tool_result':
      trace.textContent += `\n[tool_result] ${evt.tool ?? ''}`;
      break;
    case 'sandbox_event': {
      const kind = (evt.args?.kind as string | undefined) ?? 'sandbox';
      const summary = (evt.args?.summary as string | undefined) ?? '';
      trace.textContent += `\n[${kind}] ${truncate(summary, 100)}`;
      break;
    }
    case 'response':
      agentTurn.textContent = evt.content ?? '';
      break;
    case 'error':
      trace.textContent += `\n[error] ${evt.content ?? ''}`;
      break;
    case 'done':
      if (evt.summary) {
        trace.textContent += `\n[${evt.summary.steps} steps · ${evt.summary.tokens.prompt}+${evt.summary.tokens.completion} tokens]`;
      }
      break;
  }
  scrollToBottom();
}

function appendTurn(role: 'user' | 'agent', content: string): HTMLElement {
  const div = document.createElement('div');
  div.className = `turn ${role}`;
  div.textContent = content;
  els.turns.appendChild(div);
  scrollToBottom();
  return div;
}

function appendTrace(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'trace';
  els.turns.appendChild(div);
  return div;
}

function scrollToBottom() {
  els.turns.scrollTop = els.turns.scrollHeight;
}

function setStatus(msg: string) {
  els.status.textContent = msg;
}

function short(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function truncate(s: string, n: number): string {
  const cleaned = s.trim().replace(/\n/g, ' \u23ce ');
  return cleaned.length <= n ? cleaned : `${cleaned.slice(0, n)}\u2026`;
}

function errorMessage(err: unknown): string {
  if (err instanceof TavoraAPIError) return `${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
