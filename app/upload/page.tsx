/**
 * 上传页面
 *
 * 支持：
 * 1) 链接发布
 * 2) 文件发布（生成安装命令）
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { message } from 'antd';
import { useSession } from 'next-auth/react';
import { SkillCategory } from '@/types';
import { getFallbackSkillCategories } from '@/lib/category-presets';
import {
  SKILL_UPLOAD_ACCEPT,
  SKILL_UPLOAD_EXTENSIONS_TEXT,
  isSupportedSkillFile,
} from '@/lib/skill-upload-format';

type UploadSourceMode = 'link' | 'github-package';

export default function UploadPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [sourceMode, setSourceMode] = useState<UploadSourceMode>('link');
  const [externalUrl, setExternalUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [githubPackageUploadEnabled, setGithubPackageUploadEnabled] = useState(false);

  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    categoryId: '',
    description: '',
    tags: '',
  });

  useEffect(() => {
    let mounted = true;

    async function fetchCategories() {
      const fallbackCategories = getFallbackSkillCategories();

      try {
        setCategoriesLoading(true);
        const response = await fetch('/api/categories');
        const result = await response.json();

        const serverItems =
          result?.success && Array.isArray(result.data)
            ? (result.data as SkillCategory[])
            : [];
        const items = serverItems.length > 0 ? serverItems : fallbackCategories;

        if (mounted) {
          setCategories(items);
          setFormData((prev) =>
            !prev.categoryId && items.length > 0
              ? { ...prev, categoryId: items[0].id }
              : prev
          );
        }

        if (serverItems.length === 0) {
          console.warn('分类接口返回为空，已自动使用默认分类');
        }
      } catch (error) {
        console.error('加载分类失败:', error);

        if (mounted) {
          setCategories(fallbackCategories);
          setFormData((prev) =>
            !prev.categoryId && fallbackCategories.length > 0
              ? { ...prev, categoryId: fallbackCategories[0].id }
              : prev
          );
        }
      } finally {
        if (mounted) {
          setCategoriesLoading(false);
        }
      }
    }

    async function fetchUploadConfig() {
      try {
        const response = await fetch('/api/upload/config');
        const result = await response.json();
        if (!mounted) return;

        const enabled = Boolean(result?.data?.githubPackageUploadEnabled);
        setGithubPackageUploadEnabled(enabled);
        if (enabled) {
          setSourceMode('github-package');
        } else {
          setSourceMode('link');
        }
      } catch (error) {
        console.warn('读取上传配置失败:', error);
        if (mounted) {
          setGithubPackageUploadEnabled(false);
          setSourceMode('link');
        }
      }
    }

    void fetchCategories();
    void fetchUploadConfig();

    return () => {
      mounted = false;
    };
  }, []);

  function triggerFilePicker() {
    if (loading) return;
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validation = validatePackageFile(selectedFile);
    if (!validation.valid) {
      message.error(validation.error || '文件验证失败');
      e.target.value = '';
      return;
    }

    setFile(selectedFile);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!session?.user) {
      message.warning('请先登录 Google 账号后再上传');
      router.push('/login');
      return;
    }

    if (!formData.title || !formData.summary || !formData.description || !formData.categoryId) {
      message.error('请完整填写标题、功能简介、分类和描述');
      return;
    }

    if (formData.summary.trim().length < 10) {
      message.error('功能简介至少 10 个字');
      return;
    }

    const normalizedExternalUrl = normalizeExternalLinkInput(externalUrl);
    if (sourceMode === 'link') {
      if (!normalizedExternalUrl) {
        message.error('请粘贴可访问的 Skill 链接');
        return;
      }

      if (!isHttpUrl(normalizedExternalUrl)) {
        message.error('链接格式不正确，仅支持 http/https 链接');
        return;
      }
    }

    if (sourceMode === 'github-package') {
      if (!githubPackageUploadEnabled) {
        message.error('当前未开启文件发布服务，请联系管理员配置');
        return;
      }
      if (!file) {
        message.error('请先选择待发布文件');
        return;
      }
    }

    setLoading(true);

    try {
      const uploadData = new FormData();
      uploadData.append('sourceMode', sourceMode);
      uploadData.append('title', formData.title);
      uploadData.append('summary', formData.summary);
      uploadData.append('categoryId', formData.categoryId);
      uploadData.append('description', formData.description);
      uploadData.append('tags', formData.tags);

      if (sourceMode === 'link') {
        uploadData.append('externalUrl', normalizedExternalUrl);
      } else if (file) {
        uploadData.append('file', file);
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: uploadData,
      });

      const result = await response.json().catch(() => null);

      if (response.ok && result?.success) {
        if (sourceMode === 'github-package') {
          message.success('文件已发布，详情页可复制安装命令');
        } else {
          message.success('链接发布成功！');
        }
        router.push(`/skills/${result.data.skill.id}`);
      } else {
        message.error(result?.error || '发布失败，请稍后重试');
      }
    } catch (error: any) {
      console.error('发布失败:', error);
      message.error('发布失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  const summaryLength = formData.summary.trim().length;
  const selectedCategoryName =
    categories.find((item) => item.id === formData.categoryId)?.name || '未选择';
  const normalizedExternalUrl = normalizeExternalLinkInput(externalUrl);

  const submitBlockedReason =
    !formData.title.trim()
      ? '请先填写标题'
      : summaryLength < 10
      ? '功能简介至少 10 个字'
      : categoriesLoading
      ? '分类加载中，请稍候...'
      : !formData.categoryId
      ? '请先选择 Skill 类型'
      : !formData.description.trim()
      ? '请先填写描述'
      : sourceMode === 'link' && !normalizedExternalUrl
      ? '请先粘贴 Skill 链接'
      : sourceMode === 'link' && !isHttpUrl(normalizedExternalUrl)
      ? '链接格式不正确，仅支持 http/https'
      : sourceMode === 'github-package' && !githubPackageUploadEnabled
      ? '当前未开启文件发布服务'
      : sourceMode === 'github-package' && !file
      ? `请先选择文件（${SKILL_UPLOAD_EXTENSIONS_TEXT}）`
      : null;

  if (status === 'loading') {
    return <div className="loading-page">登录状态检查中...</div>;
  }

  if (!session?.user) {
    return (
      <div className="upload-studio">
        <section className="hero upload-hero">
          <div className="hero-badge">创作中心</div>
          <h1 className="hero-title">
            发布你的 <span>Skill</span>
          </h1>
          <p className="hero-subtitle">统一沉淀团队方法论，让复用真正发生。</p>
        </section>

        <section className="content-section">
          <div className="upload-guard-card">
            <h2>登录后可上传 Skill</h2>
            <p>请先使用 Google 账号登录，再提交 Skill 内容。</p>
            <button
              type="button"
              className="btn btn-primary upload-submit-btn"
              onClick={() => router.push('/login')}
            >
              使用 Google 登录
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="upload-studio">
      <section className="hero upload-hero">
        <div className="hero-badge">创作中心</div>
        <h1 className="hero-title">
          发布你的 <span>Skill</span>
        </h1>
        <p className="hero-subtitle">
          支持直接发布链接，或上传 Skill 文件自动发布并返回可直接执行的安装命令。
        </p>
      </section>

      <section className="content-section">
        <div className="upload-layout">
          <form onSubmit={handleSubmit} className="upload-form-card">
            <div className="upload-section">
              <div className="upload-section-head">
                <h2>基本信息</h2>
                <p>清晰的信息能让别人更快理解并使用你的 Skill。</p>
              </div>

              <div className="form-group">
                <label htmlFor="title">
                  标题 <span className="required">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  className="input"
                  placeholder="例如：Next.js 14 入门教程"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="summary">
                  功能简介 <span className="required">*</span>
                </label>
                <textarea
                  id="summary"
                  className="input textarea"
                  placeholder="至少 10 个字，说明这个 Skill 能解决什么问题..."
                  rows={3}
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                  required
                />
                <p className="help-text">已输入 {summaryLength} 字（至少 10 字）</p>
              </div>

              <div className="form-row-two">
                <div className="form-group">
                  <label htmlFor="categoryId">
                    Skill 类型 <span className="required">*</span>
                  </label>
                  <select
                    id="categoryId"
                    className="input"
                    value={formData.categoryId}
                    onChange={(e) =>
                      setFormData({ ...formData, categoryId: e.target.value })
                    }
                    disabled={categoriesLoading}
                    required
                  >
                    {categoriesLoading ? (
                      <option value="">加载分类中...</option>
                    ) : categories.length === 0 ? (
                      <option value="">暂无可用分类</option>
                    ) : (
                      categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="tags">标签</label>
                  <input
                    id="tags"
                    type="text"
                    className="input"
                    placeholder="例如：Next.js, React, TypeScript"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  />
                  <p className="help-text">标签有助于搜索和推荐。</p>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="description">
                  描述 <span className="required">*</span>
                </label>
                <textarea
                  id="description"
                  className="input textarea"
                  placeholder="详细介绍 Skill 内容、适用场景、使用方法等..."
                  rows={7}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            <div className="upload-section">
              <div className="upload-section-head">
                <h2>发布方式</h2>
                <p>链接模式更快；文件模式可自动发布并生成可直接执行的安装命令。</p>
              </div>

              <div className="upload-mode-switch" role="tablist" aria-label="发布方式">
                <button
                  type="button"
                  className={`upload-mode-option ${sourceMode === 'link' ? 'active' : ''}`}
                  onClick={() => setSourceMode('link')}
                  aria-selected={sourceMode === 'link'}
                >
                  🔗 链接发布
                </button>
                <button
                  type="button"
                  className={`upload-mode-option ${sourceMode === 'github-package' ? 'active' : ''} ${!githubPackageUploadEnabled ? 'is-disabled' : ''}`}
                  onClick={() => {
                    setSourceMode('github-package');
                    if (!githubPackageUploadEnabled) {
                      message.warning(
                        '文件发布服务暂未配置，当前仅可查看说明；配置后即可直接上传'
                      );
                    }
                  }}
                  aria-selected={sourceMode === 'github-package'}
                  aria-disabled={!githubPackageUploadEnabled}
                  title={
                    githubPackageUploadEnabled
                      ? '上传文件并自动发布'
                      : '管理员尚未配置文件发布参数'
                  }
                >
                  📦 文件上传发布
                </button>
              </div>

              {sourceMode === 'github-package' && !githubPackageUploadEnabled ? (
                <div className="upload-config-banner" role="status">
                  文件发布服务暂未配置，请联系管理员开启后再使用。
                </div>
              ) : null}

              {sourceMode === 'github-package' && githubPackageUploadEnabled ? (
                <div className="upload-config-banner upload-config-banner-info" role="status">
                  文件将自动发布，并在详情页展示可复制的安装命令。
                </div>
              ) : null}

              {sourceMode === 'link' ? (
                <div className="form-group">
                  <label htmlFor="externalUrl">
                    Skill 链接 <span className="required">*</span>
                  </label>
                  <input
                    id="externalUrl"
                    type="text"
                    className="input"
                    placeholder="例如：https://skills.sh/sickn33/antigravity-awesome-skills/data-scientist"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                  />
                  <p className="help-text">
                    可直接粘贴 URL，或粘贴包含 URL 的命令文本，系统会自动提取链接。
                  </p>
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="skillArchiveFile">
                    Skill 文件 <span className="required">*</span>
                  </label>
                  <button
                    type="button"
                    className={`upload-dropzone ${file ? 'is-selected' : ''}`}
                    onClick={triggerFilePicker}
                    disabled={loading || !githubPackageUploadEnabled}
                  >
                    <span className="upload-drop-icon" aria-hidden="true">
                      ⇪
                    </span>
                    <span className="upload-drop-title">
                      {file ? '文件已就绪，点击可重新选择' : '点击选择 Skill 文件'}
                    </span>
                    <span className="upload-drop-subtitle">
                      支持 {SKILL_UPLOAD_EXTENSIONS_TEXT}，最大 50MB
                    </span>
                  </button>
                  <input
                    id="skillArchiveFile"
                    type="file"
                    ref={fileInputRef}
                    className="upload-hidden-input"
                    accept={SKILL_UPLOAD_ACCEPT}
                    onChange={handleFileChange}
                    disabled={loading || !githubPackageUploadEnabled}
                  />
                  {file && (
                    <div className="upload-file-chip">
                      <span className="upload-file-name">{file.name}</span>
                      <span className="upload-file-size">{formatFileSize(file.size)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="form-actions upload-form-actions">
                <button
                  type="submit"
                  className="btn btn-primary upload-submit-btn"
                  disabled={loading || Boolean(submitBlockedReason)}
                >
                  {loading
                    ? sourceMode === 'github-package'
                      ? '发布中...'
                      : '发布中...'
                    : sourceMode === 'github-package'
                    ? '上传并发布'
                    : '确认发布链接'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary upload-cancel-btn"
                  onClick={() => router.back()}
                  disabled={loading}
                >
                  取消
                </button>
              </div>
              {submitBlockedReason ? <p className="upload-submit-hint">{submitBlockedReason}</p> : null}
            </div>
          </form>

          <aside className="upload-side-panel">
            <div className="upload-panel-card">
              <h3>发布预览</h3>
              <div className="upload-panel-stat">
                <span>发布方式</span>
                <strong>{sourceMode === 'link' ? '链接发布' : '文件上传发布'}</strong>
              </div>
              <div className="upload-panel-stat">
                <span>当前分类</span>
                <strong>{selectedCategoryName}</strong>
              </div>
              {sourceMode === 'link' ? (
                <div className="upload-panel-stat">
                  <span>链接域名</span>
                  <strong>{extractHost(externalUrl) || '未填写'}</strong>
                </div>
              ) : (
                <div className="upload-panel-stat">
                  <span>文件</span>
                  <strong>{file ? file.name : '未选择'}</strong>
                </div>
              )}
              <div className="upload-panel-stat">
                <span>简介字数</span>
                <strong>{summaryLength}</strong>
              </div>
              <div className="upload-panel-stat">
                <span>标签数量</span>
                <strong>
                  {formData.tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean).length}
                </strong>
              </div>
            </div>

            <div className="upload-panel-card">
              <h3>发布小贴士</h3>
              <ul className="upload-panel-list">
                <li>标题建议 8-24 字，突出可解决的问题。</li>
                <li>简介写清“适用人群 + 产出结果”。</li>
                <li>描述补充使用步骤，复制后更容易上手。</li>
                <li>若用文件模式，系统会自动生成可直接执行的安装命令。</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function isHttpUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractHost(input: string): string {
  try {
    return new URL(input).hostname;
  } catch {
    return '';
  }
}

function normalizeExternalLinkInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (isHttpUrl(trimmed)) return trimmed;

  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (!urlMatch) return '';

  return urlMatch[0].replace(/[),.;!?]+$/g, '');
}

function validatePackageFile(file: File): { valid: boolean; error?: string } {
  if (!isSupportedSkillFile(file.name)) {
    return {
      valid: false,
      error: `不支持的文件类型，仅支持 ${SKILL_UPLOAD_EXTENSIONS_TEXT}`,
    };
  }

  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: '文件大小不能超过 50MB',
    };
  }

  return { valid: true };
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const base = 1024;
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(base)));
  const value = bytes / Math.pow(base, idx);
  return `${value.toFixed(value >= 100 || idx === 0 ? 0 : 2)} ${units[idx]}`;
}
