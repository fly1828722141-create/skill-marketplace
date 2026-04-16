/**
 * Session Provider 组件
 * 
 * 包装 NextAuth SessionProvider，使整个应用可以访问会话状态
 */

'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

export default function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
