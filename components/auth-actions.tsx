'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';

export default function AuthActions() {
  const { data: session, status } = useSession();
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadProviders() {
      try {
        const response = await fetch('/api/auth/providers', { cache: 'no-store' });
        const providers = await response.json();
        if (!mounted) return;
        setGoogleEnabled(Boolean(providers?.google));
      } catch (error) {
        if (!mounted) return;
        setGoogleEnabled(false);
      }
    }

    loadProviders();

    return () => {
      mounted = false;
    };
  }, []);

  if (status === 'loading' || googleEnabled === null) {
    return <div className="auth-loading">加载中...</div>;
  }

  if (!session?.user) {
    if (!googleEnabled) {
      return (
        <Link href="/upload" className="upload-btn">
          + 上传 Skill
        </Link>
      );
    }

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
