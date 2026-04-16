/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用 React Strict Mode（开发环境）
  reactStrictMode: true,

  // 允许的图片域名（用于 OSS 图片预览）
  images: {
    domains: ['oss.aliyuncs.com', 'skill-marketplace.oss-cn-hangzhou.aliyuncs.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.aliyuncs.com',
      },
    ],
  },

  // Webpack 配置（用于处理 Node.js 内置模块）
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 客户端不需要的 Node.js 模块
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },

  // 环境变量前缀（FaaS 平台需要）
  env: {
    NEXT_PUBLIC_APP_NAME: 'Skill Marketplace',
  },

  // 输出配置（FaaS 部署建议 standalone）
  output: 'standalone',
};

module.exports = nextConfig;
