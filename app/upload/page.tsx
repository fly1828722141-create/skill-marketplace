/**
 * 上传页面
 * 
 * 用户上传 Skill 包的表单页面
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { message } from 'antd';
import { useSession } from 'next-auth/react';
import { SkillCategory } from '@/types';
import { getFallbackSkillCategories } from '@/lib/category-presets';

export default function UploadPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [ossConfigured, setOssConfigured] = useState<boolean | null>(null);
  const [sourceMode, setSourceMode] = useState<'link' | 'file'>('link');
  const [externalUrl, setExternalUrl] = useState('');
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    categoryId: '',
    description: '',
    tags: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

    fetchCategories();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function checkUploadConfig() {
      try {
        const response = await fetch('/api/upload/config');
        const result = await response.json();
        if (!mounted) return;
        setOssConfigured(Boolean(result?.success && result?.data?.ossConfigured));
      } catch (error) {
        console.warn('上传配置检查失败，默认按已配置处理:', error);
        if (mounted) {
          setOssConfigured(true);
        }
      }
    }

    checkUploadConfig();

    return () => {
      mounted = false;
    };
  }, []);

  // ===========================================
  // 表单提交处理
  // ===========================================
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isFileMode = sourceMode === 'file';

    if (!session?.user) {
      message.warning('请先登录 Google 账号后再上传');
      router.push('/login');
      return;
    }

    if (isFileMode && !file) {
      message.error('请选择要上传的文件');
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
    if (!isFileMode) {
      if (!normalizedExternalUrl) {
        message.error('请粘贴可访问的 Skill 链接');
        return;
      }

      if (!isHttpUrl(normalizedExternalUrl)) {
        message.error('链接格式不正确，仅支持 http/https 链接');
        return;
      }
    }

    setLoading(true);

    try {
      // 创建 FormData
      const uploadData = new FormData();
      uploadData.append('sourceMode', sourceMode);
      uploadData.append('title', formData.title);
      uploadData.append('summary', formData.summary);
      uploadData.append('categoryId', formData.categoryId);
      uploadData.append('description', formData.description);
      uploadData.append('tags', formData.tags);

      if (isFileMode && file) {
        uploadData.append('file', file);
      } else {
        uploadData.append('externalUrl', normalizedExternalUrl);
      }

      // 上传文件
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: uploadData,
      });

      const result = await response.json().catch(() => null);

      if (response.ok && result?.success) {
        message.success(isFileMode ? '上传成功！' : '链接发布成功！');
        router.push(`/skills/${result.data.skill.id}`);
      } else {
        message.error(result?.error || '上传失败，请稍后重试');
      }
    } catch (error: any) {
      console.error('上传失败:', error);
      message.error('上传失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  // ===========================================
  // 文件选择处理
  // ===========================================
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // 验证文件类型
      const validTypes = ['.zip', '.tar.gz', '.rar', '.7z'];
      const lowerName = selectedFile.name.toLowerCase();
      
      if (!validTypes.some((ext) => lowerName.endsWith(ext))) {
        message.error('不支持的文件类型，仅支持 .zip, .tar.gz, .rar, .7z');
        e.target.value = '';
        return;
      }

      // 验证文件大小（最大 50MB）
      const maxSize = 50 * 1024 * 1024;
      if (selectedFile.size > maxSize) {
        message.error('文件大小不能超过 50MB');
        e.target.value = '';
        return;
      }

      setFile(selectedFile);
    }
  }

  function triggerFilePicker() {
    if (loading) return;
    fileInputRef.current?.click();
  }

  const summaryLength = formData.summary.trim().length;
  const selectedCategoryName =
    categories.find((item) => item.id === formData.categoryId)?.name || '未选择';
  const isFileMode = sourceMode === 'file';
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
      : isFileMode && !file
      ? '请先选择 Skill 压缩包文件（.zip/.tar.gz/.rar/.7z）'
      : !isFileMode && !normalizedExternalUrl
      ? '请先粘贴 Skill 链接'
      : !isFileMode && !isHttpUrl(normalizedExternalUrl)
      ? '链接格式不正确，仅支持 http/https'
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
            <p>请先使用 Google 账号登录，再提交 Skill 内容与文件。</p>
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
        <p className="hero-subtitle">把你的实战方案打包，让更多同学一键复用。</p>
      </section>

      <section className="content-section">
        <div className="upload-layout">
          <form onSubmit={handleSubmit} className="upload-form-card">
            <div className="upload-section">
              <div className="upload-section-head">
                <h2>基本信息</h2>
                <p>清晰的信息能让别人更快理解并下载你的 Skill。</p>
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
                <p className="help-text">
                  已输入 {summaryLength} 字（至少 10 字）
                </p>
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
                  placeholder="详细介绍技能包内容、适用场景、使用方法等..."
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
                <p>支持两种发布方式：直接贴链接，或上传压缩包文件。</p>
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
                  className={`upload-mode-option ${sourceMode === 'file' ? 'active' : ''}`}
                  onClick={() => setSourceMode('file')}
                  aria-selected={sourceMode === 'file'}
                >
                  📦 文件上传
                </button>
              </div>

              {sourceMode === 'file' && ossConfigured === false ? (
                <div className="upload-config-banner upload-config-banner-info" role="status">
                  当前未配置 OSS，系统将自动使用内置存储完成文件上传。
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
                  <label htmlFor="file">
                    技能包文件 <span className="required">*</span>
                  </label>
                  <button
                    type="button"
                    className={`upload-dropzone ${file ? 'is-selected' : ''}`}
                    onClick={triggerFilePicker}
                    disabled={loading}
                  >
                    <span className="upload-drop-icon" aria-hidden="true">
                      ⇪
                    </span>
                    <span className="upload-drop-title">
                      {file ? '文件已就绪，点击可重新选择' : '点击选择 Skill 文件'}
                    </span>
                    <span className="upload-drop-subtitle">
                      支持 .zip / .tar.gz / .rar / .7z
                    </span>
                  </button>
                  <input
                    id="file"
                    type="file"
                    ref={fileInputRef}
                    className="upload-hidden-input"
                    accept=".zip,.tar.gz,.rar,.7z"
                    onChange={handleFileChange}
                    disabled={loading}
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
                    ? sourceMode === 'file'
                      ? '上传中...'
                      : '发布中...'
                    : sourceMode === 'file'
                    ? '确认上传'
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
              {submitBlockedReason ? (
                <p className="upload-submit-hint">{submitBlockedReason}</p>
              ) : null}
            </div>
          </form>

          <aside className="upload-side-panel">
            <div className="upload-panel-card">
              <h3>发布预览</h3>
              <div className="upload-panel-stat">
                <span>发布方式</span>
                <strong>{sourceMode === 'link' ? '链接发布' : '文件上传'}</strong>
              </div>
              <div className="upload-panel-stat">
                <span>当前分类</span>
                <strong>{selectedCategoryName}</strong>
              </div>
              {sourceMode === 'file' ? (
                <div className="upload-panel-stat">
                  <span>文件存储</span>
                  <strong>{ossConfigured === false ? '内置存储' : 'OSS 存储'}</strong>
                </div>
              ) : null}
              {sourceMode === 'link' ? (
                <div className="upload-panel-stat">
                  <span>链接域名</span>
                  <strong>{extractHost(externalUrl) || '未填写'}</strong>
                </div>
              ) : null}
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
                <li>描述补充使用步骤，下载后更容易上手。</li>
                <li>上传前先本地解压自测，减少坏包率。</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

// ===========================================
// 工具函数
// ===========================================
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
