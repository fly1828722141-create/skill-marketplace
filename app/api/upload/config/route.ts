import { NextResponse } from 'next/server';
import { getFileStorageMode, isOSSConfigured } from '@/lib/oss';

// 上传前配置检查（不暴露密钥）
export async function GET() {
  const storageMode = getFileStorageMode();
  return NextResponse.json({
    success: true,
    data: {
      ossConfigured: isOSSConfigured(),
      fileUploadMode: storageMode,
      fileUploadEnabled: true,
    },
  });
}
