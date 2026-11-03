// ── FEATURE FLAGS ─────────────────────────────────────────────────────────
// Reads FEATURE_* env vars and exposes them to the client.
// All features default ON (true) if the env var is absent.
//
// To toggle on a host like Azure App Service / Vercel: change the env var in
// the platform's dashboard — most platforms restart the app automatically,
// no redeploy needed.
//
// To toggle locally: edit .env.local → save → Next.js hot-reloads the change.
// ─────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'

function flag(envName: string, defaultVal: boolean): boolean {
  const val = process.env[envName]
  if (val === undefined || val === '') return defaultVal
  return val.toLowerCase() !== 'false' && val !== '0'
}

export function GET() {
  return NextResponse.json({
    fileUpload: flag('FEATURE_FILE_UPLOAD', true),  // 📎 File attach in chat
    pptExport:  flag('FEATURE_PPT_EXPORT',  true),  // 📊 "Export as PPT" button
  })
}
