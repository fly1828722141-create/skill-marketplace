#!/bin/bash

# ===========================================
# Skill Marketplace 初始化脚本
# 
# 用途：快速完成本地开发环境配置
# ===========================================

set -e  # 遇到错误立即退出

echo "🚀 开始初始化 Skill Marketplace 项目..."

# 检查 Node.js 版本
echo "📦 检查 Node.js 版本..."
NODE_VERSION=$(node -v)
REQUIRED_VERSION="v16"

if [[ ! $NODE_VERSION =~ ^$REQUIRED_VERSION ]]; then
  echo "❌ 错误：需要 Node.js $REQUIRED_VERSION.x 或更高版本"
  echo "   当前版本：$NODE_VERSION"
  echo "   请访问 https://nodejs.org 下载安装"
  exit 1
fi

echo "✅ Node.js 版本检查通过：$NODE_VERSION"

# 安装依赖
echo "📦 安装项目依赖..."
npm install

if [ $? -ne 0 ]; then
  echo "❌ 依赖安装失败，请检查网络连接"
  exit 1
fi

echo "✅ 依赖安装完成"

# 生成 Prisma 客户端
echo "🗄️  生成 Prisma 客户端..."
npm run db:generate

# 检查环境变量文件
if [ ! -f .env.local ]; then
  echo "📝 创建环境变量配置文件..."
  cp env.example.txt .env.local
  echo "⚠️  请编辑 .env.local 文件，填入实际配置值"
  echo "   必需配置："
  echo "   - DATABASE_URL"
  echo "   - NEXTAUTH_SECRET"
  echo "   - OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET"
  echo "   - BUC_APP_KEY / BUC_APP_SECRET"
else
  echo "✅ 环境变量文件已存在"
fi

# 询问是否初始化数据库
read -p "是否现在初始化数据库？(y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🗄️  推送数据库结构..."
  npm run db:push
  
  echo "🌱 插入种子数据..."
  npm run db:seed
  
  echo "✅ 数据库初始化完成"
fi

echo ""
echo "======================================"
echo "✨ 初始化完成！"
echo "======================================"
echo ""
echo "下一步操作："
echo "1. 检查并编辑 .env.local 配置文件"
echo "2. 运行 'npm run dev' 启动开发服务器"
echo "3. 访问 http://localhost:3000"
echo ""
echo "📖 详细文档："
echo "   - README.md: 项目说明"
echo "   - DEPLOYMENT.md: 部署指南"
echo "   - PROJECT_SUMMARY.md: 项目总结"
echo ""
