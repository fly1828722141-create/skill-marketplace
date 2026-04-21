/**
 * 对象存储工具
 *
 * 支持：
 * - 阿里云 OSS
 * - Cloudflare R2（S3 兼容）
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  SKILL_UPLOAD_EXTENSIONS,
  SKILL_UPLOAD_EXTENSIONS_TEXT,
  detectSkillFileExtension,
} from '@/lib/skill-upload-format';

type OSSConstructor = new (options: {
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
}) => {
  put: (
    name: string,
    file: Buffer,
    options?: { headers?: Record<string, string> }
  ) => Promise<{ url: string }>;
  get: (name: string) => Promise<{ content: unknown }>;
  delete: (name: string) => Promise<void>;
  signatureUrl: (name: string, options: { expires: number }) => string;
};

let cachedOSSConstructor: OSSConstructor | null = null;
let cachedR2Client: S3Client | null = null;

function readEnv(name: string, fallback: string = ''): string {
  return (process.env[name] || fallback).trim();
}

function trimTrailingSlash(input: string): string {
  return input.replace(/\/+$/, '');
}

function encodeObjectKey(objectKey: string): string {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function getOSSConstructor(): OSSConstructor {
  if (!cachedOSSConstructor) {
    // 延迟加载 ali-oss，避免构建阶段提前执行第三方库初始化
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ossModule = require('ali-oss');
    cachedOSSConstructor = (ossModule.default ?? ossModule) as OSSConstructor;
  }

  return cachedOSSConstructor;
}

// 阿里云 OSS 配置
const ossConfig = {
  region: readEnv('OSS_REGION', 'oss-cn-hangzhou'),
  accessKeyId: readEnv('OSS_ACCESS_KEY_ID') || readEnv('ALIBABA_CLOUD_ACCESS_KEY_ID'),
  accessKeySecret:
    readEnv('OSS_ACCESS_KEY_SECRET') || readEnv('ALIBABA_CLOUD_ACCESS_KEY_SECRET'),
  bucket: readEnv('OSS_BUCKET', 'skill-marketplace'),
};

// Cloudflare R2 配置
const r2Config = {
  accountId: readEnv('R2_ACCOUNT_ID'),
  bucket: readEnv('R2_BUCKET'),
  accessKeyId: readEnv('R2_ACCESS_KEY_ID'),
  secretAccessKey: readEnv('R2_SECRET_ACCESS_KEY'),
  publicBaseUrl: trimTrailingSlash(readEnv('R2_PUBLIC_BASE_URL')),
};

export type FileStorageMode = 'oss' | 'r2' | 'database';

function isOSSReady(): boolean {
  return Boolean(ossConfig.accessKeyId && ossConfig.accessKeySecret);
}

function isR2Ready(): boolean {
  // 为保证评论图片、文件链接长期可用，R2 模式要求可公开访问域名
  return Boolean(
    r2Config.accountId &&
      r2Config.bucket &&
      r2Config.accessKeyId &&
      r2Config.secretAccessKey &&
      r2Config.publicBaseUrl
  );
}

function resolveStorageMode(): FileStorageMode {
  const preferred = readEnv('STORAGE_PROVIDER').toLowerCase();

  if (preferred === 'r2') {
    return isR2Ready() ? 'r2' : 'database';
  }

  if (preferred === 'oss') {
    return isOSSReady() ? 'oss' : 'database';
  }

  if (isR2Ready()) {
    return 'r2';
  }

  if (isOSSReady()) {
    return 'oss';
  }

  return 'database';
}

// 历史兼容：原有调用点使用 isOSSConfigured 判断是否启用对象存储
export function isOSSConfigured(): boolean {
  return resolveStorageMode() !== 'database';
}

export function getFileStorageMode(): FileStorageMode {
  return resolveStorageMode();
}

export function getOSSClient() {
  if (!isOSSReady()) {
    throw new Error('OSS 配置缺失，请检查环境变量');
  }

  const OSS = getOSSConstructor();
  return new OSS(ossConfig);
}

function getR2Client(): S3Client {
  if (!isR2Ready()) {
    throw new Error('R2 配置缺失，请检查环境变量');
  }

  if (!cachedR2Client) {
    cachedR2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });
  }

  return cachedR2Client;
}

function buildR2ObjectUrl(objectKey: string): string {
  if (!r2Config.publicBaseUrl) {
    throw new Error('R2_PUBLIC_BASE_URL 未配置');
  }

  return `${r2Config.publicBaseUrl}/${encodeObjectKey(objectKey)}`;
}

function buildObjectKey(fileName: string): string {
  const date = new Date();
  const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `skills/${yearMonth}/${fileName}`;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof transformable.transformToByteArray === 'function') {
    return Buffer.from(await transformable.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    } else {
      chunks.push(Buffer.from(chunk));
    }
  }

  return Buffer.concat(chunks);
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
  const objectKey = buildObjectKey(fileName);
  const storageMode = resolveStorageMode();

  if (storageMode === 'database') {
    throw new Error('对象存储未配置');
  }

  if (storageMode === 'oss') {
    const client = getOSSClient();

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

  const r2Client = getR2Client();

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: r2Config.bucket,
        Key: objectKey,
        Body: fileBuffer,
        ContentType: mimeType || 'application/octet-stream',
      })
    );

    return {
      url: buildR2ObjectUrl(objectKey),
      fileName: objectKey,
      fileSize: fileBuffer.length,
    };
  } catch (error: any) {
    console.error('R2 上传失败:', error);
    throw new Error(`文件上传失败：${error.message}`);
  }
}

// 文件下载
export async function downloadFile(fileName: string): Promise<Buffer> {
  const storageMode = resolveStorageMode();

  if (storageMode === 'database') {
    throw new Error('对象存储未配置');
  }

  if (storageMode === 'oss') {
    const client = getOSSClient();

    try {
      const result = await client.get(fileName);
      return result.content as Buffer;
    } catch (error: any) {
      console.error('OSS 下载失败:', error);
      throw new Error(`文件下载失败：${error.message}`);
    }
  }

  const r2Client = getR2Client();
  try {
    const response = await r2Client.send(
      new GetObjectCommand({
        Bucket: r2Config.bucket,
        Key: fileName,
      })
    );

    return await bodyToBuffer(response.Body);
  } catch (error: any) {
    console.error('R2 下载失败:', error);
    throw new Error(`文件下载失败：${error.message}`);
  }
}

// 删除文件
export async function deleteFile(fileName: string): Promise<void> {
  const storageMode = resolveStorageMode();

  if (storageMode === 'database') {
    throw new Error('对象存储未配置');
  }

  if (storageMode === 'oss') {
    const client = getOSSClient();

    try {
      await client.delete(fileName);
      return;
    } catch (error: any) {
      console.error('OSS 删除失败:', error);
      throw new Error(`文件删除失败：${error.message}`);
    }
  }

  const r2Client = getR2Client();
  try {
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: r2Config.bucket,
        Key: fileName,
      })
    );
  } catch (error: any) {
    console.error('R2 删除失败:', error);
    throw new Error(`文件删除失败：${error.message}`);
  }
}

// 生成临时访问 URL
export async function generateTempUrl(
  fileName: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const storageMode = resolveStorageMode();

  if (storageMode === 'database') {
    throw new Error('对象存储未配置');
  }

  if (storageMode === 'oss') {
    const client = getOSSClient();
    return client.signatureUrl(fileName, {
      expires: expiresInSeconds,
    });
  }

  // R2 已要求配置公开访问域名，直接返回公开链接
  return buildR2ObjectUrl(fileName);
}

// 验证文件
export function validateFile(fileName: string, fileSize: number): {
  valid: boolean;
  error?: string;
} {
  const maxFileSize = parseInt(process.env.MAX_FILE_SIZE_MB || '50') * 1024 * 1024;
  const ext = detectSkillFileExtension(fileName);

  if (!SKILL_UPLOAD_EXTENSIONS.includes(ext as (typeof SKILL_UPLOAD_EXTENSIONS)[number])) {
    return {
      valid: false,
      error: `不支持的文件类型，仅支持：${SKILL_UPLOAD_EXTENSIONS_TEXT}`,
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
