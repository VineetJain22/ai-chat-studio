/**
 * pptx-utils.ts — shared pptxgenjs code generation utilities
 * Used by: /api/generate-ppt (chat PPT) and /api/generate-proposal-ppt (proposal builder v1)
 */

/** Strip markdown fences and find the start of the JavaScript code */
export function cleanScript(raw: string): string {
  const fenceMatch = raw.match(/```(?:javascript|js)?\n?([\s\S]*?)\n?```/)
  if (fenceMatch) return fenceMatch[1].trim()
  const requireIdx = raw.indexOf("require('pptxgenjs')")
  if (requireIdx !== -1) {
    const lineStart = raw.lastIndexOf('\n', requireIdx - 1) + 1
    return raw.slice(lineStart).trim()
  }
  const titleIdx = raw.indexOf('// TITLE:')
  if (titleIdx !== -1) return raw.slice(titleIdx).trim()
  const codeStart = raw.search(/^(?:const|var|let|\/\/)/m)
  return codeStart !== -1 ? raw.slice(codeStart).trim() : raw.trim()
}

/** Escape apostrophes inside text strings so they don't break single-quoted JS strings */
export function fixApostrophes(script: string): string {
  return script.replace(/(?<=[a-zA-Z])'(?=[a-zA-Z])/g, "\\'")
}

/** Convert ES module import syntax to CommonJS require() */
export function normaliseToCommonJS(script: string): string {
  return script.replace(
    /^import\s+(\w+)\s+from\s+(['"`])([\w@/-]+)\2/gm,
    (_, name, __, pkg) => `const ${name} = require('${pkg}')`
  )
}

/**
 * Ensure the script ends with a writeFile call pointing at the correct temp path.
 * ALWAYS replaces any existing writeFile call — the LLM often invents its own path
 * (e.g. "output/Foo.pptx") which fails at runtime. We own this line.
 */
export function ensureWriteFile(script: string, outputPath: string): string {
  const writeFileLine = `await pptx.writeFile({ fileName: '${outputPath}' })`

  // Replace any existing pptx.writeFile(...) call, regardless of the path it uses
  if (script.includes('pptx.writeFile')) {
    return script.replace(/await\s+pptx\.writeFile\s*\([^)]+\)/g, writeFileLine)
  }

  // No writeFile at all — append it after the last complete statement
  const lines = script.split('\n')
  let lastGood = lines.length - 1
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim()
    if (t.endsWith(')') || t.endsWith('}') || t.endsWith(',') || t.length === 0) {
      lastGood = i; break
    }
  }
  return lines.slice(0, lastGood + 1).join('\n') + '\n' + writeFileLine + '\n'
}

/** Wrap script in async IIFE if it uses await but isn't already async */
export function wrapAsync(script: string): string {
  if (!script.includes('await')) return script
  if (script.includes('async function') || script.includes('(async')) return script
  return `;(async () => {\n${script}\n})()`
}

/**
 * Trim script to last complete statement before errorLine (if known) and re-append writeFile.
 * Used as recovery after a syntax check failure.
 * @param errorLine 1-based line number from the Node.js syntax error, if available.
 */
export function recoverScript(script: string, outputPath: string, errorLine?: number | null): string {
  const lines = script.split('\n')
  // Search backwards from just before the error line (or from the end if unknown)
  const ceiling = (errorLine && errorLine > 1) ? errorLine - 2 : lines.length - 1

  let lastGood = 0
  for (let i = Math.min(ceiling, lines.length - 1); i >= 0; i--) {
    const t = lines[i].trim()
    if ((t.endsWith(')') || t.endsWith('}')) && !t.startsWith('//')) {
      lastGood = i; break
    }
  }
  const recovered = lines.slice(0, lastGood + 1).join('\n') +
    "\nawait pptx.writeFile({ fileName: '" + outputPath + "' })\n"
  return wrapAsync(recovered)
}
