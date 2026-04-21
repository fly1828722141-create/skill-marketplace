/**
 * 技能包详情页（文档化展示）
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { message } from 'antd';
import { useSession } from 'next-auth/react';
import { Skill } from '@/types';
import SkillReviews from '@/components/skill-reviews';
import { canManageSkill, isSuperAdminEmail } from '@/lib/dashboard-access';
import { getTrackingIdentity } from '@/lib/analytics-client';
import { formatDateTime, formatFileSize, formatNumber } from '@/lib/utils';

type DocBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; code: string }
  | { type: 'divider' };

export default function SkillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lastCopyTrackAtRef = useRef(0);

  const skillId = params.id as string;

  useEffect(() => {
    async function fetchSkill() {
      try {
        const response = await fetch(`/api/skills/${skillId}`);
        const result = await response.json();

        if (result.success) {
          setSkill(result.data);
        } else {
          message.error(result.error || '技能包不存在');
        }
      } catch (error) {
        console.error('加载失败:', error);
        message.error('加载失败');
      } finally {
        setLoading(false);
      }
    }

    fetchSkill();
  }, [skillId]);

  const isExternalLinkSkill =
    !!skill &&
    (skill.fileType?.toLowerCase() === 'link' || /^https?:\/\//i.test(skill.fileName));
  const sourceUrl =
    isExternalLinkSkill && skill && isHttpUrl(skill.fileName) ? skill.fileName : null;
  const sourceHost = sourceUrl ? safeHost(sourceUrl) : '';
  const installCommand =
    (skill?.installCommand || '').trim() ||
    (sourceUrl ? buildInstallCommand(sourceUrl) : '');
  const docBlocks = useMemo(
    () => parseDocBlocks(skill?.description || ''),
    [skill?.description]
  );
  const canManageCurrentSkill = useMemo(() => {
    if (!skill) return false;
    return canManageSkill(session?.user?.email || null, session?.user?.id || null, skill.authorId);
  }, [session?.user?.email, session?.user?.id, skill]);

  const trackCopyDownload = useCallback(
    async (source: 'copy-button' | 'manual-selection') => {
      const now = Date.now();
      // 避免一次复制动作触发重复计数（按钮复制可能连带触发 copy 事件）
      if (now - lastCopyTrackAtRef.current < 800) {
        return;
      }
      lastCopyTrackAtRef.current = now;

      try {
        const identity = getTrackingIdentity();
        const response = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skillId,
            anonymousId: identity.anonymousId,
            sessionId: identity.sessionId,
            mode: 'copy',
            source,
          }),
        });
        const result = await response.json();
        if (!result.success) return;

        setSkill((prev) => {
          if (!prev) return prev;
          const totalDownloads = Number(result.data?.totalDownloads);
          return {
            ...prev,
            downloadCount:
              Number.isFinite(totalDownloads) && totalDownloads >= 0
                ? totalDownloads
                : prev.downloadCount + 1,
          };
        });
      } catch (error) {
        console.error('复制下载计数失败:', error);
      }
    },
    [skillId]
  );

  useEffect(() => {
    function handleCopy() {
      const selected = window.getSelection()?.toString().trim() || '';
      if (!selected) return;
      void trackCopyDownload('manual-selection');
    }

    document.addEventListener('copy', handleCopy);
    return () => {
      document.removeEventListener('copy', handleCopy);
    };
  }, [trackCopyDownload]);

  async function handleDownload() {
    if (status === 'loading') {
      message.info('正在检查登录状态，请稍后再试');
      return;
    }

    setDownloading(true);

    try {
      const identity = getTrackingIdentity();
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId,
          anonymousId: identity.anonymousId,
          sessionId: identity.sessionId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        window.open(result.data.downloadUrl, '_blank');

        if (isExternalLinkSkill) {
          message.success('已打开外部 Skill 链接');
        } else if (!result.data.downloadedBefore) {
          message.success('下载成功，感谢分享！');
        } else {
          message.info('开始下载（已下载过此技能包）');
        }

        if (result.data.downloadCountIncremented && skill) {
          const totalDownloads = Number(result.data?.totalDownloads);
          setSkill({
            ...skill,
            downloadCount:
              Number.isFinite(totalDownloads) && totalDownloads >= 0
                ? totalDownloads
                : skill.downloadCount + 1,
          });
        }
      } else {
        message.error(result.error || '下载失败');
      }
    } catch (error) {
      console.error('下载失败:', error);
      message.error('下载失败，请重试');
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopyText(value: string, successMessage: string) {
    try {
      if (!value) {
        return;
      }

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement('textarea');
        input.value = value;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.focus();
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }

      message.success(successMessage);
      await trackCopyDownload('copy-button');
    } catch (error) {
      console.error('复制失败:', error);
      message.error('复制失败，请手动复制');
    }
  }

  async function handleDeleteSkill() {
    if (!skill) return;

    if (!canManageCurrentSkill) {
      message.error('你没有权限删除该 Skill');
      return;
    }

    if (!window.confirm(`确认删除「${skill.title}」吗？删除后将不在列表中展示。`)) {
      return;
    }

    try {
      setDeleting(true);
      const response = await fetch(`/api/skills/${skill.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '删除失败');
      }

      message.success('Skill 已删除');
      router.push('/skills');
    } catch (error: any) {
      console.error('删除 Skill 失败:', error);
      message.error(error.message || '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="loading-page">加载中...</div>;
  }

  if (!skill) {
    return (
      <div className="error-page">
        <h2>❌ 技能包不存在</h2>
        <Link href="/" className="btn btn-primary">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="skill-detail-page">
      <nav className="breadcrumb">
        <Link href="/">首页</Link>
        <span> / </span>
        <Link href="/skills">技能库</Link>
        <span> / </span>
        <span>{skill.title}</span>
      </nav>

      <div className="skill-content">
        <div className="skill-main">
          <div className="skill-header-card">
            <div className="skill-header-top">
              <h1 className="skill-title">{skill.title}</h1>
              {sourceUrl ? (
                <div className="source-actions">
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="source-pill"
                  >
                    来源：{sourceHost || '外部链接'}
                  </a>
                  <button
                    type="button"
                    className="copy-compact-btn"
                    aria-label="复制来源链接"
                    onClick={() => void handleCopyText(sourceUrl, '来源链接已复制')}
                  >
                    <span>复制</span>
                    <CopyIcon />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="skill-meta">
              <span className="meta-item">📅 {formatDateTime(skill.createdAt)}</span>
              <span className="meta-item">
                {isExternalLinkSkill ? '🔗 外部链接' : `📦 ${formatFileSize(skill.fileSize)}`}
              </span>
              <span className="meta-item">🏷️ {(skill.fileType || 'link').toUpperCase()}</span>
              <span className="meta-item">🤖 {skill.category?.name || '未归属数字人'}</span>
            </div>

            <div className="skill-tags">
              <span className="skill-type-label">所属数字人</span>
              <span className="tag">{skill.category?.name || '未归属数字人'}</span>
            </div>
          </div>

          {installCommand ? (
            <div className="install-card">
              <div className="install-head">
                <div className="install-label">Skill 安装命令</div>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => void handleCopyText(installCommand, '安装命令已复制')}
                >
                  <CopyIcon />
                  一键复制
                </button>
              </div>
              <pre className="install-code">
                <code>{installCommand}</code>
              </pre>
              <p className="install-tip">普通用户可直接使用右侧“打开链接/下载”按钮。</p>
            </div>
          ) : null}

          <div className="skill-description-card">
            <h3>✨ 功能简介</h3>
            <p className="description-text">{skill.summary || '暂无功能简介'}</p>
          </div>

          <div className="skill-description-card doc-surface">
            <div className="doc-surface-head">
              <h3>SKILL.md</h3>
              <span>结构化展示</span>
            </div>
            <DocRenderer blocks={docBlocks} />
          </div>

        </div>

        <aside className="skill-sidebar">
          <div className="action-card">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn btn-primary btn-download"
            >
              {downloading
                ? '⏳ 准备中...'
                : isExternalLinkSkill
                ? `🔗 打开链接 (${formatNumber(skill.downloadCount)})`
                : `📥 下载 (${formatNumber(skill.downloadCount)})`}
            </button>

            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{formatNumber(skill.viewCount)}</div>
                <div className="stat-label">浏览</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{formatNumber(skill.downloadCount)}</div>
                <div className="stat-label">下载</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{formatRating(skill.ratingAvg)}</div>
                <div className="stat-label">评分</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">
                  {formatNumber(skill.ratingCount ?? skill._count?.comments ?? 0)}
                </div>
                <div className="stat-label">评价人数</div>
              </div>
            </div>

            {canManageCurrentSkill ? (
              <div className="manage-skill-actions">
                <Link href={`/skills/${skill.id}/edit`} className="skill-manage-btn">
                  修改 Skill
                </Link>
                <button
                  type="button"
                  className="skill-manage-btn danger"
                  disabled={deleting}
                  onClick={() => void handleDeleteSkill()}
                >
                  {deleting ? '删除中...' : '删除 Skill'}
                </button>
                {isSuperAdminEmail(session?.user?.email) ? (
                  <div className="skill-manage-tip">管理员权限：可管理所有 Skill</div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="author-card">
            <h3>👤 作者</h3>
            {skill.author ? (
              <div className="author-info">
                {skill.author.avatar ? (
                  <img
                    src={skill.author.avatar}
                    alt={skill.author.name}
                    className="author-avatar"
                  />
                ) : null}
                <div className="author-details">
                  <div className="author-name">{skill.author.name}</div>
                  <div className="author-dept">{skill.author.department || 'external'}</div>
                </div>
              </div>
            ) : null}
          </div>

          <SkillReviews skillId={skillId} className="skill-sidebar-reviews" />
        </aside>
      </div>

      <style jsx>{`
        .skill-detail-page {
          max-width: 1260px;
          margin: 0 auto;
        }

        .breadcrumb {
          margin-bottom: 18px;
          color: var(--text-secondary);
          font-size: 14px;
        }

        .breadcrumb a {
          color: var(--primary);
          text-decoration: none;
        }

        .breadcrumb a:hover {
          text-decoration: underline;
        }

        .skill-content {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 18px;
          align-items: flex-start;
        }

        .skill-main {
          min-width: 0;
        }

        .skill-header-card,
        .skill-description-card {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.65);
          border-radius: 20px;
          padding: 20px 22px;
          box-shadow: var(--shadow-sm);
          margin-bottom: 14px;
        }

        .skill-header-top {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .skill-title {
          font-size: 38px;
          line-height: 1.15;
          letter-spacing: -0.8px;
          margin: 0;
          word-break: break-word;
        }

        .source-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .source-pill {
          flex-shrink: 1;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #11407f;
          background: rgba(0, 122, 255, 0.12);
          border: 1px solid rgba(0, 122, 255, 0.2);
          text-decoration: none;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .source-pill:hover {
          background: rgba(0, 122, 255, 0.18);
        }

        .copy-compact-btn {
          border: 1px solid rgba(12, 86, 170, 0.25);
          background: #fff;
          color: #0f4f99;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: var(--transition);
        }

        .copy-compact-btn:hover {
          border-color: rgba(12, 86, 170, 0.45);
          background: rgba(0, 122, 255, 0.08);
        }

        .skill-meta {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .meta-item {
          font-size: 13px;
          color: #4f6079;
          border-radius: 999px;
          padding: 6px 10px;
          background: rgba(84, 120, 170, 0.09);
          border: 1px solid rgba(84, 120, 170, 0.16);
        }

        .skill-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .skill-type-label {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .tag {
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 12px;
          background: rgba(0, 122, 255, 0.08);
          color: #1058b5;
          border: 1px solid rgba(0, 122, 255, 0.18);
        }

        .install-card {
          border-radius: 18px;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.98) 0%,
            rgba(245, 250, 255, 0.95) 100%
          );
          border: 1px solid rgba(11, 76, 152, 0.14);
          box-shadow: 0 10px 28px rgba(16, 61, 113, 0.1);
          padding: 16px 18px;
          margin-bottom: 14px;
          color: #17395f;
        }

        .install-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }

        .install-label {
          font-size: 11px;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: #3b618d;
          font-weight: 700;
        }

        .copy-btn {
          border: 1px solid rgba(12, 86, 170, 0.25);
          background: #fff;
          color: #0f4f99;
          border-radius: 10px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: var(--transition);
        }

        .copy-btn:hover {
          border-color: rgba(12, 86, 170, 0.45);
          background: rgba(0, 122, 255, 0.08);
        }

        .install-code {
          margin: 0;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(12, 86, 170, 0.15);
          padding: 12px 14px;
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
          overflow-x: hidden;
        }

        .install-code code {
          display: block;
          font-size: 13px;
          line-height: 1.65;
          color: #11335b;
          font-family: 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace;
          white-space: inherit;
          word-break: inherit;
        }

        .install-tip {
          margin: 10px 0 0;
          font-size: 12px;
          color: #4f6079;
        }

        .description-text {
          font-size: 15px;
          line-height: 1.7;
          color: #2c3b4f;
          margin-top: 8px;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .doc-surface {
          padding-top: 16px;
        }

        .doc-surface-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          border-bottom: 1px solid rgba(12, 30, 64, 0.1);
          padding-bottom: 10px;
          margin-bottom: 14px;
        }

        .doc-surface-head h3 {
          font-size: 17px;
          margin: 0;
        }

        .doc-surface-head span {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .action-card,
        .author-card {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.65);
          border-radius: 18px;
          padding: 16px;
          box-shadow: var(--shadow-sm);
          margin-bottom: 12px;
        }

        .btn-download {
          width: 100%;
          min-height: 44px;
          border-radius: 12px;
          font-size: 16px;
          margin-bottom: 12px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .manage-skill-actions {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px dashed rgba(0, 0, 0, 0.1);
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .stat-item {
          text-align: center;
          border-radius: 12px;
          padding: 10px;
          background: rgba(5, 30, 70, 0.04);
          border: 1px solid rgba(5, 30, 70, 0.08);
        }

        .stat-value {
          font-size: 20px;
          line-height: 1.2;
          font-weight: 700;
          color: #0f3f82;
        }

        .stat-label {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 3px;
        }

        .author-card h3 {
          margin-bottom: 10px;
        }

        .author-info {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .author-avatar {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          object-fit: cover;
        }

        .author-name {
          font-weight: 700;
        }

        .author-dept {
          color: var(--text-secondary);
          font-size: 12px;
        }

        @media (max-width: 1080px) {
          .skill-content {
            grid-template-columns: 1fr;
          }

          .skill-sidebar {
            position: static;
          }
        }

        @media (max-width: 680px) {
          .skill-title {
            font-size: 27px;
          }

          .skill-header-top {
            flex-direction: column;
            align-items: flex-start;
          }

          .meta-item {
            font-size: 12px;
          }

          .description-text {
            font-size: 14px;
          }

          .copy-btn,
          .copy-compact-btn {
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
}

function DocRenderer({ blocks }: { blocks: DocBlock[] }) {
  if (blocks.length === 0) {
    return <p className="doc-paragraph">暂无文档内容</p>;
  }

  return (
    <div className="doc-content">
      {blocks.map((block, idx) => {
        const key = `${block.type}-${idx}`;

        if (block.type === 'heading') {
          const HeadingTag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4';
          return (
            <HeadingTag key={key} className={`doc-heading doc-heading-l${block.level}`}>
              {renderInline(block.text, `${key}-heading`)}
            </HeadingTag>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={key} className="doc-paragraph">
              {renderInline(block.text, `${key}-p`)}
            </p>
          );
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag key={key} className={`doc-list ${block.ordered ? 'ordered' : 'unordered'}`}>
              {block.items.map((item, itemIdx) => (
                <li key={`${key}-item-${itemIdx}`}>{renderInline(item, `${key}-item-${itemIdx}`)}</li>
              ))}
            </ListTag>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={key} className="doc-quote">
              {renderInline(block.text, `${key}-quote`)}
            </blockquote>
          );
        }

        if (block.type === 'code') {
          return (
            <pre key={key} className="doc-code">
              <code>{block.code}</code>
            </pre>
          );
        }

        return <hr key={key} className="doc-divider" />;
      })}

      <style jsx>{`
        .doc-content {
          color: #1f2d3f;
        }

        .doc-heading {
          margin: 18px 0 10px;
          line-height: 1.3;
          letter-spacing: -0.2px;
        }

        .doc-heading-l1 {
          font-size: 24px;
          font-weight: 800;
        }

        .doc-heading-l2 {
          font-size: 20px;
          font-weight: 700;
        }

        .doc-heading-l3 {
          font-size: 17px;
          font-weight: 700;
        }

        .doc-paragraph {
          margin: 10px 0;
          font-size: 14px;
          line-height: 1.72;
          color: #2a3a4f;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .doc-list {
          margin: 10px 0 14px 22px;
          color: #2a3a4f;
        }

        .doc-list li {
          margin: 5px 0;
          font-size: 14px;
          line-height: 1.7;
        }

        .doc-quote {
          margin: 12px 0;
          padding: 10px 14px;
          border-left: 4px solid rgba(0, 122, 255, 0.45);
          background: rgba(0, 122, 255, 0.07);
          border-radius: 8px;
          color: #24446f;
          line-height: 1.75;
          white-space: pre-wrap;
        }

        .doc-code {
          margin: 12px 0;
          padding: 12px 14px;
          border-radius: 12px;
          background: #101317;
          color: #f0f4ff;
          font-size: 12px;
          line-height: 1.62;
          white-space: pre-wrap;
          word-break: break-word;
          overflow-x: hidden;
        }

        .doc-code code {
          font-family: 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace;
        }

        .doc-divider {
          border: 0;
          border-top: 1px solid rgba(20, 50, 90, 0.13);
          margin: 14px 0;
        }

        :global(.doc-inline-link) {
          color: #1062ca;
          text-decoration: none;
          border-bottom: 1px dashed rgba(16, 98, 202, 0.35);
        }

        :global(.doc-inline-link:hover) {
          border-bottom-style: solid;
        }

        :global(.doc-inline-code) {
          font-family: 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace;
          font-size: 0.86em;
          background: rgba(16, 30, 56, 0.08);
          border: 1px solid rgba(16, 30, 56, 0.12);
          border-radius: 6px;
          padding: 1px 6px;
        }

        @media (max-width: 680px) {
          .doc-heading-l1 {
            font-size: 20px;
          }

          .doc-heading-l2 {
            font-size: 18px;
          }

          .doc-heading-l3 {
            font-size: 16px;
          }

          .doc-paragraph,
          .doc-list li {
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
}

function parseDocBlocks(raw: string): DocBlock[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const blocks: DocBlock[] = [];
  let index = 0;

  function isStartOfBlock(line: string): boolean {
    const trimmed = line.trim();
    return (
      /^#{1,3}\s+/.test(trimmed) ||
      /^[-*]\s+/.test(trimmed) ||
      /^\d+\.\s+/.test(trimmed) ||
      /^>\s+/.test(trimmed) ||
      /^```/.test(trimmed) ||
      trimmed === '---' ||
      trimmed === '***'
    );
  }

  while (index < lines.length) {
    const current = lines[index];
    const trimmed = current.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', code: codeLines.join('\n').trim() });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, text: headingMatch[2].trim() });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length) {
        const row = lines[index].trim();
        const match = row.match(/^[-*]\s+(.*)$/);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length) {
        const row = lines[index].trim();
        const match = row.match(/^\d+\.\s+(.*)$/);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    if (/^>\s+/.test(trimmed)) {
      const quoteRows: string[] = [];
      while (index < lines.length) {
        const row = lines[index].trim();
        const match = row.match(/^>\s+(.*)$/);
        if (!match) break;
        quoteRows.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: 'quote', text: quoteRows.join('\n') });
      continue;
    }

    const paragraphRows: string[] = [];
    while (index < lines.length) {
      const row = lines[index];
      const rowTrimmed = row.trim();
      if (!rowTrimmed) break;
      if (isStartOfBlock(row)) break;
      paragraphRows.push(rowTrimmed);
      index += 1;
    }

    if (paragraphRows.length) {
      blocks.push({ type: 'paragraph', text: paragraphRows.join('\n') });
    } else {
      index += 1;
    }
  }

  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null = pattern.exec(text);
  let index = 0;

  while (match) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    if (match[1]) {
      nodes.push(
        <code className="doc-inline-code" key={`${keyPrefix}-inline-code-${index}`}>
          {match[1]}
        </code>
      );
    } else if (match[2] && match[3]) {
      nodes.push(
        <a
          key={`${keyPrefix}-inline-link-${index}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="doc-inline-link"
        >
          {match[2]}
        </a>
      );
    }

    cursor = match.index + match[0].length;
    index += 1;
    match = pattern.exec(text);
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes.length > 0 ? nodes : [text];
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatRating(value?: number | null): string {
  return typeof value === 'number' ? value.toFixed(1) : '--';
}

function safeHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function decodePathSegment(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function buildInstallCommand(sourceUrl: string): string {
  if (!sourceUrl.includes('github.com')) {
    return sourceUrl;
  }

  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') {
      return sourceUrl;
    }

    const parts = parsed.pathname.split('/').filter(Boolean).map(decodePathSegment);
    if (parts.length < 2) {
      return sourceUrl;
    }

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, '');
    const repoUrl = `https://github.com/${owner}/${repo}`;

    let derivedSlug = '';
    const treeOrBlobIndex = parts.findIndex((part) => part === 'tree' || part === 'blob');

    if (treeOrBlobIndex >= 0 && parts.length > treeOrBlobIndex + 3) {
      // owner/repo/tree/<branch>/... 或 owner/repo/blob/<branch>/...
      const repoPathParts = parts.slice(treeOrBlobIndex + 3);
      const skillsIndex = repoPathParts.findIndex(
        (segment) => segment.toLowerCase() === 'skills'
      );

      if (skillsIndex >= 0 && repoPathParts.length > skillsIndex + 1) {
        derivedSlug = repoPathParts[skillsIndex + 1];
      } else if (repoPathParts.length === 1) {
        derivedSlug = repoPathParts[0];
      }
    }

    const skillSlug = derivedSlug.trim();
    if (!skillSlug) {
      return `npx skills add ${repoUrl}`;
    }

    return `npx skills add ${repoUrl} --skill ${skillSlug}`;
  } catch {
    return sourceUrl;
  }
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
