/**
 * 根布局组件
 * 
 * 包含全局样式、导航栏、Footer 等
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import SessionProvider from './api/auth/session/provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Skill Marketplace - 技能分享平台',
  description: '阿里巴巴内部技能分享平台，支持上传和下载技能包',
  keywords: ['技能分享', 'Next.js', 'TypeScript', '阿里巴巴'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <SessionProvider>
            <div className="bg-decoration" aria-hidden="true">
              <div className="bg-blob bg-blob-1" />
              <div className="bg-blob bg-blob-2" />
              <div className="bg-blob bg-blob-3" />
            </div>

            <div className="app-container">
              <header className="navbar">
                <div className="navbar-content">
                  <Link href="/" className="logo">
                    <div className="logo-icon" aria-hidden="true">
                      <svg viewBox="0 0 40 40" className="logo-icon-svg">
                        <rect x="8" y="8" width="24" height="24" rx="8" />
                        <path d="M13 21L19 15L27 23" />
                        <path d="M22 23H27V18" />
                      </svg>
                    </div>
                    <span className="logo-text">有求必应屋</span>
                  </Link>
                  <nav className="nav-links">
                    <Link href="/" className="nav-link active">
                      首页
                    </Link>
                    <Link href="/skills" className="nav-link">
                      分类
                    </Link>
                    <Link href="/#leaderboard" className="nav-link">
                      排行榜
                    </Link>
                    <Link href="/skills" className="nav-link">
                      我的
                    </Link>
                  </nav>
                  <Link href="/upload" className="upload-btn">
                    + 上传 Skill
                  </Link>
                </div>
              </header>

              <main className="main-content">{children}</main>

              <footer className="footer">
                <div className="footer-links">
                  <Link href="/skills" className="footer-link">
                    关于我们
                  </Link>
                  <Link href="/skills" className="footer-link">
                    使用指南
                  </Link>
                  <Link href="/skills" className="footer-link">
                    开发者文档
                  </Link>
                  <Link href="/upload" className="footer-link">
                    意见反馈
                  </Link>
                </div>
                <p>© 2026 有求必应屋 - Skill 分享平台</p>
                <p>开发者：fly</p>
              </footer>
            </div>
          </SessionProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
