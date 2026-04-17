'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
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

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/');
    }
  }, [router, status]);

  if (googleEnabled === null) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>登录有求必应屋</h1>
          <p>正在检查登录配置...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>登录有求必应屋</h1>
        {googleEnabled ? (
          <>
            <p>使用 Google 账号登录后即可上传 Skill。</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => signIn('google', { callbackUrl: '/' })}
            >
              使用 Google 登录
            </button>
          </>
        ) : (
          <>
            <p>
              当前站点未配置 Google OAuth，请先配置 <code>GOOGLE_CLIENT_ID</code> 与{' '}
              <code>GOOGLE_CLIENT_SECRET</code> 后再登录。
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => router.push('/')}
            >
              返回首页
            </button>
          </>
        )}
      </div>

      <style jsx>{`
        .login-page {
          min-height: calc(100vh - 180px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .login-card {
          width: 100%;
          max-width: 460px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
          padding: 32px;
          text-align: center;
        }

        .login-card h1 {
          margin: 0 0 12px;
          font-size: 28px;
          color: var(--text-primary);
        }

        .login-card p {
          margin: 0 0 22px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
