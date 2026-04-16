/**
 * 阿里云 OSS 文件操作工具（修复版本）
 */

import OSS from 'ali-oss';

// OSS 配置
const ossConfig = {
  region: process.env.OSS_REGION || 'oss-cn-hangzhou',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  bucket: process.env.OSS_BUCKET || 'skill-marketplace',
};

// 创建 OSS 客户端实例
export function getOSSClient() {
  if (!ossConfig.accessKeyId || !ossConfig.accessKeySecret) {
    throw new Error('OSS 配置缺失，请检查环境变量');
  }
  return new OSS(ossConfig);
}

// 文件上传
export async function uploadFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<{
  url: string;
  fileName: string;
  fileSize: number;
}> {
  const client = getOSSClient();
  const date = new Date();
  const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const objectKey = `skills/${yearMonth}/${fileName}`;

  try {
    const result = await client.put(objectKey, fileBuffer, {
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
      },
    });

    return {
      url: result.url,
      fileName: objectKey,
      fileSize: fileBuffer.length,
    };
  } catch (error: any) {
    console.error('OSS 上传失败:', error);
    throw new Error(`文件上传失败：${error.message}`);
  }
}

// 文件下载
export async function downloadFile(fileName: string): Promise<Buffer> {
  const client = getOSSClient();

  try {
    const result = await client.get(fileName);
    return result.content as Buffer;
  } catch (error: any) {
    console.error('OSS 下载失败:', error);
    throw new Error(`文件下载失败：${error.message}`);
  }
}

// 删除文件
export async function deleteFile(fileName: string): Promise<void> {
  const client = getOSSClient();

  try {
    await client.delete(fileName);
  } catch (error: any) {
    console.error('OSS 删除失败:', error);
    throw new Error(`文件删除失败：${error.message}`);
  }
}

// 生成临时访问 URL
export function generateTempUrl(fileName: string, expiresInSeconds: number = 3600): string {
  const client = getOSSClient();
  return client.signatureUrl(fileName, {
    expires: expiresInSeconds,
  });
}

// 验证文件
export function validateFile(fileName: string, fileSize: number): {
  valid: boolean;
  error?: string;
} {
  const allowedTypes = ['.zip', '.tar.gz', '.rar', '.7z'];
  const maxFileSize = parseInt(process.env.MAX_FILE_SIZE_MB || '50') * 1024 * 1024;

  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  
  if (!allowedTypes.includes(ext)) {
    return {
      valid: false,
      error: `不支持的文件类型，仅支持：${allowedTypes.join(', ')}`,
    };
  }

  if (fileSize > maxFileSize) {
    return {
      valid: false,
      error: `文件大小超过限制 (${maxFileSize / 1024 / 1024}MB)`,
    };
  }

  return { valid: true };
}
