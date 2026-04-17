import { NextRequest, NextResponse } from 'next/server';

const LEGACY_HOST = 'flybing.vercel.app';
const CANONICAL_HOST = 'skill-marketplace-eight.vercel.app';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase();

  if (host === LEGACY_HOST) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.protocol = 'https';
    redirectUrl.host = CANONICAL_HOST;
    return NextResponse.redirect(redirectUrl, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
