# ts-chat-browser

Browser demo for the standalone `@tavora/sdk` package. Vite + vanilla
TypeScript, no framework. Demonstrates that the SDK (including
`runAgent`'s SSE streaming) works unmodified in the browser.

## Running

```bash
# 1. Build the standalone SDK (only needed the first time or after SDK changes).
# from the tavora-sdk-ts repo root
npm install && npm run build

# 2. Run this example.
cd examples/ts-chat-browser
npm install
npm run dev      # http://localhost:5174
```

The Vite dev server proxies `/api/*` to `http://localhost:8080`, so you
can leave the API base URL as the default or switch to a relative
origin.

## How to use

1. Start the Tavora backend (`task dev` from repo root).
2. Grab an app API key from `/platform` → App Settings → API
   keys.
3. Open `http://localhost:5174`, paste the key, click Connect.
4. Send a message; the agent reasoning trace streams inline below the
   reply.

The API key is kept in `localStorage` for convenience.

## Security note

**Do not ship a long-lived `tvr_...` key to end-user browsers in
production.** This demo does it for local convenience, but a real
browser app should use the session-minted key pattern documented by the browser session-token pattern:

- Your backend authenticates the user (any auth flow).
- Your backend hits `POST /api/auth/session-token` with the user's JWT
  to mint a short-lived (8h) app-scoped API key.
- The browser receives that short-lived key and uses it with
  `new Client(baseURL, shortLivedKey)`.

The SDK itself doesn't care — it just sends whatever key you give it.
