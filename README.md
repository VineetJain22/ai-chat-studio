# AI Chat Studio

A multi-LLM chat app: GPT, Claude, and DeepSeek side by side behind one UI, one streaming protocol, and one shared dollar budget.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · OpenAI SDK · Anthropic SDK · models served via Azure AI Foundry

---

## What it does

- Chat with four models (OpenAI GPT-5.4 Mini, GPT-5.3 Codex, Anthropic Claude Sonnet 4.6, DeepSeek V3.2) through one interface, switching mid-conversation.
- Streams tokens from all three underlying provider API shapes through a single response format the frontend doesn't need to know about.
- Attach a PDF or Word doc; its extracted text is injected into the conversation and pinned so it survives history trimming.
- Turn the conversation into a branded `.pptx` deck — the LLM writes the slide-generation code, the server checks and runs it.
- Tracks estimated spend per user against a monthly budget, client-side, with no backend cost.
- Demonstrates a production SSO pattern (Azure Entra ID via App Service Easy Auth) without requiring Azure to run locally.

## Why this exists

A custom-built multi-LLM gateway mitigates the risk of tying an organization down to one model provider — swapping or adding a model is a config entry, not a migration. It also flips the usual relationship with AI tooling: instead of buying a generic copilot and configuring your workflow around it, you build the copilot around how your organization actually works — a branded-deck generator that matches your own templates, a file-upload path that stays in your tenant, a budget model tied to your own cost structure. The organization shapes the tool, not the other way round.

Coding agents are shifting that build-vs-buy trade-off. The traditional case for buying — a generic product is cheaper and faster than building and maintaining your own — gets weaker when an agent can build and maintain the custom version at a fraction of the earlier cost. This repo is one instance of that: a purpose-built internal tool, not a configured-down generic one.

Beyond that framing, most "chat with an LLM" demos hardcode one provider and stop. The useful 20% is everything that comes after: routing between genuinely different API shapes without leaking that difference into the UI, making a presentation deck reliably from LLM-generated code, and giving users a cost signal when you're paying per token across three different pricing models. Those are the pieces this repo is actually about — see [`ARCHITECTURE.md`](ARCHITECTURE.md) for the detail and the trade-offs behind each one.

## Where the models come from

All four models are deployments on a single **Azure AI Foundry** resource rather than four separate vendor integrations — one endpoint/key surface fronting OpenAI's, Anthropic's, and DeepSeek's models. That's *why* the provider-routing abstraction in [`src/lib/models.ts`](src/lib/models.ts) is a config table rather than per-vendor SDK setup scattered through the app: Foundry normalizes the hosting and billing layer, but each model family still speaks a different request/response shape on top of it, which is the problem the routing layer actually solves. More on that in `ARCHITECTURE.md`.

---

## How this was built

This repo (and the internal tool it's extracted from) was built working with Claude Code as a daily coding agent, not just for one-off snippets. Three files make that practice visible with optimized harness:

- [`CLAUDE.md`](CLAUDE.md) — the actual onboarding file an agent reads first in this repo: architecture summary, key files, conventions. Written the way I write it for real projects — lean, with detail pushed to reference docs on demand rather than crammed into one file.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the deeper decisions-and-trade-offs log, the kind of document that makes an agent (or a reviewer) useful on a codebase instead of guessing at intent.
- [`FEATURE_LIST.json`](FEATURE_LIST.json) — a structured log of what's built and what's backlog, with the rationale/trade-off for each, the way I actually scope and hand off work to an agent in slices rather than one unbounded prompt.

## Project structure

```
src/
  app/
    api/
      chat/route.ts            # streaming + provider routing + history/doc pinning
      upload/route.ts          # PDF (pdf-parse) / Word (mammoth) text extraction
      generate-ppt/route.ts    # LLM → pptxgenjs script → syntax-check → execute → .pptx
      models/route.ts          # model list + capability flags → client
      quota-config/route.ts    # budget + per-model pricing → client
      features/route.ts        # FEATURE_* env vars → client
    login/page.tsx             # Entra ID sign-in page
    page.tsx                   # chat UI: sidebar, streaming, file attach, PPT export
  lib/
    models.ts                  # provider/model registry (routing source of truth)
    pptx-utils.ts              # cleanScript / recoverScript / ensureWriteFile
    quota.ts                   # client-side cost estimation + localStorage quota
  middleware.ts                 # Easy Auth header trust (bypassed outside production)
```

## Running it locally

```bash
npm install
cp .env.local.example .env.local   # fill in your own Azure AI Foundry endpoint + key
npm run dev
```

Opens at `http://localhost:3000`. No sign-in required locally — Easy Auth only exists on deployed Azure App Service, so the middleware check is bypassed outside `production`. Any model without a configured endpoint/key fails gracefully in the chat UI rather than crashing the request.

Use `npm run dev`, not `npm run build && npm start` — the latter sets `NODE_ENV=production`, which re-enables the Easy Auth gate with no Easy Auth present locally to satisfy it, and you'll hit a login redirect with no way through.

See [`.env.local.example`](.env.local.example) for the full environment variable list.

## Build vs. adopt an existing OSS chat UI

Comparable open-source projects exist — Open WebUI, LibreChat, Lobe Chat — and are more fully featured than this repo for the general "self-hosted ChatGPT-alternative" case (plugins, multi-user accounts, broader provider matrices, chat branching). If the goal were purely "give a team a working multi-LLM chat tool fast," adopting one of those would usually beat building from scratch.

This was still built from scratch, deliberately: the actual goal was narrower — a chat tool wired to one organization's existing Azure AI Foundry deployment and budget model exactly, built as the base for the PPTX-generation and RAG features it needed to grow into next (neither of which an off-the-shelf chat UI is built around). For a one-off tool with known, specific extension points, a smaller fully-understood codebase was worth more than a bigger feature set wrapped around someone else's architecture.

---

*This repo is an anonymized extract of an internal tool, rebuilt from scratch for a focused single-purpose chat UI (the original also includes a RAG knowledge-search pipeline and a multi-step proposal-document generator — the former is a separate portfolio project in progress). All organization-specific references, credentials, and branding have been removed or genericized.*
