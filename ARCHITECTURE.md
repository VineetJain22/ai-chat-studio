# Architecture & Decisions

Deeper rationale behind the choices in this repo — what was traded for what, and why. See [`README.md`](README.md) for the overview and [`CLAUDE.md`](CLAUDE.md) for the agent-facing quick reference.

## The model layer: Azure AI Foundry

All four models — OpenAI GPT-5.4 Mini, OpenAI GPT-5.3 Codex, Anthropic Claude Sonnet 4.6, DeepSeek V3.2 — are deployments on a single Azure AI Foundry resource, not four separate vendor accounts. Practically, that means:

- One API key and one base endpoint pattern cover every model (`AZURE_AI_API_KEY`, `AZURE_AI_ENDPOINT` / `AZURE_OPENAI_PROJECT_ENDPOINT`), rather than juggling OpenAI's, Anthropic's, and DeepSeek's own separate accounts and keys.
- Foundry normalizes *hosting and billing*, not the *wire protocol*. OpenAI-family models are reachable through an OpenAI-compatible `/chat/completions` (and `/responses`) surface; Claude is reachable through Anthropic's own native Messages API, just served from the same Azure resource (`{endpoint}/anthropic`); DeepSeek rides the OpenAI-compatible surface too. Three genuinely different request/response shapes, one hosting layer.
- That's the actual problem the provider-routing design (below) solves — Foundry removes the "where do I get a key for X" problem, not the "how do I talk to X" problem.

## Provider routing — one endpoint, three API shapes

Each model is a declarative config object in [`src/lib/models.ts`](src/lib/models.ts):

```ts
{
  id: 'claude-sonnet-4-6',
  provider: 'azure-anthropic',       // which SDK + base URL
  deploymentName: 'claude-sonnet-4-6',
  useResponsesAPI: false,            // chat completions vs. /responses
  reasoningEffort: undefined,        // reasoning models only
}
```

[`/api/chat`](src/app/api/chat/route.ts) reads the config and picks one of three paths — Anthropic SDK, OpenAI SDK against `/responses` (for GPT-5-class reasoning models), or OpenAI SDK against `/chat/completions` — but all three are wrapped in the same `streamResponse()` generator, so the frontend always reads a plain text stream regardless of which provider is behind it. Adding a fifth model is a config entry plus, at most, one new branch — not a UI change.

**Trade-off:** this buys a clean UI contract at the cost of lowest-common-denominator features — nothing provider-specific (prompt caching, extended thinking, parallel tool calls) is exposed yet. Right for a chat-only product; would need revisiting for an agentic one.

## Document pinning

Uploaded files are injected as regular chat messages (`[Document: ...]`), which makes them show up in history naturally — but history gets trimmed to control token cost, and trimming can silently drop the one message the user actually cares about. The fix pins the last two document messages and separately trims everything else, then **filters the original message array in place** rather than concatenating pinned + recent (which would scramble user/assistant alternation). That ordering matters more than it looks: Anthropic's API rejects a request with two adjacent user turns.

## LLM-generated PPTX, not a template engine

[`/api/generate-ppt`](src/app/api/generate-ppt/route.ts) asks the model to write a `pptxgenjs` script against the conversation, rather than filling fixed template slots. That's a deliberate bet: more flexible output, less reliable generation.

To make that bet survivable:
1. The generated script is syntax-checked (`node --check`) before it ever runs.
2. On failure, [`recoverScript`](src/lib/pptx-utils.ts) truncates the script at the last known-good line (using the syntax error's line number) rather than discarding the whole generation.
3. It executes via `execFile`, not `exec` — no shell, so no injection surface and no `/bin/sh` environment dependency.
4. One automatic retry with a stricter length instruction if both the first attempt and recovery fail.
5. Branding is a programmatically-drawn shape + text badge, not a bundled logo image — self-contained, no binary asset to ship.

**Trade-off:** constrained code-gen over structured-JSON-into-a-template is more fragile per call, and `node --check` only catches syntax errors, not runtime ones (a method call on the wrong pptxgenjs object still throws mid-render). Chosen here because slide *structure* needs to vary with the conversation, not just text filling fixed boxes — a template can't do that.

## Quota tracking — client-side by design, with an explicit ceiling

Spend is estimated from character count (≈4 chars/token), priced per model, accumulated in `localStorage`, and reset on the 1st of the month ([`src/lib/quota.ts`](src/lib/quota.ts)). Zero backend state — the UI (`QuotaIndicator`) is a thin display on top of it, nothing more.

This is an honest trade-off, not an oversight: it's trivially resettable by clearing browser storage and isn't a real spend cap — it's a *usage nudge* for trusted users on a shared budget, not a billing system. A real ceiling has to live server-side (rate limiting, a provider-level spend cap, or a database-backed counter) the moment this needs to hold against someone trying to get around it. For an internal tool with a handful of known users, the simpler thing was the right call; it would not be for a public-facing product.

## Auth — Easy Auth pattern, runnable without Azure

[`middleware.ts`](src/middleware.ts) trusts the `x-ms-client-principal` header that Azure App Service's Easy Auth injects after an Entra ID (OIDC) sign-in — no auth code of our own to get wrong, no tokens to validate, no session store. The trade-off is platform lock-in: this mechanism only exists on Azure App Service. Locally, where Easy Auth's `/.auth/*` endpoints don't exist, the check is bypassed outside `production` so the app runs standalone — the login page and the SSO code path are both still inspectable, just not exercised, without a live Azure tenant.

## Deployment packaging

[`.github/workflows/azure-deploy.yml`](.github/workflows/azure-deploy.yml) builds the Next.js standalone output and ZIP-deploys it to Azure App Service via Kudu on every push to `main`. One thing worth flagging: Next.js's standalone build only bundles *directly imported* packages. `pptxgenjs`, `pdf-parse`, and `mammoth` still need their full dependency trees present at runtime, so they're explicitly `npm install`'d into the standalone folder as a build step. Easy to miss, and the failure mode — works locally, breaks in production — is a nasty one to debug cold.

## Frontend, briefly

The UI itself is deliberately plain: a single-page chat layout in React/Tailwind, no state management library (conversation state is local `useState`, there's only one screen to coordinate), no component framework beyond what Next.js/Tailwind already gives. That's a fit for the current scope, not a considered stance on frontend architecture generally — the engineering decisions worth discussing in this repo are almost all on the backend/integration side above.

---

## What I'd build next

- **Server-side spend enforcement** — a real budget ceiling behind the client-side nudge.
- **Per-provider feature exposure** — prompt caching and extended thinking for Claude, parallel tool calls for GPT, instead of the current lowest-common-denominator streaming contract.
- **Runtime error recovery for PPTX generation** — `node --check` only catches syntax errors; a second pass that catches and repairs *runtime* failures would close the biggest remaining failure mode.
- **Usage analytics** — even anonymized per-model request counts would answer the obvious next question ("which model do people actually reach for?") that client-side-only quota can't.

See [`FEATURE_LIST.json`](FEATURE_LIST.json) for this tracked as structured backlog alongside what's already shipped.
