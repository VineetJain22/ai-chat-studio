# AI Chat Studio

> This is what a coding agent (e.g. Claude Code) reads first when working in this repo. Deep rationale lives in `ARCHITECTURE.md` — read it on demand when a change touches that area, not up front; keeping this file short keeps every session's context cost low. `FEATURE_LIST.json` tracks what's built, what's backlog, and the trade-off behind each.

## Run locally

```bash
npm install
cp .env.local.example .env.local   # fill in your own Azure AI Foundry endpoint + key
npm run dev
# → http://localhost:3000
```

No sign-in needed locally — see Auth below.

---

## Architecture

| Layer | Detail |
|-------|--------|
| Framework | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Auth | Azure App Service Easy Auth + Entra ID SSO. `middleware.ts` trusts `x-ms-client-principal` in production; bypassed outside production since Easy Auth doesn't exist under `next dev`. |
| Models | GPT-5.4 Mini, GPT-5.3 Codex, Claude Sonnet 4.6, DeepSeek V3.2 — all Azure AI Foundry deployments (see `ARCHITECTURE.md`) |
| Deploy | GitHub Actions → Next.js standalone build → Kudu ZIP deploy to Azure App Service |

## Key files

- `src/lib/models.ts` — model/provider registry; add a model here, not in the route
- `src/app/api/chat/route.ts` — streaming + provider routing + document pinning
- `src/lib/pptx-utils.ts` — shared pptxgenjs utilities: `cleanScript`, `recoverScript`, `ensureWriteFile`
- `src/app/api/generate-ppt/route.ts` — LLM-generated pptxgenjs script → syntax-check → execute → `.pptx`
- `src/app/api/upload/route.ts` — PDF (`pdf-parse@1`) / Word (`mammoth`) text extraction
- `src/lib/quota.ts` — client-side, localStorage-based cost estimation and budget tracking
- `src/middleware.ts` — auth guard

## Adding a new model

Add an entry to `MODELS` in `src/lib/models.ts`:

```ts
{
  id: 'model-id',
  name: 'Display Name',
  description: 'Provider · tagline',
  provider: 'azure-foundry' | 'azure-anthropic' | 'azure-openai',
  deploymentName: 'exact-azure-deployment-name',
  endpointEnv: 'ENV_VAR_NAME',
  apiKeyEnv: 'ENV_VAR_NAME',
  badge: 'GPT',
  color: '#60a5fa',

  // optional:
  useResponsesAPI: true,      // GPT-5-class reasoning models — /responses, not /chat/completions
  reasoningEffort: 'medium',
  noPpt: true,                // hide PPT button if the model isn't suited to pptxgenjs codegen
}
```

That's the only file that needs to know about a new provider in the common case — `/api/chat` and the UI both read off this config.

## Architectural decisions (summary — see `ARCHITECTURE.md` for the "why")

| Decision | Detail |
|----------|--------|
| One Foundry resource, three wire formats | Hosting/billing is unified; the request/response shape per provider is not — that's what the routing layer handles |
| Document pinning filters in place | Never concatenate pinned + trimmed messages — breaks user/assistant alternation, which Anthropic's API rejects |
| PPTX via LLM codegen, not templating | Trades generation reliability for structural flexibility; mitigated with syntax-check + truncate-and-recover + one retry |
| `execFile`, never `exec` | No shell → no injection surface, no `/bin/sh` environment dependency |
| Quota is client-side only | A usage nudge, not a spend cap — explicit, not an oversight (see `ARCHITECTURE.md`) |
| Easy Auth bypassed outside production | Lets the repo run and be reviewed without a live Azure tenant |

## Conventions for agents working in this repo

- Keep this file short; push "why" detail to `ARCHITECTURE.md` rather than growing this one.
- Log new non-trivial work in `FEATURE_LIST.json` (status + one-line rationale/trade-off) rather than only in commit messages — it's the thing a future session (agent or human) reads to pick up context fast.
- Favor one declarative config (like `MODELS`) over branching scattered across call sites when adding provider- or model-specific behavior.
- This repo is a portfolio extract of a larger internal tool; don't reintroduce organization-specific names, URLs, or credentials when porting logic back in from elsewhere.
