import { marked } from 'marked'
import { useMemo } from 'react'

const G = '#005C32'

// Configure marked once
marked.setOptions({ gfm: true, breaks: true })

export default function MarkdownMessage({ content }: { content: string }) {
  const html = useMemo(() => marked.parse(content) as string, [content])

  return (
    <div
      className="markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
