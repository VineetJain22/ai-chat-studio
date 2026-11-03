const G = '#005C32'
const GL = '#F2F7F4'

export default function LoginPage() {
  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: GL }}
    >
      {/* Top bar */}
      <div className="w-full px-8 flex flex-col justify-center" style={{ background: G, minHeight: '56px' }}>
        <span className="text-[13px] font-bold text-white leading-tight">AI Chat <em style={{ fontStyle: 'italic', color: '#fb923c' }}>Studio</em></span>
        <span className="text-[9px] font-medium tracking-wide mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>Multi-LLM chat, one shared budget</span>
      </div>

      {/* Centered card */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">

          {/* Card */}
          <div
            className="rounded-2xl px-10 py-12"
            style={{
              background: '#fff',
              boxShadow: '0 4px 24px rgba(0,92,50,0.08), 0 1px 4px rgba(0,0,0,0.05)',
            }}
          >
            {/* Wordmark */}
            <div className="flex justify-center mb-10">
              <span className="text-2xl font-bold" style={{ color: G }}>AI Chat Studio</span>
            </div>

            {/* ── SSO START — Entra ID via Azure App Service Easy Auth ──
                 This page/route only lights up in a production deployment behind
                 an auth proxy that injects x-ms-client-principal (see middleware.ts).
                 Local dev bypasses this entirely, so /.auth/* 404s locally by design. */}
            <a
              href="/.auth/login/aad?post_login_redirect_uri=/"
              className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:bg-[#007040]"
              style={{ background: G }}
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Sign in with Microsoft
            </a>
            <p className="text-[11px] text-center text-slate-400 mt-4">
              Access is restricted to approved accounts.
            </p>
            {/* ── SSO END ── */}
          </div>
        </div>
      </div>
    </div>
  )
}
