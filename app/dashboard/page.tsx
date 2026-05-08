'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { message } from 'antd';
import {
  DASHBOARD_OWNER_EMAIL,
  isDashboardOwnerEmail,
} from '@/lib/dashboard-access';
import { formatNumber } from '@/lib/utils';
import type { SkillCategory } from '@/types';

interface DashboardData {
  range: {
    days: number;
    startAt: string;
    endAt: string;
  };
  overview: {
    totalEvents: number;
    uniqueVisitors: number;
    pageViews: number;
    logins: number;
    downloads: number;
    uploads: number;
    reviewSubmits: number;
    reviewLikes: number;
  };
  site: {
    totalSkills: number;
    totalUsers: number;
    totalDownloads: number;
    totalViews: number;
  };
  topEvents: Array<{
    eventName: string;
    count: number;
  }>;
  moduleUsage: Array<{
    module: string;
    count: number;
  }>;
  topCategories: Array<{
    categoryId: string | null;
    categoryName: string;
    count: number;
  }>;
  categoryTrends: Array<{
    categoryId: string;
    categoryName: string;
    points: Array<{
      date: string;
      count: number;
    }>;
  }>;
  activeUsers: Array<{
    userId: string;
    name: string;
    department?: string | null;
    eventCount: number;
  }>;
  trends: Array<{
    date: string;
    events: number;
    pageViews: number;
    downloads: number;
  }>;
  topSkills: Array<{
    id: string;
    title: string;
    downloadCount: number;
    viewCount: number;
    category?: {
      id: string;
      name: string;
    } | null;
  }>;
}

interface ManagedCategory extends SkillCategory {
  status: 'active' | 'inactive' | string;
  skillCount: number;
}

interface SkillForCategoryMove {
  id: string;
  title: string;
  categoryId?: string | null;
  category?: {
    id: string;
    name: string;
  } | null;
}

interface CategoryFormState {
  name: string;
  slug: string;
  icon: string;
  sortOrder: string;
}

const EVENT_NAME_LABELS: Record<string, string> = {
  page_view: '页面访问',
  user_sign_in: '用户登录',
  skill_detail_open: '打开技能详情',
  skill_upload_success: '技能上传成功',
  skill_download_click: '技能下载点击',
  skill_search: '技能搜索',
  category_click: '分类点击',
  review_submit_success: '评价提交成功',
  review_like_toggle: '评价点赞切换',
};

const MODULE_LABELS: Record<string, string> = {
  navigation: '导航栏',
  home: '首页',
  upload: '上传页',
  review: '评价区',
  auth: '登录模块',
  'skills-page': '技能列表页',
  'skill-detail': '技能详情页',
  dashboard: '数据看板',
  unknown: '未知模块',
};

function toZhEventName(eventName: string) {
  return EVENT_NAME_LABELS[eventName] || '其他事件';
}

function toZhModuleName(moduleName: string) {
  return MODULE_LABELS[moduleName] || '其他模块';
}

