'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Skill } from '@/types';
import { trackEvent } from '@/lib/analytics-client';
import { formatNumber, formatTime } from '@/lib/utils';

interface HumanDetail {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  skillCount: number;
  totalDownloads: number;
  totalViews: number;
  skills: Skill[];
}

type HumanSketchKind = 'data' | 'video' | 'dev' | 'generic';

export default function HumanWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [human, setHuman] = useState<HumanDetail | null>(null);
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<'downloadCount' | 'viewCount' | 'createdAt'>('downloadCount');

  const slug = decodeURIComponent((params.slug as string) || '');

  useEffect(() => {
    let mounted = true;

    async function fetchHumanDetail() {
      try {
        setLoading(true);
        const response = await fetch(`/api/humans/${encodeURIComponent(slug)}`, {
          cache: 'no-store',
        });
        const result = await response.json();
        if (!mounted) return;

        if (!response.ok || !result.success) {
          setHuman(null);
          return;
        }

        setHuman(result.data as HumanDetail);
      } catch (error) {
        console.error('加载数字人详情失败:', error);
        if (mounted) {
          setHuman(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchHumanDetail();
    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!human) return;
    trackEvent({
      eventName: 'category_click',
      module: 'human-workspace',
      action: 'view_workspace',
      categoryId: human.id,
      metadata: {
        categoryName: human.name,
      },
    });
  }, [human]);

  const sketchKind = useMemo(() => resolveSketchKind(human), [human]);

  const filteredSkills = useMemo(() => {
    if (!human?.skills) return [];
    const normalized = keyword.trim().toLowerCase();
    const base = [...human.skills];

    base.sort((a, b) => {
      if (sortBy === 'createdAt') {
        return +new Date(b.createdAt) - +new Date(a.createdAt);
      }
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    });

    if (!normalized) return base;

    return base.filter((skill) => {
      return (
        skill.title.toLowerCase().includes(normalized) ||
        (skill.summary || '').toLowerCase().includes(normalized) ||
        skill.description.toLowerCase().includes(normalized) ||
        (skill.tags || []).some((tag) => tag.toLowerCase().includes(normalized))
      );
    });
  }, [human?.skills, keyword, sortBy]);

  if (loading) {
    return <div className="loading-page">数字人工作台加载中...</div>;
  }

  if (!human) {
    return (
      <div className="skills-page-shell">
        <div className="empty-block">
          数字人不存在或已下线
          <div style={{ marginTop: 12 }}>
            <button type="button" className="download-btn" onClick={() => router.push('/')}>
              返回首页
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="human-workspace-page">
      <nav className="workspace-breadcrumb">
        <Link href="/">首页</Link>
        <span> / </span>
        <span>数字人</span>
        <span> / </span>
        <span>{human.name}</span>
      </nav>

      <section className="workspace-hero">
        <div className="workspace-hero-sketch">
          <HumanSketch kind={sketchKind} />
        </div>
        <div className="workspace-hero-main">
          <h1>{human.name}</h1>
          <p>这里收录与 {human.name} 相关的 Skill。你可以上传新 Skill，或将已有 Skill 调整归属到该数字人。</p>
          <div className="workspace-actions">
            <button
              type="button"
              className="workspace-primary"
              onClick={() => router.push(`/upload?humanId=${human.id}`)}
            >
              上传到该数字人
            </button>
            <button
              type="button"
              className="workspace-secondary"
              onClick={() => router.push('/skills?sortBy=downloadCount&sortOrder=desc')}
            >
              查看全部 Skill
            </button>
          </div>
        </div>
        <div className="workspace-metrics">
          <div>
            <span>Skill</span>
            <strong>{formatNumber(human.skillCount || 0)}</strong>
          </div>
          <div>
            <span>下载</span>
            <strong>{formatNumber(human.totalDownloads || 0)}</strong>
          </div>
          <div>
            <span>浏览</span>
            <strong>{formatNumber(human.totalViews || 0)}</strong>
          </div>
        </div>
      </section>

      <section className="workspace-toolbar">
        <input
          type="text"
          className="input"
          placeholder="搜索该数字人下的 Skill..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
          <option value="downloadCount">按下载量</option>
          <option value="viewCount">按浏览量</option>
          <option value="createdAt">按上传时间</option>
        </select>
      </section>

      <section className="workspace-skill-grid">
        {filteredSkills.length === 0 ? (
          <div className="empty-block">
            该数字人下暂无 Skill
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="download-btn"
                onClick={() => router.push(`/upload?humanId=${human.id}`)}
              >
                上传第一个 Skill
              </button>
            </div>
          </div>
        ) : (
          <div className="skills-grid">
            {filteredSkills.map((skill) => (
              <article key={skill.id} className="skill-card skill-card-article">
                <Link href={`/skills/${skill.id}`} className="skill-card-link-body">
                  <div className="skill-header">
                    <div className="skill-info">
                      <h3 className="skill-name">{skill.title}</h3>
                      <p className="skill-author">{skill.author?.name || '匿名作者'}</p>
                      <span className="skill-category">{skill.category?.name || human.name}</span>
                    </div>
                  </div>
                  <p className="skill-desc">{skill.summary || skill.description}</p>
                  <div className="skill-list-meta">
                    <span>📥 {formatNumber(skill.downloadCount)}</span>
                    <span>👁 {formatNumber(skill.viewCount)}</span>
                    <span>🕒 {formatTime(skill.createdAt)}</span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        .human-workspace-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-bottom: 24px;
        }

        .workspace-breadcrumb {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .workspace-breadcrumb :global(a) {
          color: #8c4d1e;
          text-decoration: none;
        }

        .workspace-hero {
          border-radius: 20px;
          border: 1px solid rgba(124, 89, 44, 0.24);
          background: linear-gradient(145deg, #fff9ee 0%, #eef3ff 100%);
          box-shadow: 0 14px 36px rgba(91, 64, 29, 0.12);
          padding: 18px;
          display: grid;
          grid-template-columns: 260px minmax(0, 1fr) 220px;
          gap: 14px;
          align-items: stretch;
        }

        .workspace-hero-sketch {
          border-radius: 14px;
          border: 1px dashed rgba(123, 89, 46, 0.34);
          background: rgba(255, 255, 255, 0.72);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
        }

        .workspace-hero-main h1 {
          margin: 0;
          font-size: 34px;
          color: #2e1c0f;
          letter-spacing: -0.03em;
          font-family: 'Hannotate SC', 'Kaiti SC', 'STKaiti', 'Avenir Next', sans-serif;
        }

        .workspace-hero-main p {
          margin: 12px 0 0;
          color: #5c4c41;
          font-size: 14px;
        }

        .workspace-actions {
          margin-top: 16px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .workspace-primary,
        .workspace-secondary {
          border: none;
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
        }

        .workspace-primary {
          color: #fff;
          background: linear-gradient(140deg, #ca702b 0%, #8f4518 100%);
          box-shadow: 0 8px 20px rgba(108, 53, 17, 0.24);
        }

        .workspace-secondary {
          color: #59371d;
          background: rgba(255, 245, 220, 0.9);
          border: 1px solid rgba(129, 90, 40, 0.24);
        }

        .workspace-metrics {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .workspace-metrics div {
          border-radius: 12px;
          border: 1px solid rgba(122, 88, 47, 0.22);
          background: rgba(255, 255, 255, 0.8);
          padding: 10px;
        }

        .workspace-metrics span {
          display: block;
          font-size: 12px;
          color: #715740;
        }

        .workspace-metrics strong {
          display: block;
          margin-top: 2px;
          color: #3f2817;
          font-size: 20px;
        }

        .workspace-toolbar {
          display: grid;
          grid-template-columns: 1fr 220px;
          gap: 10px;
        }

        .workspace-skill-grid {
          min-height: 200px;
        }

        .human-sketch-svg {
          width: 100%;
          max-width: 230px;
          height: 140px;
          fill: none;
          stroke: #4f341e;
          stroke-width: 2.2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        @media (max-width: 1060px) {
          .workspace-hero {
            grid-template-columns: 1fr;
          }

          .workspace-metrics {
            flex-direction: row;
          }

          .workspace-metrics div {
            flex: 1;
          }
        }

        @media (max-width: 720px) {
          .workspace-toolbar {
            grid-template-columns: 1fr;
          }

          .workspace-metrics {
            flex-direction: column;
          }

          .workspace-hero-main h1 {
            font-size: 28px;
          }
        }
      `}</style>
    </div>
  );
}

function resolveSketchKind(human: HumanDetail | null): HumanSketchKind {
  const key = `${human?.slug || ''} ${human?.name || ''}`.toLowerCase();
  if (key.includes('data') || key.includes('数据')) return 'data';
  if (key.includes('video') || key.includes('短视频')) return 'video';
  if (key.includes('dev') || key.includes('编程') || key.includes('开发')) return 'dev';
  return 'generic';
}

function HumanSketch({ kind }: { kind: HumanSketchKind }) {
  if (kind === 'video') {
    return (
      <svg viewBox="0 0 240 140" className="human-sketch-svg" aria-hidden="true">
        <path d="M40 122H202" />
        <path d="M92 43C92 30 102 20 118 20C133 20 144 31 144 43C144 56 133 66 118 66C103 66 92 55 92 43Z" />
        <path d="M103 53C108 58 128 58 133 53" />
        <path d="M104 74H134L138 110H100L104 74Z" />
        <rect x="152" y="60" width="56" height="42" rx="8" />
        <path d="M170 60L176 52H196L202 60" />
        <circle cx="180" cy="81" r="10" />
        <rect x="25" y="72" width="52" height="30" rx="5" />
        <path d="M25 82H77" />
      </svg>
    );
  }

  if (kind === 'dev') {
    return (
      <svg viewBox="0 0 240 140" className="human-sketch-svg" aria-hidden="true">
        <path d="M36 122H204" />
        <circle cx="120" cy="40" r="22" />
        <path d="M100 70H140L145 110H95L100 70Z" />
        <rect x="62" y="82" width="26" height="18" rx="3" />
        <path d="M66 90L71 94L66 98" />
        <path d="M84 90L79 94L84 98" />
        <rect x="152" y="82" width="26" height="18" rx="3" />
        <path d="M158 92H172" />
        <path d="M158 97H166" />
      </svg>
    );
  }

  if (kind === 'data') {
    return (
      <svg viewBox="0 0 240 140" className="human-sketch-svg" aria-hidden="true">
        <path d="M34 122H206" />
        <circle cx="118" cy="39" r="22" />
        <circle cx="110" cy="39" r="5" />
        <circle cx="126" cy="39" r="5" />
        <path d="M115 39H121" />
        <path d="M97 70H139L145 112H91L97 70Z" />
        <rect x="154" y="26" width="54" height="36" rx="6" />
        <path d="M164 54V40" />
        <path d="M176 54V33" />
        <path d="M188 54V45" />
        <path d="M200 54V36" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 240 140" className="human-sketch-svg" aria-hidden="true">
      <path d="M35 122H205" />
      <circle cx="120" cy="40" r="22" />
      <path d="M100 70H140L144 110H96L100 70Z" />
      <circle cx="74" cy="56" r="9" />
      <rect x="154" y="50" width="24" height="14" rx="4" />
    </svg>
  );
}

