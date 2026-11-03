// ── QUOTA MODULE ──────────────────────────────────────────────────────────
import { getPercentage, nextResetLabel } from '@/lib/quota'

interface Props {
  spent: number
  budget: number
}

export default function QuotaIndicator({ spent, budget }: Props) {
  const pct       = getPercentage(spent, budget)
  const remaining = Math.max(0, budget - spent)

  const barColor =
    pct >= 90 ? '#ef4444' :
    pct >= 70 ? '#f97316' :
    '#34d399'

  const textColor =
    pct >= 90 ? '#ef4444' :
    pct >= 70 ? '#f97316' :
    'rgba(255,255,255,0.5)'

  // Precision scales with how much has been spent, not the absolute value
  // This ensures even tiny GPT Mini costs are visible
  const dp = spent < 0.001 ? 4 : spent < 0.01 ? 3 : 2
  const fmt    = (n: number) => n.toFixed(dp)
  const fmtRaw = (n: number) => n.toFixed(2)   // budget always 2dp

  return (
    <div className="px-4 py-3 border-t border-white/10">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[9px] font-bold tracking-[0.15em] uppercase text-white/30">
          Usage
        </span>
        <span className="text-[10px] font-medium" style={{ color: textColor }}>
          ${fmt(remaining)} left
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-white/10 overflow-hidden mb-1.5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>

      <div className="flex justify-between items-baseline">
        <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          ${fmt(spent)} of ${fmtRaw(budget)}
        </span>
        <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Resets {nextResetLabel()}
        </span>
      </div>

      {pct >= 90 && (
        <div className="mt-2 text-[9px] text-center py-1 rounded-lg bg-red-500/20 text-red-300">
          {pct >= 100 ? 'Monthly limit reached' : 'Approaching monthly limit'}
        </div>
      )}
    </div>
  )
}
