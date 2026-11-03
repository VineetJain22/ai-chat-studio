import { NextResponse } from 'next/server'
import { MODELS } from '@/lib/models'

export function GET() {
  // Only expose display fields to the client — no endpoint URLs or key names
  const models = MODELS.map(({ id, name, description, badge, color, useResponsesAPI, noPpt }) => ({
    id,
    name,
    description,
    badge,
    color,
    ...(useResponsesAPI ? { useResponsesAPI: true } : {}),
    ...(noPpt ? { noPpt: true } : {}),
  }))
  return NextResponse.json(models)
}
