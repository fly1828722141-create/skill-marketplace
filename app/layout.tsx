/**
 * 根布局组件
 * 
 * 包含全局样式、导航栏、Footer 等
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import Providers from '@/app/providers';
import AuthActions from '@/components/auth-actions';
import AnalyticsTracker from '@/components/analytics-tracker';
import NavLinks from '@/components/nav-links';
import './globals.css';

export const metadata: Metadata = {
  title: '有求必应屋 - Skill 分享平台',
  description: '支持上传、分享与下载 Skill 的社区平台',
  keywords: ['Skill', '技能分享', 'Next.js', 'TypeScript'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <AntdRegistry>
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
                      <Image
                        src="/home-logo.png"
                        alt="有求必应屋"
                        width={56}
                        height={56}
                        className="logo-image"
                        priority
                      />
                    </div>
                    <span className="logo-text">有求必应屋</span>
                  </Link>
                  <NavLinks />
                  <AuthActions />
                </div>
              </header>

              <AnalyticsTracker />
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
          </AntdRegistry>
        </Providers>
      </body>
    </html>
  );
}
