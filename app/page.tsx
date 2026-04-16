'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skill } from '@/types';
import { formatNumber } from '@/lib/utils';

const CATEGORY_PRESETS = ['全部', '数据分析', '内容创作', '办公效率', '开发工具', '图像处理', '营销运营'];

type IconKind = 'data' | 'content' | 'office' | 'dev' | 'image' | 'marketing' | 'generic';

const CATEGORY_ICON: Record<string, { icon: IconKind; color: string }> = {
  数据分析: { icon: 'data', color: 'blue' },
  内容创作: { icon: 'content', color: 'purple' },
  办公效率: { icon: 'office', color: 'green' },
  开发工具: { icon: 'dev', color: 'orange' },
  图像处理: { icon: 'image', color: 'pink' },
  营销运营: { icon: 'marketing', color: 'teal' },
  默认: { icon: 'generic', color: 'blue' },
};

function pickCategory(skill: Skill): string {
  if (skill.tags?.length) {
    const hit = CATEGORY_PRESETS.find((tag) => tag !== '全部' && skill.tags.includes(tag));
    if (hit) return hit;
    return skill.tags[0];
  }

  return '其他';
}

function pickIconMeta(category: string) {
  return CATEGORY_ICON[category] ?? CATEGORY_ICON.默认;
}