function toCategoryFormState(category: ManagedCategory): CategoryFormState {
  return {
    name: category.name || '',
    slug: category.slug || '',
    icon: category.icon || '',
    sortOrder:
      typeof category.sortOrder === 'number' ? String(category.sortOrder) : '',
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isDashboardOwner = isDashboardOwnerEmail(session?.user?.email);

  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  const [managedCategories, setManagedCategories] = useState<ManagedCategory[]>([]);
  const [skillsForMove, setSkillsForMove] = useState<SkillForCategoryMove[]>([]);
  const [managementLoading, setManagementLoading] = useState(true);
  const [categoryCreating, setCategoryCreating] = useState(false);
  const [categoryEditingId, setCategoryEditingId] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryDeletingId, setCategoryDeletingId] = useState('');
  const [movingSkillId, setMovingSkillId] = useState('');
  const [skillKeyword, setSkillKeyword] = useState('');
  const [newCategoryForm, setNewCategoryForm] = useState<CategoryFormState>({
    name: '',
    slug: '',
    icon: '',
    sortOrder: '',
  });
  const [editingCategoryForm, setEditingCategoryForm] = useState<CategoryFormState>({
    name: '',
    slug: '',
    icon: '',
    sortOrder: '',
  });
  const [deleteTargetByCategoryId, setDeleteTargetByCategoryId] = useState<
    Record<string, string>
  >({});
  const [draftCategoryBySkillId, setDraftCategoryBySkillId] = useState<
    Record<string, string>
  >({});

  const activeCategories = useMemo(
    () => managedCategories.filter((item) => item.status === 'active'),
    [managedCategories]
  );

  const filteredSkills = useMemo(() => {
    const keyword = skillKeyword.trim().toLowerCase();
    if (!keyword) {
      return skillsForMove;
    }

    return skillsForMove.filter((skill) =>
      skill.title.toLowerCase().includes(keyword)
    );
  }, [skillKeyword, skillsForMove]);

  useEffect(() => {
    let mounted = true;

    async function fetchDashboard() {
      try {
        setLoading(true);
        const response = await fetch(`/api/analytics/dashboard?days=${days}`, {
          cache: 'no-store',
        });
        const result = await response.json();

        if (!mounted) return;

        if (!response.ok || !result.success) {
          throw new Error(result.error || '加载看板失败');
        }

        setData(result.data);
      } catch (error: any) {
        console.error('加载看板失败:', error);
        message.error(error.message || '加载看板失败');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    if (isDashboardOwner) {
      void fetchDashboard();
    }

    const timer = setInterval(() => {
      if (isDashboardOwner) {
        void fetchDashboard();
      }
    }, 30000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [days, isDashboardOwner]);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || !isDashboardOwner) {
      router.replace('/');
    }
  }, [isDashboardOwner, router, session?.user, status]);

  useEffect(() => {
    if (!isDashboardOwner) return;
    void reloadManagementData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDashboardOwner]);

  async function fetchManagedCategories(): Promise<ManagedCategory[]> {
    const response = await fetch('/api/categories?includeInactive=1', {
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok || !result?.success || !Array.isArray(result.data)) {
      throw new Error(result?.error || '加载分类管理数据失败');
    }

    return result.data as ManagedCategory[];
  }

  async function fetchAllSkillsForManagement(): Promise<SkillForCategoryMove[]> {
    const pageSize = 100;
    let page = 1;
    let totalPages = 1;
    const collected: SkillForCategoryMove[] = [];

    while (page <= totalPages && page <= 30) {
      const response = await fetch(
        `/api/skills?page=${page}&pageSize=${pageSize}&sortBy=createdAt&sortOrder=desc`,
        { cache: 'no-store' }
      );
      const result = await response.json();

      if (!response.ok || !result?.success || !Array.isArray(result?.data?.items)) {
        throw new Error(result?.error || '加载 Skill 列表失败');
      }

      const pageItems = result.data.items as SkillForCategoryMove[];
      collected.push(...pageItems);

      const parsedTotalPages = Number(result?.data?.totalPages);
      totalPages =
        Number.isFinite(parsedTotalPages) && parsedTotalPages > 0
          ? Math.floor(parsedTotalPages)
          : 1;
      page += 1;
    }

    return collected;
  }

  async function reloadManagementData() {
    try {
      setManagementLoading(true);
      const [categories, skills] = await Promise.all([
        fetchManagedCategories(),
        fetchAllSkillsForManagement(),
      ]);

      setManagedCategories(categories);
      setSkillsForMove(skills);

      const nextDraft: Record<string, string> = {};
      skills.forEach((skill) => {
        if (skill.categoryId) {
          nextDraft[skill.id] = skill.categoryId;
        }
      });
      setDraftCategoryBySkillId(nextDraft);

      const nextDeleteTargets: Record<string, string> = {};
      categories.forEach((category) => {
        if (category.skillCount > 0) {
          const fallbackTarget = categories.find(
            (item) => item.status === 'active' && item.id !== category.id
          );
          if (fallbackTarget) {
            nextDeleteTargets[category.id] = fallbackTarget.id;
          }
        }
      });
      setDeleteTargetByCategoryId(nextDeleteTargets);
    } catch (error: any) {
      console.error('加载分类管理数据失败:', error);
      message.error(error.message || '加载分类管理数据失败');
    } finally {
      setManagementLoading(false);
    }
  }

  async function handleCreateCategory(event: React.FormEvent) {
    event.preventDefault();
    const name = newCategoryForm.name.trim();
    if (!name) {
      message.warning('请先填写分类名称');
      return;
    }

    setCategoryCreating(true);
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug: newCategoryForm.slug.trim() || undefined,
          icon: newCategoryForm.icon.trim() || undefined,
          sortOrder:
            newCategoryForm.sortOrder.trim() === ''
              ? undefined
              : Number(newCategoryForm.sortOrder),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '创建分类失败');
      }

      message.success('分类创建成功');
      setNewCategoryForm({
        name: '',
        slug: '',
        icon: '',
        sortOrder: '',
      });
      await reloadManagementData();
    } catch (error: any) {
      console.error('创建分类失败:', error);
      message.error(error.message || '创建分类失败');
    } finally {
      setCategoryCreating(false);
    }
  }

  function startEditingCategory(category: ManagedCategory) {
    setCategoryEditingId(category.id);
    setEditingCategoryForm(toCategoryFormState(category));
  }

  function cancelEditingCategory() {
    setCategoryEditingId('');
    setEditingCategoryForm({
      name: '',
      slug: '',
      icon: '',
      sortOrder: '',
    });
  }

  async function saveEditingCategory(categoryId: string) {
    const name = editingCategoryForm.name.trim();
    if (!name) {
      message.warning('分类名称不能为空');
      return;
    }

    setCategorySaving(true);
    try {
      const response = await fetch(`/api/categories/${encodeURIComponent(categoryId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug: editingCategoryForm.slug.trim(),
          icon: editingCategoryForm.icon.trim() || null,
          sortOrder:
            editingCategoryForm.sortOrder.trim() === ''
              ? undefined
              : Number(editingCategoryForm.sortOrder),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '分类更新失败');
      }

      message.success('分类更新成功');
      cancelEditingCategory();
      await reloadManagementData();
    } catch (error: any) {
      console.error('分类更新失败:', error);
      message.error(error.message || '分类更新失败');
    } finally {
      setCategorySaving(false);
    }
  }

  async function deleteCategory(category: ManagedCategory) {
    if (category.status !== 'active') {
      message.warning('该分类已删除');
      return;
    }

    const targetCategoryId = deleteTargetByCategoryId[category.id] || '';
    if (category.skillCount > 0 && !targetCategoryId) {
      message.warning('请先选择迁移目标分类');
      return;
    }

    const confirmText =
      category.skillCount > 0
        ? `确认删除分类「${category.name}」并迁移 ${category.skillCount} 个 Skill 吗？`
        : `确认删除分类「${category.name}」吗？`;
    if (!window.confirm(confirmText)) {
      return;
    }

    setCategoryDeletingId(category.id);
    try {
      const query = new URLSearchParams();
      if (targetCategoryId) {
        query.set('targetCategoryId', targetCategoryId);
      }

      const querySuffix = query.toString() ? `?${query.toString()}` : '';
      const response = await fetch(
        `/api/categories/${encodeURIComponent(category.id)}${querySuffix}`,
        {
          method: 'DELETE',
        }
      );
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '删除分类失败');
      }

      message.success(result?.message || '分类已删除');
      await reloadManagementData();
    } catch (error: any) {
      console.error('删除分类失败:', error);
      message.error(error.message || '删除分类失败');
    } finally {
      setCategoryDeletingId('');
    }
  }

  async function moveSkillCategory(skill: SkillForCategoryMove) {
    const targetCategoryId = draftCategoryBySkillId[skill.id];
    if (!targetCategoryId || targetCategoryId === (skill.categoryId || '')) {
      message.info('分类未变化，无需保存');
      return;
    }

    setMovingSkillId(skill.id);
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(skill.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: targetCategoryId,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Skill 分类更新失败');
      }

      const nextCategoryMeta = activeCategories.find(
        (item) => item.id === targetCategoryId
      );
      setSkillsForMove((prev) =>
        prev.map((item) =>
          item.id === skill.id
            ? {
                ...item,
                categoryId: targetCategoryId,
                category: nextCategoryMeta
                  ? { id: nextCategoryMeta.id, name: nextCategoryMeta.name }
                  : item.category,
              }
            : item
        )
      );
      message.success('Skill 分类更新成功');
      const categories = await fetchManagedCategories();
      setManagedCategories(categories);
    } catch (error: any) {
      console.error('Skill 分类更新失败:', error);
      message.error(error.message || 'Skill 分类更新失败');
    } finally {
      setMovingSkillId('');
    }
  }

  if (status === 'loading') {
    return <div className="loading-page">加载中...</div>;
  }

  if (!session?.user || !isDashboardOwner) {
    return <div className="loading-page">页面跳转中...</div>;
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>数据看板</h1>
        <div className="dashboard-actions">
          <Link href="/dashboard/ingest" className="btn btn-secondary">
            收录审核台
          </Link>
          <label htmlFor="days">统计窗口</label>
          <select
            id="days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="input"
            style={{ maxWidth: 140 }}
          >
            <option value={1}>最近 1 天</option>
            <option value={7}>最近 7 天</option>
            <option value={30}>最近 30 天</option>
            <option value={90}>最近 90 天</option>
          </select>
        </div>
      </div>

      {loading || !data ? (
        <div className="loading-page">看板加载中...</div>
      ) : (
        <>
          <div className="dashboard-grid">
            <StatCard title="总事件数" value={data.overview.totalEvents} />
            <StatCard title="独立访客" value={data.overview.uniqueVisitors} />
            <StatCard title="页面访问" value={data.overview.pageViews} />
            <StatCard title="登录次数" value={data.overview.logins} />
            <StatCard title="技能上传" value={data.overview.uploads} />
            <StatCard title="下载点击" value={data.overview.downloads} />
            <StatCard title="评价提交" value={data.overview.reviewSubmits} />
            <StatCard title="评价点赞" value={data.overview.reviewLikes} />
          </div>

          <div className="dashboard-grid">
            <StatCard title="总技能数" value={data.site.totalSkills} />
            <StatCard title="总用户数" value={data.site.totalUsers} />
            <StatCard title="累计下载" value={data.site.totalDownloads} />
            <StatCard title="累计浏览" value={data.site.totalViews} />
          </div>

          <section className="dashboard-card">
            <h3>热门事件 前10</h3>
            <SimpleTable
              headers={['事件名', '次数']}
              rows={data.topEvents.map((item) => [
                toZhEventName(item.eventName),
                formatNumber(item.count),
              ])}
            />
          </section>

          <section className="dashboard-card">
            <h3>模块使用 前10</h3>
            <SimpleTable
              headers={['模块', '次数']}
              rows={data.moduleUsage.map((item) => [
                toZhModuleName(item.module),
                formatNumber(item.count),
              ])}
            />
          </section>

          <section className="dashboard-card">
            <h3>分类点击 前10</h3>
            <SimpleTable
              headers={['分类', '次数']}
              rows={data.topCategories.map((item) => [
                item.categoryName,
                formatNumber(item.count),
              ])}
            />
          </section>

          <section className="dashboard-card">
            <h3>活跃用户 前10</h3>
            <SimpleTable
              headers={['用户', '部门', '事件次数']}
              rows={data.activeUsers.map((item) => [
                item.name,
                item.department || '-',
                formatNumber(item.eventCount),
              ])}
            />
          </section>

          <section className="dashboard-card">
            <h3>分类趋势 前5</h3>
            <SimpleTable
              headers={['分类', '窗口总点击', '近 7 天']}
              rows={data.categoryTrends.map((item) => {
                const total = item.points.reduce((sum, point) => sum + point.count, 0);
                const last7 = item.points
                  .slice(-7)
                  .reduce((sum, point) => sum + point.count, 0);
                return [item.categoryName, formatNumber(total), formatNumber(last7)];
              })}
            />
          </section>

          <section className="dashboard-card">
            <h3>下载榜单 前5</h3>
            <SimpleTable
              headers={['技能名称', '分类', '下载', '浏览']}
              rows={data.topSkills.map((item) => [
                item.title,
                item.category?.name || '未分类',
                formatNumber(item.downloadCount),
                formatNumber(item.viewCount),
              ])}
            />
          </section>
        </>
      )}

      <section className="dashboard-card dashboard-manage-card">
        <div className="dashboard-manage-header">
          <h3>分类管理</h3>
          <div className="dashboard-manage-actions">
            <span>管理员：{DASHBOARD_OWNER_EMAIL}</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void reloadManagementData()}
              disabled={managementLoading}
            >
              {managementLoading ? '刷新中...' : '刷新'}
            </button>
          </div>
        </div>
        <p className="dashboard-manage-tip">
          支持新增、修改、删除分类；删除分类时可将该分类下所有 Skill 迁移到目标分类。
        </p>

        <form className="dashboard-category-form" onSubmit={handleCreateCategory}>
          <input
            className="input"
            placeholder="分类名称（必填）"
            value={newCategoryForm.name}
            onChange={(e) =>
              setNewCategoryForm((prev) => ({ ...prev, name: e.target.value }))
            }
            required
          />
          <input
            className="input"
            placeholder="slug（可选，如：automation）"
            value={newCategoryForm.slug}
            onChange={(e) =>
              setNewCategoryForm((prev) => ({ ...prev, slug: e.target.value }))
            }
          />
          <input
            className="input"
            placeholder="图标（可选）"
            value={newCategoryForm.icon}
            onChange={(e) =>
              setNewCategoryForm((prev) => ({ ...prev, icon: e.target.value }))
            }
          />
          <input
            className="input"
            type="number"
            min={0}
            placeholder="排序（可选）"
            value={newCategoryForm.sortOrder}
            onChange={(e) =>
              setNewCategoryForm((prev) => ({ ...prev, sortOrder: e.target.value }))
            }
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={categoryCreating}
          >
            {categoryCreating ? '创建中...' : '新增分类'}
          </button>
        </form>

        {managementLoading ? (
          <div className="loading-page">分类管理数据加载中...</div>
        ) : (
          <div className="table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>分类名称</th>
                  <th>Slug</th>
                  <th>排序</th>
                  <th>状态</th>
                  <th>Skill 数</th>
                  <th>迁移目标（删除时）</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {managedCategories.map((category) => {
                  const isEditing = categoryEditingId === category.id;
                  const activeMoveTargets = activeCategories.filter(
                    (item) => item.id !== category.id
                  );
                  const canDelete =
                    category.status === 'active' && activeCategories.length > 1;

                  return (
                    <tr key={category.id}>
                      <td>
                        {isEditing ? (
                          <input
                            className="input"
                            value={editingCategoryForm.name}
                            onChange={(e) =>
                              setEditingCategoryForm((prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          category.name
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="input"
                            value={editingCategoryForm.slug}
                            onChange={(e) =>
                              setEditingCategoryForm((prev) => ({
                                ...prev,
                                slug: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          category.slug
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={editingCategoryForm.sortOrder}
                            onChange={(e) =>
                              setEditingCategoryForm((prev) => ({
                                ...prev,
                                sortOrder: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          String(category.sortOrder ?? 0)
                        )}
                      </td>
                      <td>{category.status === 'active' ? '启用' : '已删除'}</td>
                      <td>{formatNumber(category.skillCount || 0)}</td>
                      <td>
                        {category.skillCount > 0 && canDelete ? (
                          <select
                            className="input"
                            value={deleteTargetByCategoryId[category.id] || ''}
                            onChange={(e) =>
                              setDeleteTargetByCategoryId((prev) => ({
                                ...prev,
                                [category.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">请选择迁移目标</option>
                            {activeMoveTargets.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <div className="dashboard-inline-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => void saveEditingCategory(category.id)}
                                disabled={categorySaving}
                              >
                                {categorySaving ? '保存中...' : '保存'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={cancelEditingCategory}
                                disabled={categorySaving}
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => startEditingCategory(category)}
                                disabled={categoryDeletingId === category.id}
                              >
                                修改
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => void deleteCategory(category)}
                                disabled={!canDelete || categoryDeletingId === category.id}
                              >
                                {categoryDeletingId === category.id ? '删除中...' : '删除'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-card dashboard-manage-card">
        <h3>Skill 分类迁移</h3>
        <p className="dashboard-manage-tip">
          可按 Skill 名称搜索并逐条调整分类。保存后立即生效。
        </p>
        <div className="dashboard-skill-filter">
          <input
            className="input"
            placeholder="搜索 Skill 名称..."
            value={skillKeyword}
            onChange={(e) => setSkillKeyword(e.target.value)}
          />
        </div>

        {managementLoading ? (
          <div className="loading-page">Skill 列表加载中...</div>
        ) : filteredSkills.length === 0 ? (
          <div className="empty-state">未匹配到 Skill</div>
        ) : (
          <div className="table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>当前分类</th>
                  <th>目标分类</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredSkills.map((skill) => {
                  const currentCategoryId = skill.categoryId || '';
                  const targetCategoryId =
                    draftCategoryBySkillId[skill.id] || currentCategoryId;
                  const changed =
                    Boolean(targetCategoryId) && targetCategoryId !== currentCategoryId;

                  return (
                    <tr key={skill.id}>
                      <td>{skill.title}</td>
                      <td>{skill.category?.name || '未分类'}</td>
                      <td>
                        <select
                          className="input"
                          value={targetCategoryId}
                          onChange={(e) =>
                            setDraftCategoryBySkillId((prev) => ({
                              ...prev,
                              [skill.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">请选择分类</option>
                          {activeCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => void moveSkillCategory(skill)}
                          disabled={!changed || movingSkillId === skill.id}
                        >
                          {movingSkillId === skill.id ? '保存中...' : '保存分类'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="dashboard-card stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{formatNumber(value)}</div>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  if (rows.length === 0) {
    return <div className="empty-state">暂无数据</div>;
  }

  return (
    <div className="table-wrap">
      <table className="dashboard-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((column, colIndex) => (
                <td key={colIndex}>{column}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
