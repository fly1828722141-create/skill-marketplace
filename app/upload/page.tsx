/**
 * 上传页面
 * 
 * 用户上传 Skill 包的表单页面
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { message } from 'antd';

export default function UploadPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    tags: '',
  });
  const [file, setFile] = useState<File | null>(null);

  // ===========================================
  // 检查登录状态
  // ===========================================
  if (status === 'unauthenticated') {
    return (
      <div className="upload-page">
        <div className="auth-required">
          <h2>⚠️ 请先登录</h2>
          <p>登录后才能上传技能包</p>
          <button onClick={() => router.push('/login')} className="btn btn-primary">
            去登录
          </button>
        </div>
      </div>
    );
  }

  // ===========================================
  // 表单提交处理
  // ===========================================
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!file) {
      message.error('请选择要上传的文件');
      return;
    }

    if (!formData.title || !formData.description) {
      message.error('请填写标题和描述');
      return;
    }

    setLoading(true);

    try {
      // 创建 FormData
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('title', formData.title);
      uploadData.append('description', formData.description);
      uploadData.append('tags', formData.tags);

      // 上传文件
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: uploadData,
      });

      const result = await response.json();

      if (result.success) {
        message.success('上传成功！');
        router.push(`/skills/${result.data.skill.id}`);
      } else {
        message.error(result.error || '上传失败');
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
      const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
      
      if (!validTypes.includes(ext)) {
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

  return (
    <div className="upload-page">
      <div className="upload-header">
        <h1>📤 上传技能包</h1>
        <p>分享你的技能，帮助更多同学成长</p>
      </div>

      <form onSubmit={handleSubmit} className="upload-form">
        <div className="form-section">
          <h3>基本信息</h3>
          
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
            <label htmlFor="description">
              描述 <span className="required">*</span>
            </label>
            <textarea
              id="description"
              className="input textarea"
              placeholder="详细介绍你的技能包内容、适用场景、使用方法等..."
              rows={6}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="tags">标签</label>
            <input
              id="tags"
              type="text"
              className="input"
              placeholder="用逗号分隔，例如：Next.js, React, TypeScript"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
            />
            <p className="help-text">标签有助于其他人搜索到你的技能包</p>
          </div>
        </div>

        <div className="form-section">
          <h3>文件上传</h3>
          
          <div className="form-group">
            <label htmlFor="file">
              技能包文件 <span className="required">*</span>
            </label>
            <div className="file-upload-area">
              <input
                id="file"
                type="file"
                className="file-input"
                accept=".zip,.tar.gz,.rar,.7z"
                onChange={handleFileChange}
                disabled={loading}
              />
              {file && (
                <div className="file-info">
                  <span className="file-name">📄 {file.name}</span>
                  <span className="file-size">{formatFileSize(file.size)}</span>
                </div>
              )}
            </div>
            <p className="help-text">
              支持格式：.zip, .tar.gz, .rar, .7z | 最大 50MB
            </p>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary btn-large"
            disabled={loading || !file}
          >
            {loading ? '上传中...' : '确认上传'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => router.back()}
            disabled={loading}
          >
            取消
          </button>
        </div>
      </form>

      <style jsx>{`
        .upload-page {
          max-width: 800px;
          margin: 0 auto;
        }

        .upload-header {
          margin-bottom: var(--spacing-xl);
        }

        .upload-header h1 {
          font-size: 28px;
          margin-bottom: var(--spacing-xs);
        }

        .upload-header p {
          color: var(--text-secondary);
          font-size: 16px;
        }

        .upload-form {
          background: white;
          border-radius: var(--radius-md);
          padding: var(--spacing-lg);
          box-shadow: var(--shadow-sm);
        }

        .form-section {
          margin-bottom: var(--spacing-xl);
        }

        .form-section h3 {
          font-size: 18px;
          margin-bottom: var(--spacing-md);
          color: var(--primary-color);
        }

        .form-group {
          margin-bottom: var(--spacing-md);
        }

        .form-group label {
          display: block;
          margin-bottom: var(--spacing-xs);
          font-weight: 500;
        }

        .required {
          color: var(--error-color);
        }

        .textarea {
          resize: vertical;
          font-family: inherit;
        }

        .help-text {
          font-size: 12px;
          color: var(--text-tertiary);
          margin-top: var(--spacing-xs);
        }

        .file-upload-area {
          border: 2px dashed var(--border-color);
          border-radius: var(--radius-md);
          padding: var(--spacing-lg);
          text-align: center;
          transition: border-color 0.2s;
        }

        .file-upload-area:hover {
          border-color: var(--primary-color);
        }

        .file-input {
          display: block;
          margin: 0 auto;
        }

        .file-info {
          margin-top: var(--spacing-sm);
          padding: var(--spacing-sm);
          background-color: var(--bg-secondary);
          border-radius: var(--radius-sm);
        }

        .file-name {
          display: block;
          font-weight: 500;
          margin-bottom: var(--spacing-xs);
        }

        .file-size {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .form-actions {
          display: flex;
          gap: var(--spacing-md);
          padding-top: var(--spacing-lg);
          border-top: 1px solid var(--border-color);
        }

        .btn-large {
          padding: var(--spacing-md) var(--spacing-xl);
          min-width: 120px;
        }

        .auth-required {
          text-align: center;
          padding: var(--spacing-xl);
          background: white;
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
        }

        .auth-required h2 {
          margin-bottom: var(--spacing-sm);
        }

        .auth-required p {
          color: var(--text-secondary);
          margin-bottom: var(--spacing-md);
        }
      `}</style>
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