export default function HomePage() {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  const [keyword, setKeyword] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchSkills() {
      try {
        setLoading(true);
        const response = await fetch('/api/skills?pageSize=50&sortBy=createdAt&sortOrder=desc');
        const result = await response.json();

        if (mounted && result.success) {
          setSkills(result.data.items || []);
        }
      } catch (error) {
        console.error('加载技能列表失败:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchSkills();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredSkills = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return skills.filter((skill) => {
      const category = pickCategory(skill);
      const categoryMatch = activeCategory === '全部' || category === activeCategory || skill.tags?.includes(activeCategory);
      const keywordMatch =
        !normalizedKeyword ||
        skill.title.toLowerCase().includes(normalizedKeyword) ||
        skill.description.toLowerCase().includes(normalizedKeyword) ||
        (skill.tags || []).some((tag) => tag.toLowerCase().includes(normalizedKeyword));

      return categoryMatch && keywordMatch;
    });
  }, [skills, activeCategory, keyword]);

  const hotSkills = useMemo(
    () => [...filteredSkills].sort((a, b) => b.downloadCount - a.downloadCount).slice(0, 4),
    [filteredSkills]
  );

  const newSkills = useMemo(
    () => [...filteredSkills].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 4),
    [filteredSkills]
  );

  const leaderboard = useMemo(
    () => [...filteredSkills].sort((a, b) => b.downloadCount - a.downloadCount).slice(0, 6),
    [filteredSkills]
  );

  const totalHotDownloads = useMemo(
    () => hotSkills.reduce((sum, skill) => sum + skill.downloadCount, 0),
    [hotSkills]
  );

  const rankedLabel = filteredSkills.length > 0 ? formatNumber(filteredSkills.length) : '0';

  return (
    <>
      <section className="hero">
        <div className="hero-badge">已收录 {rankedLabel} 个优质 Skill</div>
        <h1 className="hero-title">
          发现与分享
          <br />
          <span>强大的 AI Skills</span>
        </h1>
        <p className="hero-subtitle">在这里找到你需要的技能，或分享你创造的技能给团队</p>
      </section>

      <div className="search-container">
        <div className="search-box">
          <input
            type="text"
            className="search-input"
            placeholder="搜索 Skill，例如：数据分析、图片处理、文案生成..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                router.push(`/skills?keyword=${encodeURIComponent(keyword)}`);
              }
            }}
          />
          <button
            className="search-btn"
            aria-label="搜索"
            onClick={() => router.push(`/skills?keyword=${encodeURIComponent(keyword)}`)}
          >
            <svg viewBox="0 0 24 24" className="search-icon">
              <circle cx="11" cy="11" r="6" />
              <path d="M16 16L21 21" />
            </svg>
          </button>
        </div>
      </div>

      <div className="categories">
        {CATEGORY_PRESETS.map((category) => (
          <button
            key={category}
            className={`category-tag ${activeCategory === category ? 'active' : ''}`}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <section className="content-section">
        <div className="section-header">
          <h2 className="section-title">热门推荐</h2>
          <button className="view-all" onClick={() => router.push('/skills?sortBy=downloadCount')}>
            查看全部 →
          </button>
        </div>
        <SkillGrid loading={loading} skills={hotSkills} onOpen={setSelectedSkill} />
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2 className="section-title">最新上传</h2>
          <button className="view-all" onClick={() => router.push('/skills?sortBy=createdAt')}>
            查看全部 →
          </button>
        </div>
        <SkillGrid loading={loading} skills={newSkills} onOpen={setSelectedSkill} />
      </section>

      <section className="content-section" id="leaderboard">
        <div className="leaderboard-section">
          <div className="section-header">
            <h2 className="section-title">下载排行榜</h2>
            <div className="leaderboard-summary">累计热度 {formatNumber(totalHotDownloads)}</div>
          </div>
          <div className="leaderboard-grid">
            {loading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="leaderboard-item skeleton" style={{ height: 76 }} />
              ))
            ) : leaderboard.length === 0 ? (
              <div className="empty-block">暂无数据，先上传第一个 Skill 吧</div>
            ) : (
              leaderboard.map((skill, index) => {
                const category = pickCategory(skill);
                const { icon, color } = pickIconMeta(category);
                const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : 'normal';

                return (
                  <div key={skill.id} className="leaderboard-item" onClick={() => setSelectedSkill(skill)}>
                    <div className={`rank ${rankClass}`}>{index + 1}</div>
                    <div className={`skill-icon skill-icon-compact ${color}`} style={{ width: 44, height: 44 }}>
                      <SkillGlyph kind={icon} />
                    </div>
                    <div className="leaderboard-info">
                      <div className="leaderboard-name">{skill.title}</div>
                      <div className="leaderboard-author">{skill.author?.name || '匿名作者'}</div>
                    </div>
                    <div className="leaderboard-downloads">{formatNumber(skill.downloadCount)}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <SkillModal
        skill={selectedSkill}
        onClose={() => setSelectedSkill(null)}
        onJump={(id) => router.push(`/skills/${id}`)}
      />
    </>
  );
}

function SkillGrid({
  loading,
  skills,
  onOpen,
}: {
  loading: boolean;
  skills: Skill[];
  onOpen: (skill: Skill) => void;
}) {
  if (loading) {
    return (
      <div className="skills-grid">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="skill-card skeleton-card">
            <div className="skeleton" style={{ width: 64, height: 64, borderRadius: 12 }} />
            <div className="skeleton" style={{ width: '60%', height: 20, marginTop: 12 }} />
            <div className="skeleton" style={{ width: '100%', height: 56, marginTop: 12 }} />
          </div>
        ))}
      </div>
    );
  }

  if (skills.length === 0) {
    return <div className="empty-block">当前分类下还没有 Skill，试试切换分类或关键词</div>;
  }

  return (
    <div className="skills-grid">
      {skills.map((skill) => {
        const category = pickCategory(skill);
        const { icon, color } = pickIconMeta(category);

        return (
          <article key={skill.id} className="skill-card" onClick={() => onOpen(skill)}>
            <div className="skill-header">
              <div className={`skill-icon ${color}`}>
                <SkillGlyph kind={icon} />
              </div>
              <div className="skill-info">
                <h3 className="skill-name">{skill.title}</h3>
                <p className="skill-author">{skill.author?.name || '匿名作者'}</p>
                <span className="skill-category">{category}</span>
              </div>
            </div>
            <p className="skill-desc">{skill.description}</p>
            <div className="skill-footer">
              <div className="skill-stats">
                <span className="stat">
                  <span className="stat-icon">下载</span>
                  {formatNumber(skill.downloadCount)}
                </span>
                <span className="stat">
                  <span className="stat-icon">浏览</span>
                  {formatNumber(skill.viewCount)}
                </span>
              </div>
              <button
                className="download-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(skill);
                }}
              >
                查看详情
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SkillModal({
  skill,
  onClose,
  onJump,
}: {
  skill: Skill | null;
  onClose: () => void;
  onJump: (id: string) => void;
}) {
  if (!skill) return null;

  const category = pickCategory(skill);
  const { icon, color } = pickIconMeta(category);

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-content">
          <div className="modal-skill-header">
            <div className={`modal-skill-icon ${color}`}>
              <SkillGlyph kind={icon} />
            </div>
            <div className="modal-skill-info">
              <h2>{skill.title}</h2>
              <div className="modal-skill-meta">
                <span>{skill.author?.name || '匿名作者'}</span>
                <span>•</span>
                <span>{category}</span>
                <span>•</span>
                <span>{new Date(skill.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <h3>功能介绍</h3>
            <p>{skill.description}</p>
          </div>

          <div className="modal-section">
            <h3>标签</h3>
            <p>{skill.tags?.length ? skill.tags.join('、') : '暂无标签'}</p>
          </div>

          <div className="modal-stats">
            <div className="modal-stat">
              <div className="modal-stat-value">{formatNumber(skill.downloadCount)}</div>
              <div className="modal-stat-label">下载次数</div>
            </div>
            <div className="modal-stat">
              <div className="modal-stat-value">{formatNumber(skill.viewCount)}</div>
              <div className="modal-stat-label">浏览次数</div>
            </div>
            <div className="modal-stat">
              <div className="modal-stat-value">{formatNumber(skill.fileSize)}</div>
              <div className="modal-stat-label">文件大小 (B)</div>
            </div>
          </div>

          <div className="modal-actions">
            <button className="modal-btn modal-btn-primary" onClick={() => onJump(skill.id)}>
              前往详情
            </button>
            <button className="modal-btn modal-btn-secondary" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillGlyph({ kind }: { kind: IconKind }) {
  switch (kind) {
    case 'data':
      return (
        <svg viewBox="0 0 24 24" className="skill-icon-glyph">
          <path d="M4 20V10" />
          <path d="M10 20V6" />
          <path d="M16 20V13" />
          <path d="M22 20V3" />
        </svg>
      );
    case 'content':
      return (
        <svg viewBox="0 0 24 24" className="skill-icon-glyph">
          <path d="M4 20L9 19L19 9L15 5L5 15L4 20Z" />
          <path d="M14 6L18 10" />
        </svg>
      );
    case 'office':
      return (
        <svg viewBox="0 0 24 24" className="skill-icon-glyph">
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 8H16" />
          <path d="M8 12H16" />
          <path d="M8 16H13" />
        </svg>
      );
    case 'dev':
      return (
        <svg viewBox="0 0 24 24" className="skill-icon-glyph">
          <path d="M8 8L4 12L8 16" />
          <path d="M16 8L20 12L16 16" />
          <path d="M13.5 5L10.5 19" />
        </svg>
      );
    case 'image':
      return (
        <svg viewBox="0 0 24 24" className="skill-icon-glyph">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 15L8 10L12 14L15 11L21 17" />
          <circle cx="16.5" cy="8" r="1.5" />
        </svg>
      );
    case 'marketing':
      return (
        <svg viewBox="0 0 24 24" className="skill-icon-glyph">
          <path d="M4 13V11L14 6V18L4 13Z" />
          <path d="M14 9C16.5 9 18.5 11 18.5 13C18.5 15 16.5 17 14 17" />
          <path d="M6.5 13V18H9.5V14.5" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="skill-icon-glyph">
          <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" />
          <path d="M12 3V12L20 7.5" />
          <path d="M12 12L4 7.5" />
        </svg>
      );
  }
}
