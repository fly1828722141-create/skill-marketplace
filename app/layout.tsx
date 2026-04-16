/**
 * 根布局组件
 * 
 * 包含全局样式、导航栏、Footer 等
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import SessionProvider from './api/auth/session/provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

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
      <body className={inter.className}>
        <AntdRegistry>
          <SessionProvider>
            <div className="app-container">
              {/* 导航栏 */}
              <header className="app-header">
                <div className="header-content">
                  <div className="logo">
                    <h1>Skill Marketplace</h1>
                  </div>
                  <nav className="nav-menu">
                    <a href="/">首页</a>
                    <a href="/skills">技能库</a>
                    <a href="/upload">上传</a>
                  </nav>
                  <div className="user-actions">
                    {/* 登录状态由客户端组件管理 */}
                  </div>
                </div>
              </header>

              {/* 主内容区 */}
              <main className="app-main">{children}</main>

              {/* Footer */}
              <footer className="app-footer">
                <div className="footer-content">
                  <p>© 2026 Skill Marketplace - 阿里巴巴集团内部使用</p>
                  <p>开发者：尚凡（龚艳） | 部门：飞猪 - 大住宿 - 业务运营中心 - 经营效能</p>
                </div>
              </footer>
            </div>
          </SessionProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
