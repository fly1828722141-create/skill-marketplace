/**
 * 通用工具函数
 */

import { type ClassValue, clsx } from 'clsx';

// ===========================================
// 文件大小格式化
// ===========================================
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

// ===========================================
// 时间格式化
// ===========================================
export function formatTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < minute) {
    return '刚刚';
  } else if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`;
  } else if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`;
  } else if (diff < month) {
    return `${Math.floor(diff / day)}天前`;
  } else if (diff < year) {
    return `${Math.floor(diff / month)}个月前`;
  } else {
    return `${Math.floor(diff / year)}年前`;
  }
}

// ===========================================
// 详细时间格式（用于展示）
// ===========================================
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

// ===========================================
// 数字格式化（添加千分位）
// ===========================================
export function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ===========================================
// 截断文本（用于预览）
// ===========================================
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// ===========================================
// 生成随机字符串（用于文件命名）
// ===========================================
export function generateRandomString(length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ===========================================
// 安全文件名生成
// ===========================================
export function sanitizeFileName(fileName: string): string {
  // 移除特殊字符，保留中文、字母、数字、下划线、点、连字符
  return fileName
    .replace(/[^\w\u4e00-\u9fa5.-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

// ===========================================
// 获取文件扩展名
// ===========================================
export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length === 1) return '';
  
  // 处理 .tar.gz 这种情况
  if (parts.length >= 2 && parts[parts.length - 1] === 'gz' && parts[parts.length - 2] === 'tar') {
    return 'tar.gz';
  }
  
  return parts.pop() || '';
}

// ===========================================
// 标签处理工具
// ===========================================
export function parseTags(tagString: string): string[] {
  if (!tagString) return [];
  return tagString
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
}

export function formatTags(tags: string[]): string {
  return tags.join(', ');
}

// ===========================================
// API 响应助手
// ===========================================
export function successResponse<T>(data: T, message?: string) {
  return {
    success: true,
    data,
    message: message || '操作成功',
  };
}

export function errorResponse(message: string, code?: string) {
  return {
    success: false,
    error: message,
    code: code || 'ERROR',
  };
}

// ===========================================
// 分页计算
// ===========================================
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function calculatePagination(params: PaginationParams): {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
} {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
  const skip = (page - 1) * pageSize;

  return { skip, take: pageSize, page, pageSize };
}
