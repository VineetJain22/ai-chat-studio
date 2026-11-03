import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Local dev has no platform-level auth proxy in front of it to inject the
  // header checked below — skip the gate entirely.
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.next()
  }

  // Always allow the login page through, so the "Sign in with Microsoft"
  // button can render for an unauthenticated visitor.
  if (pathname === '/login') {
    return NextResponse.next()
  }

  // Azure App Service Easy Auth (Entra ID SSO) authenticates the request
  // before this middleware ever runs, and injects this header only for
  // genuinely authenticated requests — a client-supplied copy is always
  // stripped by the platform, so its presence is safe to trust here.
  const principal = req.headers.get('x-ms-client-principal')
  if (principal) {
    return NextResponse.next()
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)'],
}
