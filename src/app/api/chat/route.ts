import { NextRequest, NextResponse } from 'next/server'
import OpenAI, { AzureOpenAI } from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { MODELS } from '@/lib/models'

export const runtime = 'nodejs'

const CHAT_SYSTEM_PROMPT = `You are a helpful, concise, professional AI assistant. When analysing problems, draw on relevant frameworks and evidence. Respond in the same language the user writes in.`

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Content-Type-Options': 'nosniff',
}

const encoder = new TextEncoder()

function streamResponse(
  gen: () => AsyncGenerator<string> | AsyncIterable<string>,
  onCancel?: () => void,
) {
  return new NextResponse(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const text of gen()) {
            controller.enqueue(encoder.encode(text))
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upstream error'
          controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`))
        } finally {
          controller.close()
        }
      },
      cancel: onCancel,
    }),
    { headers: STREAM_HEADERS },
  )
}

export async function POST(req: NextRequest) {
  let body: { modelId: string; messages: ChatCompletionMessageParam[] }

  try {
    body = await req.json()
  } catch {
    return new NextResponse('Invalid request body', { status: 400 })
  }

  const { modelId, messages } = body

  // Keep only the most recent turns to control input token cost.
  // ── FILE UPLOAD START ──────────────────────────────────────────────────
  // Always pin messages containing document content so the LLM never
  // silently loses uploaded file context mid-conversation.
  const MAX_HISTORY = 10
  const isDocMessage = (m: ChatCompletionMessageParam) =>
    typeof m.content === 'string' && m.content.startsWith('[Document:')

  // Pin last 2 document messages + last MAX_HISTORY non-doc messages,
  // then filter in-place to preserve alternating user/assistant order.
  const docIndices = new Set(
    messages
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => isDocMessage(m))
      .slice(-2)
      .map(({ i }) => i)
  )
  const recentNonDocIndices = new Set(
    messages
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => !isDocMessage(m))
      .slice(-MAX_HISTORY)
      .map(({ i }) => i)
  )
  const trimmedMessages = messages.filter((_, i) => docIndices.has(i) || recentNonDocIndices.has(i))
  // ── FILE UPLOAD END ────────────────────────────────────────────────────

  const model = MODELS.find((m) => m.id === modelId)
  if (!model) {
    return new NextResponse(`Unknown model: ${modelId}`, { status: 400 })
  }

  const endpoint = process.env[model.endpointEnv]
  const apiKey = process.env[model.apiKeyEnv]

  if (!endpoint || !apiKey) {
    return new NextResponse(
      `Model "${model.name}" is not configured. Add ${model.endpointEnv} and ${model.apiKeyEnv} to .env.local.`,
      { status: 503 },
    )
  }

  // ── Anthropic (Claude) via Azure AI Services native API ──────────────────
  if (model.provider === 'azure-anthropic') {
    const anthropic = new Anthropic({
      baseURL: `${endpoint}/anthropic`,
      apiKey,
      defaultHeaders: { 'api-key': apiKey },
    })

    const anthropicMessages = trimmedMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content) }))

    const upstream = anthropic.messages.stream({
      model: model.deploymentName,
      max_tokens: 4096,
      system: CHAT_SYSTEM_PROMPT,
      messages: anthropicMessages,
    })

    return streamResponse(
      async function* () {
        for await (const event of upstream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            yield event.delta.text
          }
        }
      },
      () => upstream.controller.abort(),
    )
  }

  // ── OpenAI / Azure OpenAI ────────────────────────────────────────────────
  // azure-foundry endpoints are Azure AI Services base URLs — append /openai/v1 so the
  // OpenAI SDK resolves /chat/completions correctly.
  const foundryBase = endpoint.endsWith('/openai/v1') ? endpoint : `${endpoint}/openai/v1`
  const client: OpenAI =
    model.provider === 'azure-openai'
      ? new AzureOpenAI({ endpoint, apiKey, apiVersion: '2024-10-21' })
      : new OpenAI({ baseURL: foundryBase, apiKey, defaultHeaders: { 'api-key': apiKey } })

  // ── Responses API (GPT-5 gen models like Codex) ─────────────────────────
  if (model.useResponsesAPI) {
    const stream = await (client as any).responses.create({
      model: model.deploymentName,
      instructions: CHAT_SYSTEM_PROMPT,
      input: trimmedMessages,
      reasoning: { effort: model.reasoningEffort ?? 'medium' },
      stream: true,
    })
    return streamResponse(async function* () {
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          yield event.delta
        }
      }
    })
  }

  const upstream = await client.chat.completions.create({
    model: model.deploymentName,
    messages: [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      ...trimmedMessages,
    ],
    stream: true,
    max_completion_tokens: 4096,
  })

  return streamResponse(
    async function* () {
      for await (const chunk of upstream) {
        const content = chunk.choices[0]?.delta?.content
        if (content) yield content
      }
    },
    () => upstream.controller.abort(),
  )
}
