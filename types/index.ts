/**
 * TypeScript 类型定义
 */

// ===========================================
// 用户类型
// ===========================================
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  department?: string;
  employeeId?: string;
  createdAt: string;
  updatedAt: string;
}

// ===========================================
// 技能包类型
// ===========================================
export interface Skill {
  id: string;
  title: string;
  description: string;
  categoryId?: string;
  tags: string[];
  fileName: string;
  fileSize: number;
  fileType: string;
  downloadCount: number;
  viewCount: number;
  status: 'active' | 'archived' | 'deleted';
  authorId: string;
  author?: User;
  createdAt: string;
  updatedAt: string;
}

// ===========================================
// 下载记录类型
// ===========================================
export interface Download {
  id: string;
  userId: string;
  skillId: string;
  downloadedAt: string;
  user?: User;
  skill?: Skill;
}

// ===========================================
// 评论类型
// ===========================================
export interface Comment {
  id: string;
  content: string;
  rating?: number;
  userId: string;
  skillId: string;
  createdAt: string;
  updatedAt: string;
  user?: User;
}

// ===========================================
// API 响应类型
// ===========================================
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// ===========================================
// 上传相关类型
// ===========================================
export interface UploadResult {
  url: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

// ===========================================
// 搜索和筛选类型
// ===========================================
export interface SkillFilters {
  keyword?: string;
  tags?: string[];
  categoryId?: string;
  authorId?: string;
  status?: string;
  sortBy?: 'createdAt' | 'downloadCount' | 'viewCount';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

// ===========================================
// 表单类型
// ===========================================
export interface CreateSkillFormData {
  title: string;
  description: string;
  tags: string[];
  file: File;
}

export interface UpdateSkillFormData {
  title?: string;
  description?: string;
  tags?: string[];
}

// ===========================================
// 统计类型
// ===========================================
export interface SkillStats {
  totalSkills: number;
  totalDownloads: number;
  totalViews: number;
  topSkills: Skill[];
  recentSkills: Skill[];
}

export interface UserStats {
  uploadedSkills: number;
  downloadedSkills: number;
  totalDownloads: number;
}
