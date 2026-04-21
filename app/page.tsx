'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { message } from 'antd';
import { Skill, SkillCategory } from '@/types';
import { getFallbackSkillCategories } from '@/lib/category-presets';
import { trackEvent } from '@/lib/analytics-client';
import { isSuperAdminEmail } from '@/lib/dashboard-access';
import { formatNumber } from '@/lib/utils';

interface HumanSummary extends SkillCategory {
  skillCount: number;
  totalDownloads: number;
  totalViews: number;
  topSkills: Array<{
    id: string;
    title: string;
    downloadCount: number;
    viewCount: number;
  }>;
}

interface SiteOverview {
  totalSkills: number;
  totalDownloads: number;
  totalViews: number;
  totalUsers: number;
}

type HumanSketchKind = 'data' | 'video' | 'dev' | 'generic';

const RANK_LIMIT = 10;

const HUMAN_INTRO_MAP: Record<string, string> = {
  'data-analysis-expert': '擅长指标体系、数据清洗、可视化建模与经营分析。',
  'short-video-expert': '聚焦短视频选题、脚本、拍摄拆解与内容增长策略。',
  'programming-dev-expert': '覆盖编码实现、系统设计、工程效率与自动化交付。',
};

export default function HomePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [keyword, setKeyword] = useState('');
  const [humans, setHumans] = useState<HumanSummary[]>([]);
  const [rankSkills, setRankSkills] = useState<Skill[]>([]);
  const [overview, setOverview] = useState<SiteOverview>({
    totalSkills: 0,
    totalDownloads: 0,
    totalViews: 0,
    totalUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    icon: 'generic',
  });

  const isAdmin = isSuperAdminEmail(session?.user?.email);

  useEffect(() => {
    let mounted = true;

    async function fetchHomeData() {
      try {
        setLoading(true);

        const [humansRes, rankRes, overviewRes] = await Promise.allSettled([
          fetch('/api/humans', { cache: 'no-store' }).then((r) => r.json()),
          fetch(`/api/skills?pageSize=${RANK_LIMIT}&sortBy=downloadCount&sortOrder=desc`, {
            cache: 'no-store',
          }).then((r) => r.json()),
          fetch('/api/stats/overview', { cache: 'no-store' }).then((r) => r.json()),
        ]);

        if (!mounted) return;

        if (humansRes.status === 'fulfilled' && humansRes.value?.success) {
          const nextHumans = Array.isArray(humansRes.value.data)
            ? (humansRes.value.data as HumanSummary[])
            : [];
          setHumans(nextHumans);
        } else {
          const fallback = getFallbackSkillCategories().map((item) => ({
            ...item,
            skillCount: 0,
            totalDownloads: 0,
            totalViews: 0,
            topSkills: [],
          }));
          setHumans(fallback);
        }

        if (rankRes.status === 'fulfilled' && rankRes.value?.success) {
          setRankSkills((rankRes.value.data?.items || []) as Skill[]);
        } else {
          setRankSkills([]);
        }

        if (overviewRes.status === 'fulfilled' && overviewRes.value?.success) {
          setOverview(overviewRes.value.data as SiteOverview);
        }
      } catch (error) {
        console.error('首页数字人数据加载失败:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchHomeData();
    const timer = setInterval(fetchHomeData, 20000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const featuredHumans = useMemo(
    () => [...humans].sort((a, b) => (b.skillCount || 0) - (a.skillCount || 0)),
    [humans]
  );

  async function createHuman() {
    const name = createForm.name.trim();
    if (!name) {
      message.warning('请填写数字人名称');
      return;
    }

    try {
      setCreating(true);
      const response = await fetch('/api/humans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug: createForm.slug.trim(),
          icon: createForm.icon,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '创建失败');
      }

      setHumans((prev) => {
        const next = [...prev, result.data as HumanSummary];
        next.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        return next;
      });
      setCreateForm({ name: '', slug: '', icon: 'generic' });
      setShowCreate(false);
      message.success('数字人创建成功');
    } catch (error: any) {
      console.error('创建数字人失败:', error);
      message.error(error.message || '创建数字人失败');
    } finally {
      setCreating(false);
    }
  }

  function goHumanDetail(human: HumanSummary, source: string) {
    trackEvent({
      eventName: 'category_click',
      module: 'home',
      action: 'open_human_workspace',
      categoryId: human.id,
      metadata: {
        categoryName: human.name,
        source,
      },
    });
    router.push(`/humans/${encodeURIComponent(human.slug)}`);
  }

  return (
    <div className="digital-home-page">
      <section className="human-hero-panel">
        <div className="hero-copy">
          <div className="hero-badge">数字人工作台</div>
          <h1>
            用数字人组织 Skill
            <br />
            让能力沉淀可运营
          </h1>
          <p>
            当前平台已收录 {formatNumber(overview.totalSkills)} 个 Skill，累计下载{' '}
            {formatNumber(overview.totalDownloads)} 次，累计浏览 {formatNumber(overview.totalViews)} 次。
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="hero-primary"
              onClick={() => router.push('/upload')}
            >
              上传 Skill
            </button>
            <button
              type="button"
              className="hero-secondary"
              onClick={() => router.push('/skills?sortBy=downloadCount&sortOrder=desc')}
            >
              进入技能库
            </button>
          </div>
        </div>

        <div className="hero-search-panel">
          <label htmlFor="home-search">全站搜索</label>
          <div className="hero-search-box">
            <input
              id="home-search"
              type="text"
              value={keyword}
              placeholder="搜索 Skill 关键词，例如：归因分析、短视频脚本、API 自动化"
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const normalized = keyword.trim();
                if (!normalized) return;
                trackEvent({
                  eventName: 'skill_search',
                  module: 'home',
                  action: 'enter',
                  metadata: {
                    keyword: normalized,
                  },
                });
                router.push(`/skills?keyword=${encodeURIComponent(normalized)}`);
              }}
            />
            <button
              type="button"
              onClick={() => {
                const normalized = keyword.trim();
                if (!normalized) return;
                trackEvent({
                  eventName: 'skill_search',
                  module: 'home',
                  action: 'click',
                  metadata: {
                    keyword: normalized,
                  },
                });
                router.push(`/skills?keyword=${encodeURIComponent(normalized)}`);
              }}
            >
              搜索
            </button>
          </div>

          <div className="hero-metrics">
            <div>
              <span>数字人数量</span>
              <strong>{formatNumber(humans.length)}</strong>
            </div>
            <div>
              <span>创作者</span>
              <strong>{formatNumber(overview.totalUsers)}</strong>
            </div>
            <div>
              <span>平台 Skill</span>
              <strong>{formatNumber(overview.totalSkills)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="humans-header-row">
        <div>
          <h2>数字人入口</h2>
          <p>首页已由分类流切换为数字人流，点击数字人即可进入对应技能空间。</p>
        </div>
        {isAdmin ? (
          <button type="button" className="create-human-btn" onClick={() => setShowCreate(true)}>
            + 创建数字人
          </button>
        ) : null}
      </section>

      <section className="human-grid-section">
        {loading ? (
          <div className="human-grid-loading">数字人加载中...</div>
        ) : featuredHumans.length === 0 ? (
          <div className="human-grid-loading">暂无数字人，请先创建。</div>
        ) : (
          <div className="human-grid">
            {featuredHumans.map((human, index) => {
              const sketchKind = resolveSketchKind(human);
              const intro = HUMAN_INTRO_MAP[human.slug] || '按业务目标组织 Skill，持续迭代方法与产出模板。';
              const tone = sketchKind === 'data' ? 'data' : sketchKind === 'video' ? 'video' : sketchKind === 'dev' ? 'dev' : 'generic';

              return (
                <article
                  key={human.id}
                  className={`human-card tone-${tone}`}
                  onClick={() => goHumanDetail(human, 'card')}
                >
                  <div className="human-sketch-wrap">
                    <HumanSketch kind={sketchKind} />
                  </div>

                  <div className="human-card-head">
                    <span className="human-order">No.{String(index + 1).padStart(2, '0')}</span>
                    <h3>{human.name}</h3>
                  </div>

                  <p className="human-intro">{intro}</p>

                  <div className="human-stats-row">
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

                  <div className="human-top-skill-list">
                    {(human.topSkills || []).slice(0, 2).map((item) => (
                      <div key={item.id} className="top-skill-pill">
                        {item.title}
                      </div>
                    ))}
                    {(human.topSkills || []).length === 0 ? (
                      <div className="top-skill-pill muted">暂未上传 Skill</div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="enter-human-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      goHumanDetail(human, 'button');
                    }}
                  >
                    进入数字人工作台
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="leaderboard-panel" id="leaderboard">
        <div className="leaderboard-head">
          <h2>下载排行榜</h2>
          <button
            type="button"
            className="hero-secondary"
            onClick={() => router.push('/skills?sortBy=downloadCount&sortOrder=desc')}
          >
            查看全部
          </button>
        </div>

        {rankSkills.length === 0 ? (
          <div className="human-grid-loading">暂无排行数据</div>
        ) : (
          <div className="rank-list">
            {rankSkills.slice(0, RANK_LIMIT).map((skill, index) => (
              <button
                type="button"
                key={skill.id}
                className="rank-item"
                onClick={() => router.push(`/skills/${skill.id}`)}
              >
                <span className="rank-index">#{index + 1}</span>
                <span className="rank-title">{skill.title}</span>
                <span className="rank-human">{skill.category?.name || '未归属数字人'}</span>
                <span className="rank-download">{formatNumber(skill.downloadCount)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {showCreate ? (
        <div className="create-human-modal" onClick={() => setShowCreate(false)}>
          <div className="create-human-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>创建数字人</h3>
            <p>创建后即可在上传 Skill 时选择该数字人。</p>

            <label>
              数字人名称
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="例如：品牌增长专家"
              />
            </label>

            <label>
              标识（可选）
              <input
                type="text"
                value={createForm.slug}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="例如：brand-growth-expert"
              />
            </label>

            <label>
              形象风格
              <select
                value={createForm.icon}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, icon: e.target.value }))}
              >
                <option value="data">数据分析风格</option>
                <option value="video">短视频风格</option>
                <option value="dev">编程开发风格</option>
                <option value="generic">通用风格</option>
              </select>
            </label>

            <div className="create-human-actions">
              <button type="button" className="hero-secondary" onClick={() => setShowCreate(false)}>
                取消
              </button>
              <button type="button" className="hero-primary" disabled={creating} onClick={createHuman}>
                {creating ? '创建中...' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .digital-home-page {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding-bottom: 28px;
        }

        .human-hero-panel {
          position: relative;
          border-radius: 26px;
          background:
            radial-gradient(circle at 15% 20%, rgba(247, 239, 223, 0.95) 0%, rgba(247, 239, 223, 0) 50%),
            radial-gradient(circle at 88% 12%, rgba(213, 235, 243, 0.88) 0%, rgba(213, 235, 243, 0) 40%),
            linear-gradient(140deg, #fffdf6 0%, #f5f0e6 45%, #edf2f8 100%);
          border: 1px solid rgba(105, 76, 38, 0.18);
          box-shadow: 0 20px 56px rgba(95, 71, 28, 0.12);
          padding: 28px;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 18px;
          overflow: hidden;
        }

        .human-hero-panel::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: repeating-linear-gradient(
            105deg,
            rgba(104, 76, 35, 0.04) 0,
            rgba(104, 76, 35, 0.04) 1px,
            transparent 1px,
            transparent 14px
          );
          mix-blend-mode: multiply;
          opacity: 0.45;
        }

        .hero-copy,
        .hero-search-panel {
          position: relative;
          z-index: 1;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #5a3712;
          background: rgba(255, 227, 176, 0.82);
          border: 1px solid rgba(135, 97, 40, 0.28);
          margin-bottom: 12px;
        }

        .hero-copy h1 {
          margin: 0;
          font-size: 44px;
          line-height: 1.1;
          letter-spacing: -0.04em;
          color: #3a2410;
          font-family: 'Hannotate SC', 'Kaiti SC', 'STKaiti', 'Avenir Next', sans-serif;
        }

        .hero-copy p {
          margin: 14px 0 0;
          color: #54453a;
          font-size: 15px;
          max-width: 640px;
        }

        .hero-actions {
          margin-top: 20px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .hero-primary,
        .hero-secondary,
        .create-human-btn,
        .enter-human-btn {
          border: none;
          cursor: pointer;
          border-radius: 12px;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 700;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          font-family: inherit;
        }

        .hero-primary,
        .create-human-btn,
        .enter-human-btn {
          color: #fff;
          background: linear-gradient(140deg, #c66a24 0%, #8a3f14 100%);
          box-shadow: 0 8px 20px rgba(114, 54, 15, 0.26);
        }

        .hero-secondary {
          color: #533218;
          background: rgba(255, 244, 219, 0.88);
          border: 1px solid rgba(130, 92, 35, 0.32);
        }

        .hero-primary:hover,
        .hero-secondary:hover,
        .create-human-btn:hover,
        .enter-human-btn:hover {
          transform: translateY(-1px);
        }

        .hero-search-panel {
          border-radius: 20px;
          border: 1px solid rgba(125, 92, 41, 0.2);
          background: rgba(255, 250, 241, 0.75);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.48);
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .hero-search-panel label {
          font-size: 12px;
          color: #654b31;
          letter-spacing: 0.05em;
          font-weight: 700;
        }

        .hero-search-box {
          display: flex;
          gap: 8px;
        }

        .hero-search-box input,
        .create-human-dialog input,
        .create-human-dialog select {
          width: 100%;
          border: 1px solid rgba(124, 90, 50, 0.25);
          border-radius: 10px;
          font-size: 14px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.88);
          color: #2e1c0f;
          outline: none;
        }

        .hero-search-box input:focus,
        .create-human-dialog input:focus,
        .create-human-dialog select:focus {
          border-color: rgba(179, 92, 28, 0.56);
          box-shadow: 0 0 0 2px rgba(179, 92, 28, 0.12);
        }

        .hero-search-box button {
          border: none;
          border-radius: 10px;
          background: #6f4020;
          color: #fff;
          padding: 0 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .hero-metrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .hero-metrics div {
          border-radius: 12px;
          border: 1px dashed rgba(118, 85, 46, 0.24);
          background: rgba(255, 255, 255, 0.66);
          padding: 10px;
        }

        .hero-metrics span {
          display: block;
          font-size: 12px;
          color: #6d5640;
        }

        .hero-metrics strong {
          display: block;
          margin-top: 4px;
          font-size: 20px;
          color: #3f2615;
        }

        .humans-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 4px;
        }

        .humans-header-row h2 {
          font-size: 26px;
          margin: 0;
          color: #2f1b0d;
        }

        .humans-header-row p {
          margin: 6px 0 0;
          color: #5a4b43;
          font-size: 14px;
        }

        .human-grid-section {
          min-height: 220px;
        }

        .human-grid-loading {
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.86);
          border: 1px dashed rgba(112, 87, 52, 0.34);
          color: #6e5740;
          padding: 24px;
          text-align: center;
          font-size: 14px;
        }

        .human-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(272px, 1fr));
          gap: 14px;
        }

        .human-card {
          border-radius: 18px;
          padding: 14px;
          border: 1px solid rgba(136, 94, 42, 0.25);
          box-shadow: 0 10px 22px rgba(92, 66, 34, 0.1);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          min-height: 360px;
          position: relative;
          overflow: hidden;
        }

        .human-card::before {
          content: '';
          position: absolute;
          inset: -20% auto auto -20%;
          width: 170px;
          height: 170px;
          border-radius: 999px;
          opacity: 0.55;
          filter: blur(20px);
        }

        .human-card.tone-data {
          background: linear-gradient(145deg, #fcf6ec 0%, #ecf4ff 100%);
        }

        .human-card.tone-video {
          background: linear-gradient(145deg, #fff3ea 0%, #fff8f0 100%);
        }

        .human-card.tone-dev {
          background: linear-gradient(145deg, #f6f4ff 0%, #eef3ff 100%);
        }

        .human-card.tone-generic {
          background: linear-gradient(145deg, #faf7ef 0%, #f2f5f8 100%);
        }

        .human-card.tone-data::before {
          background: rgba(88, 140, 188, 0.24);
        }

        .human-card.tone-video::before {
          background: rgba(209, 118, 57, 0.24);
        }

        .human-card.tone-dev::before {
          background: rgba(92, 105, 188, 0.26);
        }

        .human-card.tone-generic::before {
          background: rgba(126, 110, 89, 0.2);
        }

        .human-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 32px rgba(91, 66, 35, 0.16);
        }

        .human-sketch-wrap {
          position: relative;
          z-index: 1;
          border-radius: 14px;
          border: 1px dashed rgba(132, 88, 44, 0.35);
          background: rgba(255, 255, 255, 0.62);
          padding: 8px;
          min-height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .human-card-head,
        .human-intro,
        .human-stats-row,
        .human-top-skill-list,
        .enter-human-btn {
          position: relative;
          z-index: 1;
        }

        .human-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .human-order {
          color: #876445;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
        }

        .human-card-head h3 {
          margin: 0;
          font-size: 24px;
          color: #2d1a0c;
          font-family: 'Hannotate SC', 'Kaiti SC', 'Avenir Next', sans-serif;
        }

        .human-intro {
          margin: 0;
          color: #5a4a3f;
          font-size: 13px;
          min-height: 40px;
        }

        .human-stats-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .human-stats-row div {
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(124, 89, 45, 0.2);
          border-radius: 10px;
          padding: 8px;
        }

        .human-stats-row span {
          display: block;
          font-size: 11px;
          color: #6d5540;
        }

        .human-stats-row strong {
          margin-top: 3px;
          display: block;
          font-size: 18px;
          color: #3f2718;
        }

        .human-top-skill-list {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          min-height: 56px;
        }

        .top-skill-pill {
          font-size: 12px;
          border-radius: 999px;
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.74);
          border: 1px solid rgba(125, 93, 53, 0.23);
          color: #5b4434;
        }

        .top-skill-pill.muted {
          color: #8a796a;
          border-style: dashed;
        }

        .enter-human-btn {
          margin-top: auto;
          width: 100%;
        }

        .leaderboard-panel {
          border-radius: 18px;
          border: 1px solid rgba(125, 90, 43, 0.2);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, rgba(250, 245, 238, 0.92) 100%);
          box-shadow: 0 10px 24px rgba(84, 62, 34, 0.1);
          padding: 16px;
        }

        .leaderboard-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 12px;
        }

        .leaderboard-head h2 {
          margin: 0;
          color: #332013;
          font-size: 24px;
        }

        .rank-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .rank-item {
          width: 100%;
          border: 1px solid rgba(132, 93, 44, 0.2);
          background: rgba(255, 255, 255, 0.82);
          border-radius: 12px;
          padding: 10px;
          display: grid;
          grid-template-columns: 56px 1.4fr 1fr auto;
          gap: 10px;
          text-align: left;
          align-items: center;
          cursor: pointer;
          color: #2f1f12;
        }

        .rank-index {
          font-weight: 800;
          color: #8d5a2a;
        }

        .rank-title {
          font-size: 14px;
          font-weight: 700;
        }

        .rank-human {
          font-size: 12px;
          color: #6b5543;
        }

        .rank-download {
          font-size: 13px;
          font-weight: 700;
          color: #59381d;
        }

        .create-human-modal {
          position: fixed;
          inset: 0;
          background: rgba(16, 12, 7, 0.48);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          z-index: 1300;
        }

        .create-human-dialog {
          width: min(460px, 100%);
          border-radius: 14px;
          background: #fff7ea;
          border: 1px solid rgba(133, 92, 42, 0.28);
          box-shadow: 0 18px 36px rgba(75, 49, 21, 0.24);
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .create-human-dialog h3 {
          margin: 0;
          font-size: 24px;
          color: #2c1a0e;
        }

        .create-human-dialog p {
          margin: 0;
          font-size: 13px;
          color: #6b5743;
        }

        .create-human-dialog label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          color: #4d361f;
          font-size: 13px;
          font-weight: 700;
        }

        .create-human-actions {
          margin-top: 6px;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .human-sketch-svg {
          width: 100%;
          max-width: 240px;
          height: 138px;
          stroke: #4d351f;
          stroke-width: 2.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
          animation: handFloat 3.6s ease-in-out infinite;
        }

        @keyframes handFloat {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-3px);
          }
        }

        @media (max-width: 1080px) {
          .human-hero-panel {
            grid-template-columns: 1fr;
            padding: 20px;
          }

          .hero-copy h1 {
            font-size: 36px;
          }
        }

        @media (max-width: 760px) {
          .humans-header-row {
            flex-direction: column;
            align-items: flex-start;
          }

          .hero-metrics {
            grid-template-columns: 1fr;
          }

          .rank-item {
            grid-template-columns: 48px 1fr;
          }

          .rank-human,
          .rank-download {
            grid-column: 2;
          }

          .rank-title {
            grid-column: 2;
          }
        }
      `}</style>
    </div>
  );
}

function resolveSketchKind(human: SkillCategory): HumanSketchKind {
  const key = `${human.slug || ''} ${human.name || ''}`.toLowerCase();
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
        <path d="M98 78L84 106" />
        <path d="M138 78L152 106" />
        <path d="M104 74H134L138 110H100L104 74Z" />
        <rect x="152" y="60" width="56" height="42" rx="8" />
        <path d="M170 60L176 52H196L202 60" />
        <circle cx="180" cy="81" r="10" />
        <path d="M160 104L170 122" />
        <path d="M200 104L192 122" />
        <rect x="25" y="72" width="52" height="30" rx="5" />
        <path d="M25 82H77" />
        <path d="M35 72L40 64H47L52 72" />
      </svg>
    );
  }

  if (kind === 'dev') {
    return (
      <svg viewBox="0 0 240 140" className="human-sketch-svg" aria-hidden="true">
        <path d="M36 122H204" />
        <circle cx="120" cy="40" r="22" />
        <path d="M108 41H132" />
        <path d="M112 52C116 55 124 55 128 52" />
        <path d="M100 70H140L145 110H95L100 70Z" />
        <path d="M108 80H132" />
        <path d="M112 90H128" />
        <rect x="62" y="82" width="26" height="18" rx="3" />
        <path d="M66 90L71 94L66 98" />
        <path d="M84 90L79 94L84 98" />
        <rect x="152" y="82" width="26" height="18" rx="3" />
        <path d="M158 92H172" />
        <path d="M158 97H166" />
        <rect x="103" y="112" width="34" height="6" rx="2" />
        <path d="M93 122L103 110" />
        <path d="M147 110L157 122" />
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
        <path d="M108 51C113 55 123 55 128 51" />
        <path d="M97 70H139L145 112H91L97 70Z" />
        <path d="M86 80L72 105" />
        <path d="M150 80L164 105" />
        <rect x="154" y="26" width="54" height="36" rx="6" />
        <path d="M164 54V40" />
        <path d="M176 54V33" />
        <path d="M188 54V45" />
        <path d="M200 54V36" />
        <path d="M73 30L80 25L87 30" />
        <path d="M80 25V53" />
        <path d="M76 40H84" />
        <path d="M102 112L96 122" />
        <path d="M136 112L142 122" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 240 140" className="human-sketch-svg" aria-hidden="true">
      <path d="M35 122H205" />
      <circle cx="120" cy="40" r="22" />
      <path d="M110 51C114 55 126 55 130 51" />
      <path d="M100 70H140L144 110H96L100 70Z" />
      <path d="M85 84L72 106" />
      <path d="M155 84L168 106" />
      <circle cx="74" cy="56" r="9" />
      <rect x="154" y="50" width="24" height="14" rx="4" />
      <path d="M104 112L98 122" />
      <path d="M136 112L142 122" />
    </svg>
  );
}
