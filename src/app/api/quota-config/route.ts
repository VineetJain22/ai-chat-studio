// ── QUOTA MODULE ──────────────────────────────────────────────────────────
// Reads pricing and budget from env vars and returns them to the client.
// To remove this feature: delete this file and remove QUOTA blocks from
// page.tsx, and delete src/lib/quota.ts + src/components/QuotaIndicator.tsx
// ─────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'

function parsePrice(env: string | undefined, defaults: [number, number]): { input: number; output: number } {
  if (!env) return { input: defaults[0], output: defaults[1] }
  const parts = env.split(',').map(Number)
  if (parts.length !== 2 || parts.some(isNaN)) return { input: defaults[0], output: defaults[1] }
  return { input: parts[0], output: parts[1] }
}

export function GET() {
  const config = {
    monthlyBudget: parseFloat(process.env.MONTHLY_BUDGET_USD ?? '3.00'),
    pricing: {
      'gpt-5.4-mini':      parsePrice(process.env.PRICE_GPT_MINI,     [0.15,  0.60]),
      'gpt-5-3-codex':     parsePrice(process.env.PRICE_GPT_CODEX,    [1.75, 14.00]),
      'claude-sonnet-4-6': parsePrice(process.env.PRICE_CLAUDE_SONNET,[3.00,  15.00]),
      'deepseek-v3-2':     parsePrice(process.env.PRICE_DEEPSEEK,     [0.14,  0.28]),
    },
  }
  return NextResponse.json(config)
}
