#!/bin/bash

# ===========================================
# Skill Marketplace 本地开发环境设置脚本
# ===========================================

set -e

echo "🚀 开始设置 Skill Marketplace 本地开发环境..."

# 1. 检查 Node.js 版本
echo "📦 检查 Node.js 版本..."
NODE_VERSION=$(node -v)
echo "✅ Node.js 版本：$NODE_VERSION"

# 2. 生成 Prisma Client（使用 SQLite schema）
echo "🔧 生成 Prisma Client（SQLite）..."
npx prisma generate --schema=./prisma/schema.dev.prisma

# 3. 推送数据库结构（创建本地 SQLite 数据库）
echo "💾 创建本地数据库..."
npx prisma db push --schema=./prisma/schema.dev.prisma

# 4. 运行种子脚本（插入测试数据）
echo "🌱 插入测试数据..."
npx tsx prisma/seed.dev.ts

# 5. 完成
echo ""
echo "✅ 本地开发环境设置完成！"
echo ""
echo "🎯 下一步："
echo "   1. 运行 'npm run dev' 启动开发服务器"
echo "   2. 访问 http://localhost:3000"
echo "   3. 使用测试账号登录查看效果"
echo ""
