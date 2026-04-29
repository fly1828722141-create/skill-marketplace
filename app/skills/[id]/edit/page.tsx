'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { message } from 'antd';
import { useSession } from 'next-auth/react';
import { Skill, SkillCategory } from '@/types';
import { canManageSkill } from '@/lib/dashboard-access';
import { getFallbackSkillCategories } from '@/lib/category-presets';

interface EditFormState {
  title: string;
  summary: string;
  description: string;
  categoryId: string;
  tagsInput: string;
}

export default function SkillEditPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditFormState>({
    title: '',
    summary: '',
    description: '',
    categoryId: '',
    tagsInput: '',
  });

  const skillId = params.id as string;
  const canManageCurrentSkill = useMemo(() => {
    if (!skill) return false;
    return canManageSkill(session?.user?.email || null, session?.user?.id || null, skill.authorId);
  }, [session?.user?.email, session?.user?.id, skill]);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        setLoading(true);
        const fallbackCategories = getFallbackSkillCategories();
        const [skillResponse, categoryResponse] = await Promise.all([
          fetch(`/api/skills/${skillId}?track=0`, { cache: 'no-store' }),
          fetch('/api/categories', { cache: 'no-store' }),
        ]);
        const [skillResult, categoryResult] = await Promise.all([
          skillResponse.json(),
          categoryResponse.json(),
        ]);

        if (!mounted) return;

        if (!skillResponse.ok || !skillResult.success) {
          throw new Error(skillResult.error || '加载 Skill 失败');
        }

        const loadedSkill = skillResult.data as Skill;
        setSkill(loadedSkill);
        setForm({
          title: loadedSkill.title || '',
          summary: loadedSkill.summary || '',
          description: loadedSkill.description || '',
          categoryId: loadedSkill.categoryId || loadedSkill.category?.id || '',
          tagsInput: loadedSkill.tags?.join(', ') || '',
        });

        const serverCategories =
          categoryResult?.success && Array.isArray(categoryResult.data)
            ? (categoryResult.data as SkillCategory[])
            : [];
        setCategories(serverCategories.length > 0 ? serverCategories : fallbackCategories);
      } catch (error: any) {
        console.error('加载编辑页面失败:', error);
        message.error(error.message || '加载失败');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      mounted = false;
    };
  }, [skillId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!skill) return;

    if (!canManageCurrentSkill) {
      message.error('你没有权限修改该 Skill');
      return;
    }

    const normalizedTags = form.tagsInput
      .split(/[，,]/)
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (!form.title.trim() || !form.summary.trim() || !form.description.trim()) {
      message.warning('标题、功能简介、详细描述不能为空');
      return;
    }

    if (form.summary.trim().length < 10) {
      message.warning('功能简介至少 10 个字');
      return;
    }

    if (!form.categoryId) {
      message.warning('请选择 Skill 分类');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/skills/${skill.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          summary: form.summary.trim(),
          description: form.description.trim(),
          categoryId: form.categoryId,
          tags: normalizedTags,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '保存失败');
      }

      message.success('Skill 已更新');
      router.push(`/skills/${skill.id}`);
    } catch (error: any) {
      console.error('保存 Skill 失败:', error);
      message.error(error.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading' || loading) {
    return <div className="loading-page">加载中...</div>;
  }

  if (!session?.user) {
    return (
      <div className="skills-page-shell">
        <div className="empty-block">
          请先登录后再编辑 Skill
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
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="skills-page-shell">
        <div className="empty-block">Skill 不存在或已被删除</div>
      </div>
    );
  }

  if (!canManageCurrentSkill) {
    return (
      <div className="skills-page-shell">
        <div className="empty-block">
          仅作者或管理员可编辑该 Skill
          <div style={{ marginTop: 12 }}>
            <Link href={`/skills/${skill.id}`} className="download-btn">
              返回详情
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="skills-page-shell">
      <section className="skills-page-hero">
        <h1>✏️ 编辑 Skill</h1>
        <p>你正在编辑：{skill.title}</p>
      </section>

      <form className="upload-form-card" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>标题</label>
          <input
            className="input"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
        </div>

        <div className="form-group">
          <label>功能简介</label>
          <textarea
            className="input textarea"
            rows={3}
            value={form.summary}
            onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
          />
        </div>

        <div className="form-group">
          <label>Skill 分类</label>
          <select
            className="input"
            value={form.categoryId}
            onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
          >
            <option value="">请选择分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>标签（逗号分隔）</label>
          <input
            className="input"
            value={form.tagsInput}
            onChange={(event) => setForm((prev) => ({ ...prev, tagsInput: event.target.value }))}
          />
        </div>

        <div className="form-group">
          <label>详细说明 / SKILL.md 内容</label>
          <textarea
            className="input textarea"
            rows={12}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </div>

        <div className="upload-form-actions">
          <button type="submit" className="btn btn-primary upload-submit-btn" disabled={saving}>
            {saving ? '保存中...' : '保存修改'}
          </button>
          <Link href={`/skills/${skill.id}`} className="btn btn-secondary upload-cancel-btn">
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
