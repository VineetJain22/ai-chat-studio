// ── FILE UPLOAD MODULE ────────────────────────────────────────────────────
// Extracts text from PDF and Word (.docx) files server-side.
// To remove this feature: delete this file and remove FILE UPLOAD blocks
// from page.tsx.
// ─────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return new NextResponse('Invalid form data', { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return new NextResponse('No file provided', { status: 400 })
  if (file.size > MAX_FILE_SIZE) {
    return new NextResponse('File too large — maximum 10MB', { status: 413 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const name = file.name.toLowerCase()

  try {
    let text = ''
    let pageCount: number | undefined

    if (name.endsWith('.pdf')) {
      const pdfParse = (await import('pdf-parse')).default
      const data = await pdfParse(buffer)
      text = data.text
      pageCount = data.numpages
    } else if (name.endsWith('.docx')) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else {
      return new NextResponse(
        'Unsupported file type. Please upload a PDF or Word (.docx) file.',
        { status: 415 },
      )
    }

    const trimmed = text.trim()
    if (!trimmed) {
      return new NextResponse(
        'No text could be extracted. The file may be scanned or image-based.',
        { status: 422 },
      )
    }

    return NextResponse.json({
      filename: file.name,
      text: trimmed,
      pageCount,
      wordCount: trimmed.split(/\s+/).filter(Boolean).length,
    })
  } catch (err) {
    console.error('File extraction error:', err)
    return new NextResponse('Failed to process file. Please try again.', { status: 500 })
  }
}
