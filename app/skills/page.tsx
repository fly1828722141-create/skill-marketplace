'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { message } from 'antd';
import { useSession } from 'next-auth/react';
import { Skill, SkillCategory } from '@/types';
import { trackEvent } from '@/lib/analytics-client';
import { getFallbackSkillCategories } from '@/lib/category-presets';
import { canManageSkill, isSuperAdminEmail } from '@/lib/dashboard-access';
import { formatFileSize, formatNumber, formatTime } from '@/lib/utils';

const ALL_CATEGORY_ID = 'all';
const SKILLS_PAGE_CACHE_KEY = 'skill_marketplace_skills_page_cache_v1';

type SortField = 'createdAt' | 'downloadCount' | 'viewCount';
type SortOrder = 'asc' | 'desc';

type IconKind = 'data' | 'content' | 'office' | 'dev' | 'image' | 'marketing' | 'generic';

const CATEGORY_ICON: Record<string, { icon: IconKind; color: string }> = {
  数据分析与研究: { icon: 'data', color: 'blue' },
  '数据分析与 BI': { icon: 'data', color: 'blue' },
  内容写作与营销: { icon: 'content', color: 'purple' },
  内容写作与翻译: { icon: 'content', color: 'purple' },
  办公效率与自动化: { icon: 'office', color: 'green' },
  开发与编程: { icon: 'dev', color: 'orange' },
  开发工具: { icon: 'dev', color: 'orange' },
  开发工具与工程: { icon: 'dev', color: 'orange' },
  设计与多媒体: { icon: 'image', color: 'pink' },
  客服与销售运营: { icon: 'marketing', color: 'teal' },
  营销与增长: { icon: 'marketing', color: 'teal' },
  运营与客服: { icon: 'marketing', color: 'teal' },
  '销售与 CRM': { icon: 'marketing', color: 'teal' },
  'AI 模型与多模态': { icon: 'data', color: 'blue' },
  教育与知识管理: { icon: 'content', color: 'green' },
  行业场景解决方案: { icon: 'marketing', color: 'teal' },
  工作流模板与编排: { icon: 'office', color: 'green' },
  其他: { icon: 'generic', color: 'blue' },
  默认: { icon: 'generic', color: 'blue' },
};

function normalizeSortBy(value: string | null): SortField {
  if (value === 'downloadCount' || value === 'viewCount' || value === 'createdAt') {
    return value;
  }
  return 'createdAt';
}

function normalizeSortOrder(value: string | null): SortOrder {
  if (value === 'asc' || value === 'desc') {
    return value;
  }
  return 'desc';
}

function formatRating(rating?: number | null) {
  return typeof rating === 'number' ? rating.toFixed(1) : '暂无';
}

function pickCategory(skill: Skill): string {
  if (skill.category?.name) {
    return skill.category.name;
  }
  if (skill.tags?.length) {
    return skill.tags[0];
  }
  return '其他';
}

function pickIconMeta(category: string) {
  return CATEGORY_ICON[category] ?? CATEGORY_ICON.默认;
}

function SkillsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null);

  const [keyword, setKeyword] = useState(searchParams.get('keyword') || '');
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') || ALL_CATEGORY_ID);
  const [mineOnly, setMineOnly] = useState(searchParams.get('mine') === '1');
  const [sortBy, setSortBy] = useState<SortField>(normalizeSortBy(searchParams.get('sortBy')));
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    normalizeSortOrder(searchParams.get('sortOrder'))
  );

  useEffect(() => {
    setKeyword(searchParams.get('keyword') || '');
    setCategoryId(searchParams.get('categoryId') || ALL_CATEGORY_ID);
    setMineOnly(searchParams.get('mine') === '1');
    setSortBy(normalizeSortBy(searchParams.get('sortBy')));
    setSortOrder(normalizeSortOrder(searchParams.get('sortOrder')));
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;

    async function fetchCategories() {
      const fallbackCategories = getFallbackSkillCategories();
      try {
        const response = await fetch('/api/categories');
        const result = await response.json();
        if (!mounted) return;

        const serverCategories =
          result?.success && Array.isArray(result.data)
            ? (result.data as SkillCategory[])
            : [];
        setCategories(serverCategories.length > 0 ? serverCategories : fallbackCategories);
      } catch (error) {
        console.error('分类加载失败:', error);
        if (mounted) {
          setCategories(fallbackCategories);
        }
      }
    }

    fetchCategories();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function fetchSkills(silent: boolean) {
      try {
        const cacheKey = `${SKILLS_PAGE_CACHE_KEY}:${mineOnly ? 'mine' : 'all'}:${categoryId}:${sortBy}:${sortOrder}:${keyword
          .trim()
          .toLowerCase()}`;

        if (!silent) {
          if (typeof window !== 'undefined') {
            const cachedSkillsRaw = window.localStorage.getItem(cacheKey);
            if (cachedSkillsRaw) {
              try {
                const cachedSkills = JSON.parse(cachedSkillsRaw);
                if (Array.isArray(cachedSkills) && cachedSkills.length > 0 && mounted) {
                  setSkills(cachedSkills as Skill[]);
                  setTotal(cachedSkills.length);
                }
              } catch (error) {
                console.error('读取技能库缓存失败:', error);
              }
            }
          }
          setLoading(true);
        }

        if (mineOnly && status !== 'loading' && !session?.user?.id) {
          if (mounted) {
            setSkills([]);
            setTotal(0);
          }
          return;
        }

        const params = new URLSearchParams({
          sortBy,
          sortOrder,
          pageSize: '24',
        });

        if (keyword.trim()) {
          params.set('keyword', keyword.trim());
        }
        if (categoryId !== ALL_CATEGORY_ID) {
          params.set('categoryId', categoryId);
        }
        if (mineOnly && session?.user?.id) {
          params.set('authorId', session.user.id);
        }

        const response = await fetch(`/api/skills?${params.toString()}`, {
          cache: 'no-store',
        });
        const result = await response.json();

        if (!mounted || !result.success) {
          return;
        }

        setSkills(result.data.items || []);
        setTotal(result.data.total || 0);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(cacheKey, JSON.stringify(result.data.items || []));
        }
      } catch (error) {
        console.error('加载 Skill 列表失败:', error);
      } finally {
        if (mounted && !silent) {
          setLoading(false);
        }
      }
    }

    fetchSkills(false);
    const timer = setInterval(() => fetchSkills(true), 15000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [categoryId, keyword, mineOnly, session?.user?.id, sortBy, sortOrder, status]);

  const sortLabel = useMemo(() => {
    if (sortBy === 'viewCount') return '浏览量';
    if (sortBy === 'downloadCount') return '下载量';
    return '上传时间';
  }, [sortBy]);

  function handleApplyFilters(event: React.FormEvent) {
    event.preventDefault();
    trackEvent({
      eventName: 'skill_search',
      module: 'skills-page',
      action: 'submit',
      categoryId: categoryId === ALL_CATEGORY_ID ? undefined : categoryId,
      metadata: {
        keyword,
        mineOnly,
        sortBy,
        sortOrder,
      },
    });

    const params = new URLSearchParams();
    if (keyword.trim()) params.set('keyword', keyword.trim());
    if (categoryId !== ALL_CATEGORY_ID) params.set('categoryId', categoryId);
    if (mineOnly) params.set('mine', '1');
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    router.push(`/skills?${params.toString()}`);
  }

  async function handleDeleteSkill(skill: Skill) {
    if (!window.confirm(`确认删除「${skill.title}」吗？删除后将不在列表中展示。`)) {
      return;
    }

    try {
      setDeletingSkillId(skill.id);
      const response = await fetch(`/api/skills/${skill.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '删除失败');
      }

      setSkills((prev) => prev.filter((item) => item.id !== skill.id));
      setTotal((prev) => Math.max(0, prev - 1));
      message.success('Skill 已删除');
    } catch (error: any) {
      console.error('删除 Skill 失败:', error);
      message.error(error.message || '删除失败');
    } finally {
      setDeletingSkillId(null);
    }
  }

  return (
    <div className="skills-page-shell">
      <section className="skills-page-hero">
        <h1>📚 技能库</h1>
        <p>
          {mineOnly ? '我的上传' : '实时收录'} {formatNumber(total)} 个 Skill，当前按 {sortLabel}
          {sortOrder === 'desc' ? '降序' : '升序'} 展示
        </p>
      </section>

      {mineOnly && status !== 'loading' && !session?.user ? (
        <div className="empty-block" style={{ marginBottom: 16 }}>
          请先登录后查看你上传的 Skill
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="download-btn"
              onClick={() => router.push('/login')}
            >
              去登录
            </button>
          </div>
        </div>
      ) : null}

      <form className="skills-toolbar" onSubmit={handleApplyFilters}>
        <input
          type="text"
          className="input skills-toolbar-input"
          placeholder="搜索 Skill 名称、简介或标签..."
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <select
          className="input skills-toolbar-select"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value={ALL_CATEGORY_ID}>全部分类</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          className="input skills-toolbar-select"
          value={sortBy}
          onChange={(event) => setSortBy(normalizeSortBy(event.target.value))}
        >
          <option value="createdAt">上传时间</option>
          <option value="viewCount">浏览量</option>
          <option value="downloadCount">下载量</option>
        </select>
        <select
          className="input skills-toolbar-select"
          value={sortOrder}
          onChange={(event) => setSortOrder(normalizeSortOrder(event.target.value))}
        >
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
        <button type="submit" className="download-btn skills-toolbar-submit">
          应用筛选
        </button>
        <button
          type="button"
          className={`skills-mine-toggle ${mineOnly ? 'active' : ''}`}
          onClick={() => setMineOnly((prev) => !prev)}
        >
          {mineOnly ? '查看全部' : '仅看我上传'}
        </button>
      </form>

      {loading ? (
        <div className="skills-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skill-card skeleton-card">
              <div className="skeleton" style={{ width: 64, height: 64, borderRadius: 12 }} />
              <div className="skeleton" style={{ width: '60%', height: 20, marginTop: 12 }} />
              <div className="skeleton" style={{ width: '100%', height: 56, marginTop: 12 }} />
            </div>
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="empty-block">当前筛选条件下暂无 Skill，换个关键词试试</div>
      ) : (
        <div className="skills-grid">
          {skills.map((skill) => {
            const category = pickCategory(skill);
            const { icon, color } = pickIconMeta(category);
            const isExternalLinkSkill =
              skill.fileType?.toLowerCase() === 'link' || /^https?:\/\//i.test(skill.fileName);

            const canManage = canManageSkill(
              session?.user?.email || null,
              session?.user?.id || null,
              skill.authorId
            );

            return (
              <article key={skill.id} className="skill-card skill-card-article">
                <Link
                  href={`/skills/${skill.id}`}
                  className="skill-card-link-body"
                  onClick={() =>
                    trackEvent({
                      eventName: 'skill_detail_open',
                      module: 'skills-page',
                      action: 'click',
                      skillId: skill.id,
                    })
                  }
                >
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
                <p className="skill-desc">{skill.summary || skill.description}</p>

                <div className="skill-list-meta">
                  <span>📥 {formatNumber(skill.downloadCount)}</span>
                  <span>👁 {formatNumber(skill.viewCount)}</span>
                  <span>⭐ {formatRating(skill.ratingAvg)}</span>
                  <span>📝 {formatNumber(skill.ratingCount ?? skill._count?.comments ?? 0)}</span>
                  <span>{isExternalLinkSkill ? '🔗 外链' : `💾 ${formatFileSize(skill.fileSize)}`}</span>
                  <span>{formatTime(skill.createdAt)}</span>
                </div>
                </Link>

                {canManage ? (
                  <div className="skill-manage-row">
                    <Link href={`/skills/${skill.id}/edit`} className="skill-manage-btn">
                      修改
                    </Link>
                    <button
                      type="button"
                      className="skill-manage-btn danger"
                      disabled={deletingSkillId === skill.id}
                      onClick={() => void handleDeleteSkill(skill)}
                    >
                      {deletingSkillId === skill.id ? '删除中...' : '删除'}
                    </button>
                    {isSuperAdminEmail(session?.user?.email) ? (
                      <span className="skill-manage-tip">管理员权限</span>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SkillsPage() {
  return (
    <Suspense fallback={<div className="loading-page">加载中...</div>}>
      <SkillsContent />
    </Suspense>
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
