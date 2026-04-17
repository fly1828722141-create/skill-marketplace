'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';

export default function AuthActions() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div className="auth-loading">加载中...</div>;
  }

  if (!session?.user) {
    return (
      <Link href="/login" className="upload-btn">
        Google 登录
      </Link>
    );
  }

  return (
    <div className="auth-actions">
      <Link href="/upload" className="upload-btn">
        + 上传 Skill
      </Link>
      <div className="auth-user-name" title={session.user.email || ''}>
        {session.user.name || '已登录用户'}
      </div>
      <button
        type="button"
        className="logout-btn"
        onClick={() => signOut({ callbackUrl: '/' })}
      >
        退出
      </button>
    </div>
  );
}
