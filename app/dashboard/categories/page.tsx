'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { message } from 'antd';
import { DASHBOARD_OWNER_EMAIL, isDashboardOwnerEmail } from '@/lib/dashboard-access';
import ManagementCenterHeader from '@/components/management-center-header';
import { formatNumber } from '@/lib/utils';
import type { SkillCategory } from '@/types';

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

function toCategoryFormState(category: ManagedCategory): CategoryFormState {
  return {
    name: category.name || '',
    slug: category.slug || '',
    icon: category.icon || '',
    sortOrder: typeof category.sortOrder === 'number' ? String(category.sortOrder) : '',
  };
}

export default function CategoryManagementCenterPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isDashboardOwner = isDashboardOwnerEmail(session?.user?.email);

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
  const [deleteTargetByCategoryId, setDeleteTargetByCategoryId] = useState<Record<string, string>>(
    {}
  );
  const [draftCategoryBySkillId, setDraftCategoryBySkillId] = useState<Record<string, string>>({});

  const activeCategories = useMemo(
    () => managedCategories.filter((item) => item.status === 'active'),
    [managedCategories]
  );

  const inactiveCategories = useMemo(
    () => managedCategories.filter((item) => item.status !== 'active'),
    [managedCategories]
  );

  const totalMappedSkills = useMemo(
    () => managedCategories.reduce((sum, item) => sum + Number(item.skillCount || 0), 0),
    [managedCategories]
  );

  const filteredSkills = useMemo(() => {
    const keyword = skillKeyword.trim().toLowerCase();
    if (!keyword) return skillsForMove;
    return skillsForMove.filter((skill) => skill.title.toLowerCase().includes(keyword));
  }, [skillKeyword, skillsForMove]);

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

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
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

      const nextCategoryMeta = activeCategories.find((item) => item.id === targetCategoryId);
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
    <div className="dashboard-page management-center-page">
      <ManagementCenterHeader
        sectionTitle="分类管理中心"
        sectionDescription="维护分类体系，统一执行新增、重命名、删除迁移与 Skill 分类调整。"
        actions={
          <div className="dashboard-inline-actions">
            <span className="management-owner-tag">管理员：{DASHBOARD_OWNER_EMAIL}</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void reloadManagementData()}
              disabled={managementLoading}
            >
              {managementLoading ? '刷新中...' : '刷新数据'}
            </button>
          </div>
        }
      />

      <section className="dashboard-card management-summary-grid">
        <div className="management-summary-item">
          <span>启用分类</span>
          <strong>{formatNumber(activeCategories.length)}</strong>
        </div>
        <div className="management-summary-item">
          <span>已停用分类</span>
          <strong>{formatNumber(inactiveCategories.length)}</strong>
        </div>
        <div className="management-summary-item">
          <span>分类覆盖 Skill</span>
          <strong>{formatNumber(totalMappedSkills)}</strong>
        </div>
        <div className="management-summary-item">
          <span>可迁移 Skill</span>
          <strong>{formatNumber(skillsForMove.length)}</strong>
        </div>
      </section>

      <section className="dashboard-card dashboard-manage-card management-surface">
        <div className="dashboard-manage-header">
          <h3>分类清单</h3>
          <span className="dashboard-manage-tip">新增、修改、删除并设置删除时迁移目标</span>
        </div>

        <form className="dashboard-category-form" onSubmit={handleCreateCategory}>
          <input
            className="input"
            placeholder="分类名称（必填）"
            value={newCategoryForm.name}
            onChange={(e) => setNewCategoryForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <input
            className="input"
            placeholder="slug（可选，如：automation）"
            value={newCategoryForm.slug}
            onChange={(e) => setNewCategoryForm((prev) => ({ ...prev, slug: e.target.value }))}
          />
          <input
            className="input"
            placeholder="图标（可选）"
            value={newCategoryForm.icon}
            onChange={(e) => setNewCategoryForm((prev) => ({ ...prev, icon: e.target.value }))}
          />
          <input
            className="input"
            type="number"
            min={0}
            placeholder="排序（可选）"
            value={newCategoryForm.sortOrder}
            onChange={(e) => setNewCategoryForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
          />
          <button type="submit" className="btn btn-primary" disabled={categoryCreating}>
            {categoryCreating ? '创建中...' : '新增分类'}
          </button>
        </form>

        {managementLoading ? (
          <div className="loading-page">分类管理数据加载中...</div>
        ) : (
          <div className="table-wrap">
            <table className="dashboard-table management-table">
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
                  const activeMoveTargets = activeCategories.filter((item) => item.id !== category.id);
                  const canDelete = category.status === 'active' && activeCategories.length > 1;

                  return (
                    <tr key={category.id}>
                      <td>
                        {isEditing ? (
                          <input
                            className="input"
                            value={editingCategoryForm.name}
                            onChange={(e) =>
                              setEditingCategoryForm((prev) => ({ ...prev, name: e.target.value }))
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
                              setEditingCategoryForm((prev) => ({ ...prev, slug: e.target.value }))
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
                      <td>{category.status === 'active' ? '启用' : '已停用'}</td>
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

      <section className="dashboard-card dashboard-manage-card management-surface">
        <div className="dashboard-manage-header">
          <h3>Skill 分类迁移</h3>
          <span className="dashboard-manage-tip">按 Skill 名称搜索并逐条调整分类</span>
        </div>
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
            <table className="dashboard-table management-table">
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
                  const targetCategoryId = draftCategoryBySkillId[skill.id] || currentCategoryId;
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
