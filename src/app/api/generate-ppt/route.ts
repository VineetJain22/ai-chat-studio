import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { execFile } from 'child_process'
import { writeFile, unlink, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'
import { MODELS } from '@/lib/models'
import { cleanScript, fixApostrophes, normaliseToCommonJS, recoverScript } from '@/lib/pptx-utils'

export const runtime = 'nodejs'

// Use execFile + process.execPath — bypasses /bin/sh entirely
const execAsync = promisify(execFile)

const PPT_SYSTEM_PROMPT = `You are an expert presentation designer with deep knowledge of pptxgenjs (v3).

Your job: read the conversation above and generate a complete, self-contained pptxgenjs Node.js script that produces a high-quality, well-formatted PowerPoint presentation from the content discussed.

The conversation may contain analysis, critique, or back-and-forth refinement — ignore the tone of that commentary and focus purely on extracting the substance: data, insights, recommendations, frameworks, and conclusions. Present the content positively and professionally.

═══════════════════════════════════
PPTXGENJS ESSENTIALS
═══════════════════════════════════
const pptx = new pptxgen()
pptx.layout = 'LAYOUT_WIDE'   // 13.33 x 7.5 inches — always use this

// Slide canvas: 13.33" wide × 7.5" tall
// Safe content area: x:0.4 to x:11.2 (logo lives at x:11.4+, do not place content there)
// Full-bleed background shape: { x:0, y:0, w:13.33, h:7.5 }

// Text
slide.addText("Hello", { x:0.5, y:0.5, w:10.5, h:1, fontSize:24, bold:true, color:"005C32", fontFace:"Calibri", align:"left" })

// Shape
slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.18, h:7.5, fill:{color:"005C32"} })

// Write output — use the exact placeholder string OUTPUT_PATH
pptx.writeFile({ fileName: "OUTPUT_PATH" })

Note: Do NOT add any addImage/addShape calls for a logo badge — one is injected automatically.

═══════════════════════════════════
BRAND KIT (swap these for your own)
═══════════════════════════════════
- Font: Calibri throughout — no exceptions
- Primary green (text / bars / accents): #005C32
- Full-bleed background (title & closing slides): #1B6B45  ← softer green, not the dark brand colour
- Orange accent: #fb923c
- Light background (content slides): #F2F7F4
- Font sizes: 40-44pt titles · 18-22pt section heads · 11-13pt body · 9pt captions
- Heading colour: #005C32 · Body colour: #1a1a1a · Muted: #64748b
- Left-align all body text. Centre only full-bleed title slides.

═══════════════════════════════════
DESIGN RULES — READ CAREFULLY
═══════════════════════════════════
1. PALETTE — #005C32 for text/bars/accents; #1B6B45 for full-bleed title/closing backgrounds; #F2F7F4 for content slide backgrounds
2. SANDWICH STRUCTURE — softer-green title slide → light content slides → softer-green closing slide
3. VARY LAYOUTS — never two consecutive identical structures
4. ACCENT BARS — thin vertical rectangle (w:0.18, h:7.5) on left edge as the primary visual anchor
5. STAT CALLOUTS — for numbers/metrics: large text (54-64pt value, 11pt label) directly on background — no containing box
6. TWO-COLUMN — split slide with colored left panel (w:4.5, green bg) + white right panel for comparisons
7. TYPOGRAPHY-LED — let large bold text do the work where it fits. Not every point needs a container.
8. BOXES & CARDS — use freely when they elevate the content: cards for options/takeaways, a callout box for a key insight, two-column comparison panels. Vary sizes and layout across slides.
9. BREATHING ROOM — leave generous whitespace. Less is more. Max 5 bullet points per slide.
10. HORIZONTAL DIVIDERS — use thin rect (h:0.04) to separate sections instead of boxes where appropriate
11. FULL-BLEED SLIDES — title and closing use #1B6B45 background with white text and orange accents only
12. ICONS & NUMBERED CIRCLES — use when they add elegance and visual structure:
    - Numbered circles (1, 2, 3…) are excellent for steps, priorities, or ranked points — use them freely on process or recommendation slides
    - Emoji icons work well for 3-4 distinct benefit/feature points on a single slide
    - Never use one icon or number per plain bullet — that looks like clip art. Icons work when the layout is built around them (the circle IS the visual anchor, not decoration on top of a list)
    - Elegant circle pattern:
        slide.addShape(pptx.ShapeType.ellipse, { x:0.5, y:1.4, w:0.6, h:0.6, fill:{color:"005C32"} })
        slide.addText("1", { x:0.5, y:1.4, w:0.6, h:0.6, fontSize:18, bold:true, color:"FFFFFF", fontFace:"Calibri", align:"center", valign:"middle" })
        slide.addText("First point text here", { x:1.3, y:1.45, w:9.5, h:0.5, fontSize:13, color:"1a1a1a", fontFace:"Calibri", valign:"middle" })
    - Use green circles (#005C32) with white text, or orange (#fb923c) circles for accent
    - Pick purposeful emoji: 🎯 🌏 📊 💡 🤝 📈 🏆 🔑 🚀
    - Not on title or closing slides
13. NO transparency on text — do not use the transparency property on addText calls. Use lighter hex values instead (e.g. "AECFBE" instead of white with transparency)

═══════════════════════════════════
COORDINATE REFERENCE — use as inspiration, not rigid templates
Mix, combine, adapt, or invent layouts to best suit each slide's content.
═══════════════════════════════════
Title slide    : bg rect {x:0,y:0,w:13.33,h:7.5} fill #1B6B45 · orange bar {x:0,y:0,w:0.18,h:7.5} · white title 52pt centred in {x:0.5,y:2,w:11,h:2} · subtitle 18pt · context/date at y:6.5
Stats slide    : white bg · green bar · title {x:0.5,y:0.35,w:10.5,h:0.8} · 3-4 stat callouts spread across x:0.5→10.5 (60pt number, 11pt label below)
Two-col slide  : left panel {x:0,y:0,w:4.5,fill:#005C32} white text · right content from x:4.8 to x:11.2
Bullets slide  : white bg · green bar · title {x:0.5,y:0.35,w:10.5,h:0.8} · bullets within {x:0.5,y:1.4,w:10.5}
Visual slide   : large bold statement centred on light bg · single accent shape
Closing slide  : bg rect {x:0,y:0,w:13.33,h:7.5} fill #1B6B45 · orange bar · white CTA 46pt · supporting line · contact at bottom

Other layouts to consider when content calls for it:
3-col grid     : three equal columns, each x:0.5 / x:4.7 / x:8.9, w:3.8, content from y:1.4
Timeline       : horizontal flow — circles or numbered steps spread across x:0.5→11.2 at y:3.5, labels above/below
Quote slide    : large italic quote 28-32pt centred in {x:1,y:2,w:11,h:3} · attribution 14pt below · accent shape or colour block behind
Image+text     : right half image placeholder area {x:6.5,y:0.8,w:5.5,h:6} · left text content x:0.5→5.8
Process flow   : 3-5 step boxes with arrows — boxes w:2.2, spaced across slide, connecting arrow shapes between
KPI dashboard  : 2×2 or 2×3 card grid — each card a rect with rounded corners, metric value large, label small

═══════════════════════════════════
SCRIPT REQUIREMENTS
═══════════════════════════════════
- First line must be: // TITLE: <concise 4-6 word presentation title>
- CRITICAL: Use double quotes (") for ALL text string values in addText calls — never single quotes for text content. Apostrophes in words like organisation's, it's, don't will break single-quoted strings.
- Start with: const pptxgen = require('pptxgenjs')
- The script must be complete and self-contained
- Use exactly 4-5 slides — be concise, no redundant slides
- Minimal inline comments — code only, no explanatory prose
- Do NOT use forEach, map, or any loops — write each addText/addShape/addImage call individually on its own single line
- Each API call must be on ONE line — never split across multiple lines
- NEVER use variable names for property values — always use literal values: hex strings for colors (e.g. color:"005C32"), numbers for sizes. Never write color=GREEN or color:GREEN.
- End with: pptx.writeFile({ fileName: 'OUTPUT_PATH' })
- OUTPUT ONLY the JavaScript. No markdown fences. No explanation.`

async function callLLM(modelId: string, messages: { role: string; content: string }[]): Promise<string> {
  const model = MODELS.find((m) => m.id === modelId)
  if (!model) throw new Error(`Unknown model: ${modelId}`)

  const endpoint = process.env[model.endpointEnv]
  const apiKey   = process.env[model.apiKeyEnv]
  if (!endpoint || !apiKey) throw new Error(`Model ${model.name} not configured`)

  if (model.provider === 'azure-anthropic') {
    const anthropic = new Anthropic({
      baseURL: `${endpoint}/anthropic`,
      apiKey,
      defaultHeaders: { 'api-key': apiKey },
    })
    const anthropicMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    const response = await anthropic.messages.create({
      model: model.deploymentName,
      max_tokens: 16000,
      system: PPT_SYSTEM_PROMPT,
      messages: anthropicMessages,
    })
    return response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
  }

  const foundryBase = endpoint.endsWith('/openai/v1') ? endpoint : `${endpoint}/openai/v1`
  const client = new OpenAI({
    baseURL: foundryBase,
    apiKey,
    defaultHeaders: { 'api-key': apiKey },
  })
  // GPT models require max_completion_tokens; other foundry models (DeepSeek etc) use max_tokens
  const tokenParam = model.id.startsWith('gpt')
    ? { max_completion_tokens: 16000 }
    : { max_tokens: 16000 }
  const response = await client.chat.completions.create({
    model: model.deploymentName,
    ...tokenParam,
    messages: [
      { role: 'system', content: PPT_SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
  })
  return response.choices[0]?.message?.content ?? ''
}

function extractTitle(script: string): string {
  const match = script.match(/\/\/\s*TITLE:\s*(.+)/)
  if (!match) return 'Generated-Presentation'
  return match[1].trim().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
}

// Fix `property=value` inside object literals (GPT sometimes uses = instead of :)
// e.g. color=GREEN  →  color:"GREEN"  (runtime will fail gracefully vs syntax error)
function fixObjectAssignment(script: string): string {
  // Replace word=word patterns inside { } that look like object properties
  return script.replace(/(\{[^}]*?)(\b(\w+)=([A-Za-z_][A-Za-z0-9_]*))/g, (_, pre, __, key, val) => {
    // Known color variable names → replace with brand hex
    const colorMap: Record<string, string> = {
      GREEN: '005C32', DARKGREEN: '005C32', MIDGREEN: '1B6B45',
      ORANGE: 'fb923c', WHITE: 'FFFFFF', BLACK: '000000',
      LIGHTBG: 'F2F7F4', MUTED: '64748b', BODY: '1a1a1a',
    }
    const replacement = colorMap[val.toUpperCase()] ?? val
    return `${pre}${key}:"${replacement}"`
  })
}


function ensureWriteFile(script: string): string {
  if (script.includes('writeFile')) return script
  const lines = script.split('\n')
  let lastGood = lines.length - 1
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim()
    if (t.endsWith(')') || t.endsWith('}') || t.endsWith(',') || t === '') {
      lastGood = i
      break
    }
  }
  return lines.slice(0, lastGood + 1).join('\n') + `\n\npptx.writeFile({ fileName: 'OUTPUT_PATH' })\n`
}

interface SlideSummary {
  heading : string
  content : string[]   // all other text lines on the slide, deduped
}

interface PptSummary {
  title  : string
  slides : SlideSummary[]
}

// Extract a per-slide summary from the generated script.
// heading  = the largest-fontSize addText (the slide title)
// content  = all other addText strings on that slide (bullets, stats, labels…)
// This gives the LLM enough detail to make targeted updates to specific slides.
function extractSlideSummary(script: string): PptSummary {
  const title = extractTitle(script).replace(/-/g, ' ')

  const slideVars: string[] = []
  for (const m of script.matchAll(/const\s+(\w+)\s*=\s*pptx\.addSlide\(/g)) {
    slideVars.push(m[1])
  }

  const slides: SlideSummary[] = slideVars.map((v, i) => {
    // Collect every addText call on this slide with its fontSize
    const entries: { text: string; size: number }[] = []
    const pattern = new RegExp(
      `${v}\\.addText\\("([^"]{2,120})"[^;\\n]*fontSize:\\s*(\\d+)`,
      'g'
    )
    for (const m of script.matchAll(pattern)) {
      entries.push({ text: m[1].trim(), size: parseInt(m[2]) })
    }

    if (!entries.length) return { heading: `Slide ${i + 1}`, content: [] }

    // Largest font = heading; everything else = content (dedupe, skip very short)
    const maxSize = Math.max(...entries.map((e) => e.size))
    const heading = entries.find((e) => e.size === maxSize)?.text ?? `Slide ${i + 1}`
    const content = [...new Set(
      entries
        .filter((e) => e.size < maxSize && e.text.length > 3 && e.text !== heading)
        .map((e) => e.text)
    )]

    return { heading, content }
  })

  return { title, slides }
}

// Injects a small branded badge (shape + initials, not an image file — keeps
// this feature free of any binary asset dependency) into the top-right corner
// of every slide, matching the safe margin reserved in the system prompt.
function injectLogoBadge(script: string, initials: string): string {
  let s = script.replace(
    /\w+\.add(?:Image|Shape)\(\s*\{[^}]*LOGO_BADGE[^}]*\}\s*\)/gi,
    ''
  )
  const slideNames: string[] = []
  for (const m of s.matchAll(/const\s+(\w+)\s*=\s*pptx\.addSlide\(/g)) {
    slideNames.push(m[1])
  }
  for (let i = 0; i < slideNames.length; i++) {
    const name = slideNames[i]
    const badgeCode =
      `${name}.addShape(pptx.ShapeType.roundRect, { x:11.55, y:0.12, w:1.65, h:0.55, rectRadius:0.08, fill:{color:'005C32'} })\n` +
      `${name}.addText('${initials}', { x:11.55, y:0.12, w:1.65, h:0.55, fontSize:11, bold:true, color:'FFFFFF', fontFace:'Calibri', align:'center', valign:'middle' })`
    if (i < slideNames.length - 1) {
      const nextName = slideNames[i + 1]
      s = s.replace(
        new RegExp(`(const\\s+${nextName}\\s*=\\s*pptx\\.addSlide\\()`),
        `${badgeCode}\n\n$1`
      )
    } else {
      s = s.replace(/(\npptx\.writeFile\()/, `\n${badgeCode}\n$1`)
    }
  }
  return s
}

export async function POST(req: NextRequest) {
  let body: { messages: { role: string; content: string }[]; modelId: string }

  try {
    body = await req.json()
  } catch {
    return new NextResponse('Invalid request body', { status: 400 })
  }

  const { messages, modelId } = body

  if (!messages?.length || !modelId) {
    return new NextResponse('messages and modelId are required', { status: 400 })
  }

  // Context trimming for token efficiency:
  //
  // First generation (no summary yet):
  //   → send the full conversation as-is
  //
  // Update iterations (summary exists):
  //   → original content (everything before the first summary) — needed so the
  //      LLM can still reference topics from the original conversation when adding
  //      or expanding slides
  //   + latest summary — tells the LLM what the current deck looks like
  //   + feedback after the latest summary — what the user wants changed
  //   Dropped: messages between PPT rounds (intermediate chat noise)
  //
  const PPT_SUMMARY_MARKER = '📊 **Presentation generated'
  const firstSummaryIdx = messages.findIndex((m) => m.content.startsWith(PPT_SUMMARY_MARKER))
  const lastSummaryIdx  = messages.findLastIndex((m) => m.content.startsWith(PPT_SUMMARY_MARKER))

  const isUpdate = firstSummaryIdx !== -1

  const contextMessages = isUpdate
    ? [
        ...messages.slice(0, firstSummaryIdx),          // original conversation
        messages[lastSummaryIdx],                        // latest slide summary
        ...messages.slice(lastSummaryIdx + 1),           // feedback after latest summary
      ]
    : messages

  const promptMessages = [
    ...contextMessages,
    {
      role: 'user',
      content: isUpdate
        ? 'Using the slide summary above as the current deck state and applying any feedback that follows it, regenerate the complete pptxgenjs script. You may also draw on the original conversation above for any content not yet covered. Output only the JavaScript code, starting with the // TITLE: comment.'
        : 'Based on our entire conversation above, generate a complete pptxgenjs script for a well-designed, on-brand presentation. Output only the JavaScript code, starting with the // TITLE: comment.',
    },
  ]

  let script: string
  try {
    const raw = await callLLM(modelId, promptMessages)
    script    = fixObjectAssignment(fixApostrophes(normaliseToCommonJS(cleanScript(raw))))
  } catch (err) {
    return new NextResponse(`LLM error: ${(err as Error).message}`, { status: 502 })
  }

  if (!script.includes('pptxgen')) {
    return new NextResponse('The AI did not return a valid presentation script. Please try again.', { status: 422 })
  }

  script = ensureWriteFile(script)

  const id         = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const scriptPath = path.join(tmpdir(), `ppt-${id}.js`)
  const outputPath = path.join(tmpdir(), `ppt-${id}.pptx`)

  const title    = extractTitle(script)
  const filename = `${title}.pptx`

  const escapedOutput = outputPath.replace(/\\/g, '\\\\')

  const finalScript = injectLogoBadge(script, 'AI')
    .replace(/OUTPUT_PATH/g, escapedOutput)

  const execOpts = {
    timeout: 60_000,
    env: { ...process.env, NODE_PATH: path.join(process.cwd(), 'node_modules') },
  }

  try {
    await writeFile(scriptPath, finalScript, 'utf8')

    try {
      await execAsync(process.execPath, ['--check', scriptPath], execOpts)
    } catch (syntaxErr) {
      const errMsg = (syntaxErr as Error).message
      console.error('Syntax check failed:', errMsg.slice(0, 200))

      // Extract 1-based line number from Node error (e.g. "ppt-xxx.js:333\n}")
      const lineMatch = errMsg.match(/\.js:(\d+)\n/)
      const errorLine = lineMatch ? parseInt(lineMatch[1], 10) : null
      if (errorLine) console.log(`[PPT] Error at line ${errorLine} — trimming before it`)

      const recovered = recoverScript(finalScript, escapedOutput, errorLine)
      await writeFile(scriptPath, recovered, 'utf8')

      // Second check — verify recovery actually fixed the syntax
      try {
        await execAsync(process.execPath, ['--check', scriptPath], execOpts)
        console.log('[PPT] Recovery succeeded')
      } catch {
        throw new Error('SyntaxError: Generated script could not be repaired. Please try again.')
      }
    }

    await execAsync(process.execPath, [scriptPath], execOpts)
    const file = await readFile(outputPath)

    // Build slide summary — the full detail is embedded in the chat message so
    // the LLM has per-slide content for targeted follow-up edits.
    const summary = extractSlideSummary(script)
    const outlineHeader = Buffer.from(JSON.stringify(summary), 'utf8').toString('base64')

    return new NextResponse(file, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': file.length.toString(),
        'X-Ppt-Outline'  : outlineHeader,
      },
    })
  } catch (err) {
    const msg = (err as Error).message ?? ''
    console.error('PPT generation error:', msg.slice(0, 500))
    let friendly = 'Presentation generation failed. Please try again.'
    if (msg.includes('timeout') || msg.includes('timed out'))
      friendly = 'Generation timed out. Please try again.'
    else if (msg.includes('MODULE_NOT_FOUND'))
      friendly = 'Server configuration error. Please try again.'
    else if (msg.includes('SyntaxError'))
      friendly = 'The AI generated invalid code. Please try again.'
    return new NextResponse(friendly, { status: 500 })
  } finally {
    await unlink(scriptPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
  }
}
