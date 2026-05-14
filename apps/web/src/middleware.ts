import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = new Set(['/login', '/register', '/forgot-password']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass through public paths and Next internals
  if (
    pathname === '/' ||
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // AutoOps uses httpOnly refresh-token cookies for session persistence.
  // Access tokens live in sessionStorage (client-only), so we can only
  // check for the refresh cookie here as a lightweight gate.
  const hasSession = request.cookies.has('refresh_token');

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
