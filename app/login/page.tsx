/**
 * 登录页面
 * 
 * 阿里 BUC 单点登录入口
 */

'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // ===========================================
  // BUC 登录处理
  // ===========================================
  async function handleBUCLogin() {
    setLoading(true);
    setError(null);

    try {
      // 方法 1: 跳转到 BUC 登录页（推荐）
      // 实际使用时，需要替换为真实的 BUC 登录 URL
      const bucLoginUrl = `https://login.alibaba-inc.com/buc/login?appKey=${process.env.NEXT_PUBLIC_BUC_APP_KEY}&callback=${encodeURIComponent(window.location.origin + '/api/auth/callback')}`;
      
      // 临时方案：模拟登录（开发环境使用）
      if (process.env.NODE_ENV === 'development') {
        // 开发环境使用模拟登录
        await signIn('credentials', {
          ticket: 'dev-ticket-' + Date.now(),
          redirect: false,
        });
        router.push('/');
        router.refresh();
        return;
      }

      // 生产环境跳转到 BUC
      window.location.href = bucLoginUrl;
    } catch (err: any) {
      console.error('登录失败:', err);
      setError(err.message || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  // ===========================================
  // 快速登录（仅开发环境）
  // ===========================================
  async function handleQuickLogin() {
    setLoading(true);
    setError(null);

    try {
      await signIn('credentials', {
        ticket: 'quick-login-ticket',
        redirect: false,
      });
      router.push('/');
      router.refresh();
    } catch (err: any) {
      console.error('快速登录失败:', err);
      setError('快速登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>Skill Marketplace</h1>
            <p>技能分享平台</p>
          </div>

          <div className="login-body">
            {error && (
              <div className="error-message">
                ⚠️ {error}
              </div>
            )}

            <button
              onClick={handleBUCLogin}
              disabled={loading}
              className="btn btn-primary btn-large"
            >
              {loading ? '登录中...' : '阿里账号登录'}
            </button>

            {process.env.NODE_ENV === 'development' && (
              <div className="dev-tools">
                <p className="dev-hint">开发环境快捷方式：</p>
                <button
                  onClick={handleQuickLogin}
                  disabled={loading}
                  className="btn btn-secondary"
                >
                  快速登录（测试用）
                </button>
              </div>
            )}
          </div>

          <div className="login-footer">
            <p>使用阿里内部账号登录，即可上传和下载技能包</p>
            <p className="help-text">
              遇到问题？请联系：fly
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        .login-page {
          min-height: calc(100vh - 200px);
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: var(--spacing-lg);
        }

        .login-container {
          width: 100%;
          max-width: 420px;
        }

        .login-card {
          background: white;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          padding: var(--spacing-xl);
          text-align: center;
        }

        .login-header h1 {
          color: var(--primary-color);
          font-size: 28px;
          margin-bottom: var(--spacing-xs);
        }

        .login-header p {
          color: var(--text-secondary);
          font-size: 16px;
          margin-bottom: var(--spacing-xl);
        }

        .login-body {
          margin-bottom: var(--spacing-lg);
        }

        .error-message {
          background-color: #fff2f0;
          border: 1px solid #ffccc7;
          color: var(--error-color);
          padding: var(--spacing-md);
          border-radius: var(--radius-sm);
          margin-bottom: var(--spacing-md);
        }

        .btn-large {
          width: 100%;
          padding: var(--spacing-md) var(--spacing-lg);
          font-size: 16px;
        }

        .dev-tools {
          margin-top: var(--spacing-lg);
          padding-top: var(--spacing-lg);
          border-top: 1px solid var(--border-color);
        }

        .dev-hint {
          color: var(--text-tertiary);
          font-size: 12px;
          margin-bottom: var(--spacing-sm);
        }

        .login-footer {
          color: var(--text-tertiary);
          font-size: 13px;
          line-height: 1.8;
        }

        .help-text {
          margin-top: var(--spacing-sm);
          color: var(--primary-color);
        }
      `}</style>
    </div>
  );
}
