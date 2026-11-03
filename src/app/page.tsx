'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import MarkdownMessage from '@/components/MarkdownMessage'
import QuotaIndicator from '@/components/QuotaIndicator'
import { loadQuota, calcCost, recordSpend, isOverBudget, type QuotaConfig } from '@/lib/quota'

interface Model {
  id: string
  name: string
  description: string
  badge: string
  color: string
  useResponsesAPI?: boolean
  noPpt?: boolean
}

interface Features {
  fileUpload: boolean
  pptExport: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  modelId?: string
  modelName?: string
}

const PPT_SUMMARY_MARKER = '📊 **Presentation generated'
const G = '#005C32'
const GL = '#F2F7F4'

export default function ChatPage() {
  const [models, setModels] = useState<Model[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [generatingPpt, setGeneratingPpt] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Full per-slide detail for LLM context on PPT follow-ups — not shown in chat
  const pptDetailRef = useRef<string | null>(null)

  const [quotaConfig, setQuotaConfig] = useState<QuotaConfig | null>(null)
  const [quotaSpent, setQuotaSpent] = useState(0)

  const [features, setFeatures] = useState<Features>({ fileUpload: true, pptExport: true })

  const [attachedFile, setAttachedFile] = useState<{
    filename: string; text: string; pageCount?: number; wordCount: number
  } | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data: Model[]) => {
        setModels(data)
        const savedModel = localStorage.getItem('chat-model')
        const initial = data.find((m) => m.id === savedModel) ? savedModel! : data[0]?.id
        if (initial) setSelectedModelId(initial)
      })
  }, [])

  useEffect(() => {
    fetch('/api/quota-config')
      .then((r) => r.json())
      .then((config: QuotaConfig) => {
        setQuotaConfig(config)
        setQuotaSpent(loadQuota().spent)
      })
      .catch(() => {}) // quota is non-critical — fail silently
  }, [])

  useEffect(() => {
    fetch('/api/features')
      .then((r) => r.json())
      .then((f: Features) => setFeatures(f))
      .catch(() => {}) // non-critical — client defaults remain
  }, [])

  // Restore chat history on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chat-history')
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => {
    if (messages.length > 0) localStorage.setItem('chat-history', JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    if (selectedModelId) localStorage.setItem('chat-model', selectedModelId)
  }, [selectedModelId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectedModel = models.find((m) => m.id === selectedModelId)

  async function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset so the same file can be re-attached

    setUploadingFile(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setAttachedFile(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploadingFile(false)
    }
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if ((!text && !attachedFile) || streaming || !selectedModelId) return

    if (quotaConfig && isOverBudget(quotaSpent, quotaConfig.monthlyBudget)) {
      setError(`Monthly usage limit reached ($${quotaConfig.monthlyBudget.toFixed(2)}). Resets on the 1st.`)
      return
    }

    setError(null)

    // Prepend document text on first send — after that it lives in history
    let messageContent = text
    if (attachedFile) {
      const docHeader = `[Document: ${attachedFile.filename}]\n\n${attachedFile.text}`
      messageContent = text ? `${docHeader}\n\n---\n\n${text}` : docHeader
      setAttachedFile(null)
    }
    const userMsg: Message = { role: 'user', content: messageContent }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    setMessages([
      ...nextMessages,
      { role: 'assistant', content: '', modelId: selectedModelId, modelName: selectedModel?.name },
    ])
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          modelId: selectedModelId,
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      })

      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            content: copy[copy.length - 1].content + chunk,
          }
          return copy
        })
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const msg = (err as Error).message
      setError(msg)
      setMessages((prev) => {
        const copy = [...prev]
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: `⚠ ${msg}` }
        return copy
      })
    } finally {
      setStreaming(false)
      abortRef.current = null
      if (quotaConfig) {
        setMessages((prev) => {
          const lastAssistant = [...prev].reverse().find((m) => m.role === 'assistant')
          const lastUser = [...prev].reverse().find((m) => m.role === 'user')
          if (lastAssistant && lastUser) {
            const cost = calcCost(lastUser.content, lastAssistant.content, selectedModelId, quotaConfig.pricing)
            setQuotaSpent(recordSpend(cost))
          }
          return prev
        })
      }
    }
  }, [input, messages, selectedModelId, selectedModel, streaming, attachedFile, quotaConfig, quotaSpent])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
    }
  }

  function stopStreaming() {
    abortRef.current?.abort()
    setStreaming(false)
  }

  async function handleGeneratePpt() {
    if (!messages.length || !selectedModelId || generatingPpt) return
    setGeneratingPpt(true)
    setError(null)

    // If the user typed feedback but hasn't pressed Enter, pick it up now
    const pendingFeedback = input.trim()
    let messagesForPpt = messages
    if (pendingFeedback) {
      const feedbackMsg: Message = { role: 'user', content: pendingFeedback }
      messagesForPpt = [...messages, feedbackMsg]
      setMessages((prev) => [...prev, feedbackMsg])
      setInput('')
    }

    // Replace the short chat summary with the full detailed version before
    // sending to the LLM — user sees headings, LLM gets per-slide content
    if (pptDetailRef.current) {
      messagesForPpt = messagesForPpt.map((m) =>
        m.content.startsWith(PPT_SUMMARY_MARKER) ? { ...m, content: pptDetailRef.current! } : m
      )
    }

    try {
      const res = await fetch('/api/generate-ppt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesForPpt, modelId: selectedModelId }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const nameMatch = disposition.match(/filename="([^"]+)"/)
      const filename = nameMatch ? nameMatch[1] : 'Generated-Presentation.pptx'

      const outlineHeader = res.headers.get('X-Ppt-Outline')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 2000)

      // Inject slide summary back into the conversation so the LLM has context
      // for follow-up "update slide N" requests
      if (outlineHeader) {
        try {
          const bytes = Uint8Array.from(atob(outlineHeader), (c) => c.charCodeAt(0))
          const decoded = new TextDecoder('utf-8').decode(bytes)
          const summary: { title: string; slides: { heading: string; content: string[] }[] } = JSON.parse(decoded)

          const headingList = summary.slides.map((s, i) => `${i + 1}. ${s.heading}`).join('\n')
          const chatMsg =
            `📊 **Presentation generated — ${summary.title}** (${summary.slides.length} slides)\n\n` +
            `${headingList}\n\n` +
            `_To update: type your feedback in the box below and click **PPT** — no need to press Enter._`

          const detailList = summary.slides
            .map((s, i) => {
              const bullets = s.content.length ? '\n' + s.content.map((c) => `   • ${c}`).join('\n') : ''
              return `${i + 1}. **${s.heading}**${bullets}`
            })
            .join('\n')
          pptDetailRef.current =
            `📊 **Presentation generated — ${summary.title}** (${summary.slides.length} slides)\n\n` +
            `${detailList}\n\n` +
            `_To update: type your feedback in the box below and click **PPT** — no need to press Enter._`

          setMessages((prev) => [
            ...prev.filter((m) => !m.content.startsWith(PPT_SUMMARY_MARKER)),
            { role: 'assistant', content: chatMsg },
          ])
        } catch {
          // silently ignore if the header is malformed
        }
      }
    } catch (err) {
      setError((err as Error).message || 'Presentation generation failed. Please try again.')
    } finally {
      setGeneratingPpt(false)
    }
  }

  function handleLogout() {
    // In production this sits behind Azure App Service Easy Auth — it owns
    // the session, so logout goes through its endpoint, not an app cookie.
    window.location.href = '/.auth/logout?post_logout_redirect_uri=/login'
  }

  return (
    <div className="flex h-dvh overflow-x-hidden" style={{ background: GL, color: '#1a1a1a' }}>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 flex flex-col flex-shrink-0 transition-transform duration-200
          md:relative md:w-60 md:translate-x-0 md:flex
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{ background: G }}
      >
        <div className="flex items-center justify-between px-5 border-b border-white/10" style={{ minHeight: '64px' }}>
          <div className="flex flex-col justify-center">
            <span className="text-[13px] font-bold text-white leading-tight">
              AI Chat <em className="not-italic" style={{ fontStyle: 'italic', color: '#fb923c' }}>Studio</em>
            </span>
            <span className="text-[9px] font-medium tracking-wide mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>
              Multi-LLM chat, one shared budget
            </span>
          </div>
          <button
            className="md:hidden text-white/60 hover:text-white p-1"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-5 pb-2 text-[9px] font-bold tracking-[0.18em] uppercase text-white/30">
            Models
          </div>
          <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => { setSelectedModelId(model.id); setSidebarOpen(false) }}
                className="w-full text-left px-3 py-3 rounded-xl transition-all"
                style={selectedModelId === model.id ? { background: 'rgba(255,255,255,0.15)' } : {}}
                onMouseEnter={(e) => {
                  if (selectedModelId !== model.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'
                }}
                onMouseLeave={(e) => {
                  if (selectedModelId !== model.id) (e.currentTarget as HTMLElement).style.background = ''
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.75)' }}
                  >
                    {model.badge}
                  </span>
                  <span className="text-sm font-semibold text-white truncate">{model.name}</span>
                </div>
                <div className="text-[11px] text-white/40 pl-0.5">{model.description}</div>
              </button>
            ))}
          </nav>
        </div>

        {quotaConfig && <QuotaIndicator spent={quotaSpent} budget={quotaConfig.monthlyBudget} />}

        <div className="px-3 py-3 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '')}
          >
            <div
              className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
            >
              AI
            </div>
            <div className="flex-1 text-left">
              <div className="text-xs font-semibold text-white/80 leading-tight">Account</div>
              <div className="text-[10px] text-white/35 leading-tight">Sign out</div>
            </div>
            <svg className="w-3.5 h-3.5 text-white/30 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header
          className="flex items-center px-4 md:px-6 flex-shrink-0 border-b gap-3"
          style={{ background: '#fff', borderColor: '#dde8e2', minHeight: '64px' }}
        >
          <button
            className="md:hidden flex-shrink-0 p-1 rounded-lg"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            style={{ color: G }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          <div className="ml-auto flex items-center gap-2 md:gap-3 flex-shrink-0">
            {streaming && (
              <button
                onClick={stopStreaming}
                className="text-xs px-2 md:px-3 py-1.5 rounded-lg border transition-colors text-slate-500 hover:text-slate-800 border-slate-200 hover:border-slate-400"
              >
                Stop
              </button>
            )}

            {features.pptExport && messages.length > 0 && !streaming && !selectedModel?.useResponsesAPI && !selectedModel?.noPpt && (
              <div className="relative group flex-shrink-0">
                <button
                  onClick={handleGeneratePpt}
                  disabled={generatingPpt}
                  className="flex items-center gap-1.5 text-xs px-2 md:px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    borderColor: generatingPpt ? '#c8ddd1' : '#005C32',
                    color: generatingPpt ? '#6b9e80' : '#005C32',
                    background: generatingPpt ? '#f2f7f4' : 'transparent',
                  }}
                >
                  {generatingPpt ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span className="hidden sm:inline">Building…</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      <span className="hidden sm:inline">PPT</span>
                    </>
                  )}
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 hidden sm:block">
                  <div className="rounded-lg px-3 py-2 text-xs leading-relaxed shadow-lg" style={{ background: '#1a1a1a', color: '#fff' }}>
                    <p className="font-semibold mb-0.5">Generate PowerPoint</p>
                    <p className="opacity-75">Turns this conversation into a .pptx deck. Type feedback &amp; click again to update.</p>
                  </div>
                </div>
              </div>
            )}
            {generatingPpt && (
              <span className="hidden sm:inline text-[10px]" style={{ color: '#9ab5a4' }}>
                ~30 sec…
              </span>
            )}

            <button
              onClick={() => { setMessages([]); setError(null); localStorage.removeItem('chat-history') }}
              className="text-xs px-2 md:px-3 py-1.5 rounded-lg border transition-colors text-slate-400 hover:text-slate-700 border-slate-200 hover:border-slate-300"
            >
              Clear
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ background: GL }}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 select-none px-4 text-center" style={{ color: '#9ab5a4' }}>
              <svg viewBox="0 0 40 40" className="w-10 h-10 opacity-40" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="20" cy="20" r="17" />
                <path d="M13 20h14M20 13v14" strokeLinecap="round" />
              </svg>
              <div className="text-sm">
                {selectedModel ? `Start a conversation with ${selectedModel.name}` : 'Tap ☰ to select a model'}
              </div>
            </div>
          ) : (
            <div className="max-w-[800px] mx-auto px-3 md:px-4 py-4 md:py-6 space-y-4 md:space-y-5">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 md:gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div
                    className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5"
                    style={msg.role === 'user' ? { background: G, color: '#fff' } : { background: '#dde8e2', color: G }}
                  >
                    {msg.role === 'user' ? 'U' : 'AI'}
                  </div>

                  <div className={`flex flex-col gap-1 max-w-[88%] md:max-w-[82%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {msg.role === 'assistant' && msg.modelName && (
                      <div className="text-[10px] font-semibold px-1" style={{ color: G }}>
                        {msg.modelName}
                      </div>
                    )}
                    <div
                      className="rounded-2xl px-3 md:px-4 py-2.5 md:py-3 text-sm leading-relaxed"
                      style={
                        msg.role === 'user'
                          ? { background: G, color: '#fff', borderBottomRightRadius: '4px' }
                          : { background: '#fff', color: '#1a1a1a', borderBottomLeftRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }
                      }
                    >
                      {msg.role === 'assistant' ? (
                        <MarkdownMessage content={msg.content} />
                      ) : (() => {
                        // Document messages render as a compact chip + question
                        if (msg.content.startsWith('[Document:')) {
                          const filenameMatch = msg.content.match(/^\[Document:\s*(.+?)\]/)
                          const filename = filenameMatch?.[1] ?? 'document'
                          const parts = msg.content.split('\n\n---\n\n')
                          const question = parts[1]?.trim() ?? ''
                          return (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-1.5 text-xs opacity-80">
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                                <span className="font-medium">{filename}</span>
                              </div>
                              {question && <span className="whitespace-pre-wrap">{question}</span>}
                            </div>
                          )
                        }
                        return <span className="whitespace-pre-wrap">{msg.content}</span>
                      })()}
                      {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                        <span className="inline-block w-1.5 h-[13px] ml-0.5 rounded-sm animate-pulse align-middle" style={{ background: G }} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-2 md:px-4 py-2 md:py-4 border-t flex-shrink-0" style={{ background: '#fff', borderColor: '#dde8e2' }}>
          <div className="max-w-[800px] mx-auto">
            {error && <div className="text-xs text-red-500 mb-2 px-1">{error}</div>}

            {attachedFile && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl mb-2 text-xs w-fit" style={{ background: '#dde8e2', color: '#005C32' }}>
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="font-medium truncate max-w-[180px]">{attachedFile.filename}</span>
                <span className="opacity-50">
                  {attachedFile.pageCount ? `${attachedFile.pageCount}p` : `${attachedFile.wordCount.toLocaleString()} words`}
                </span>
                <button onClick={() => setAttachedFile(null)} className="opacity-50 hover:opacity-100 ml-0.5" aria-label="Remove file">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <div
              className="flex gap-1.5 items-end rounded-2xl px-2 md:px-4 py-2 md:py-2.5 transition-colors"
              style={{ background: GL, border: '1.5px solid #c8ddd1' }}
            >
              {features.fileUpload && (
                <>
                  <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={handleFileAttach} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={streaming || uploadingFile || !selectedModelId}
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors mb-0.5 disabled:opacity-30"
                    style={{ color: attachedFile ? '#005C32' : '#9ab5a4' }}
                    title="Attach PDF or Word document"
                  >
                    {uploadingFile
                      ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    }
                  </button>
                </>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={selectedModel ? `Message ${selectedModel.name}…` : 'Select a model first'}
                disabled={streaming || !selectedModelId}
                rows={1}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="flex-1 min-w-0 bg-transparent text-base md:text-sm resize-none outline-none py-1 disabled:opacity-50 placeholder-[#9ab5a4]"
                style={{ minHeight: '24px', maxHeight: '200px', color: '#1a1a1a' }}
              />
              <button
                onClick={sendMessage}
                disabled={streaming || (!input.trim() && !attachedFile) || !selectedModelId}
                className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all mb-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: G }}
                aria-label="Send"
              >
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
            <div className="mt-2 text-center text-[10px] hidden md:block" style={{ color: '#9ab5a4' }}>
              Enter to send · Shift+Enter for new line · switch models anytime
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
