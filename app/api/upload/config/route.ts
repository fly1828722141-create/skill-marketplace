import { NextResponse } from 'next/server';
import { getFileStorageMode, isOSSConfigured } from '@/lib/oss';
import { isGitHubSkillPublishConfigured } from '@/lib/github-skill-publish';

// 上传前配置检查（不暴露密钥）
export async function GET() {
  const storageMode = getFileStorageMode();
  const objectStorageConfigured = storageMode !== 'database';
  const githubPackageUploadEnabled = isGitHubSkillPublishConfigured();

  return NextResponse.json({
    success: true,
    data: {
      // 历史兼容字段（true 表示“已配置对象存储”，不再局限 OSS）
      ossConfigured: isOSSConfigured(),
      storageMode,
      objectStorageConfigured,
      fileUploadMode: storageMode,
      fileUploadEnabled: true,
      githubPackageUploadEnabled,
    },
  });
}
