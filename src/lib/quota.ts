// ── QUOTA MODULE ──────────────────────────────────────────────────────────
// Client-side spending tracker using localStorage.
// Resets on the 1st of each month.
// To remove: delete this file + src/components/QuotaIndicator.tsx and
// remove QUOTA blocks from page.tsx.
// ─────────────────────────────────────────────────────────────────────────

export interface ModelPricing {
  input: number   // USD per 1M input tokens
  output: number  // USD per 1M output tokens
}

export interface QuotaConfig {
  monthlyBudget: number
  pricing: Record<string, ModelPricing>
}

export interface QuotaStore {
  month: string   // YYYY-MM — resets when month changes
  spent: number   // USD spent so far
}

const QUOTA_KEY = 'chat-quota'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function loadQuota(): QuotaStore {
  if (typeof window === 'undefined') return { month: currentMonth(), spent: 0 }
  try {
    const raw = localStorage.getItem(QUOTA_KEY)
    if (!raw) return { month: currentMonth(), spent: 0 }
    const stored: QuotaStore = JSON.parse(raw)
    // Reset if it's a new month
    if (stored.month !== currentMonth()) return { month: currentMonth(), spent: 0 }
    return stored
  } catch {
    return { month: currentMonth(), spent: 0 }
  }
}

export function saveQuota(store: QuotaStore): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(QUOTA_KEY, JSON.stringify(store))
}

/** Estimate tokens from character count (1 token ≈ 4 chars) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Calculate cost in USD for a request/response pair (estimates tokens from text length) */
export function calcCost(
  inputText: string,
  outputText: string,
  modelId: string,
  pricing: Record<string, ModelPricing>,
): number {
  const price = pricing[modelId] ?? { input: 1.00, output: 3.00 }
  const inputTokens  = estimateTokens(inputText)
  const outputTokens = estimateTokens(outputText)
  return (inputTokens / 1_000_000) * price.input +
         (outputTokens / 1_000_000) * price.output
}

/** Calculate cost in USD from exact token counts (use when the API returns usage data) */
export function calcCostFromTokens(
  inputTokens: number,
  outputTokens: number,
  modelId: string,
  pricing: Record<string, ModelPricing>,
): number {
  const price = pricing[modelId] ?? { input: 1.00, output: 3.00 }
  return (inputTokens / 1_000_000) * price.input +
         (outputTokens / 1_000_000) * price.output
}

/** Add cost to running total and persist. Returns new spent amount. */
export function recordSpend(cost: number): number {
  const store = loadQuota()
  const updated: QuotaStore = { ...store, spent: store.spent + cost }
  saveQuota(updated)
  return updated.spent
}

export function getPercentage(spent: number, budget: number): number {
  if (budget <= 0) return 0
  return Math.min(100, (spent / budget) * 100)
}

export function isOverBudget(spent: number, budget: number): boolean {
  return spent >= budget
}

/** First day of next month as a display string e.g. "1 Jun" */
export function nextResetLabel(): string {
  const d = new Date()
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return next.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
