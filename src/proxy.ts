import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets & public endpoints
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/uploads')
  ) {
    return NextResponse.next();
  }

  const authToken = request.cookies.get('auth_token')?.value;
  const authHeader = request.headers.get('authorization');
  const hasAuth = !!authToken || (!!authHeader && authHeader.startsWith('Bearer '));

  // 1. All API routes handle their own JSON authentication and authorization
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // 2. Unauthenticated user trying to access protected UI page -> redirect to /login
  if (pathname !== '/login' && !hasAuth) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. Authenticated user visiting /login page -> redirect to dashboard
  if (pathname === '/login' && hasAuth) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
