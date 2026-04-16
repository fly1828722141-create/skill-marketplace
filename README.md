# Skill Marketplace - 技能分享平台

一个基于 Next.js 14 的技能分享平台，支持用户上传、下载和搜索技能包。

## 🚀 技术栈

- **前端框架**: Next.js 14 (App Router)
- **编程语言**: TypeScript
- **UI 组件库**: Ant Design 5
- **数据库 ORM**: Prisma
- **数据库**: PostgreSQL
- **文件存储**: 阿里云 OSS
- **认证方案**: NextAuth.js + 阿里 BUC 单点登录
- **部署平台**: 阿里云 FaaS

## 📋 功能特性

### MVP 版本（当前）
- ✅ 用户认证（BUC 单点登录）
- ✅ Skill 包上传（支持 .zip/.tar.gz 格式）
- ✅ Skill 包浏览和搜索
- ✅ Skill 包详情查看
- ✅ 下载次数统计
- ✅ 简单的评论功能

### 后续规划
- ⏳ 用户积分系统
- ⏳ Skill 评分和评级
- ⏳ 收藏夹功能
- ⏳ 推荐算法
- ⏳ 消息通知

## 🛠️ 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp env.example.txt .env.local
# 编辑 .env.local 填入实际配置值
```

### 3. 初始化数据库

```bash
# 生成 Prisma 客户端
npm run db:generate

# 推送数据库结构（开发环境）
npm run db:push

# 或者运行迁移（生产环境）
npm run db:migrate

# 插入种子数据（可选）
npm run db:seed
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 📦 部署到 FaaS

### 1. 构建项目

```bash
npm run build
```

### 2. 上传代码到 FaaS 平台

在 FaaS 控制台创建变更单，上传 `.next` 和 `node_modules` 目录。

### 3. 配置环境变量

在 FaaS 平台的环境设置中配置：
- DATABASE_URL（数据库连接串）
- OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
- BUC_APP_KEY / BUC_APP_SECRET
- NEXTAUTH_SECRET

### 4. 发布上线

提交变更单走审批流程（审批人：之奥 - 赵鸿刚）。

## 🗄️ 数据库模型

### User 表
- id, name, email, avatar
- department, employeeId
- createdAt, updatedAt

### Skill 表
- id, title, description
- categoryId, tags
- fileId, fileName, fileSize
- downloadCount, viewCount
- authorId (关联 User)
- createdAt, updatedAt

### Download 表
- id, userId, skillId
- downloadedAt

## 📁 项目结构

```
skill-marketplace/
├── app/                      # Next.js App Router
│   ├── api/                  # API 路由
│   │   ├── auth/[...nextauth]/  # 认证接口
│   │   ├── skills/[id]/      # Skill CRUD
│   │   ├── upload/           # 文件上传
│   │   └── download/         # 下载统计
│   ├── login/                # 登录页
│   ├── upload/               # 上传页
│   ├── skills/[id]/          # 详情页
│   ├── layout.tsx            # 根布局
│   └── page.tsx              # 首页
├── components/               # React 组件
│   ├── ui/                   # 基础 UI 组件
│   └── skill/                # Skill 相关组件
├── lib/                      # 工具函数
│   ├── prisma.ts             # Prisma 客户端
│   ├── oss.ts                # OSS 操作
│   ├── auth.ts               # NextAuth 配置
│   └── utils.ts              # 通用工具
├── prisma/                   # 数据库配置
│   ├── schema.prisma         # 数据模型
│   └── seed.ts               # 种子数据
├── types/                    # TypeScript 类型定义
└── public/                   # 静态资源
```

## 🔐 安全考虑

- 所有 API 接口都需要认证（除了公开读取）
- 文件上传限制类型和大小
- SQL 注入防护（Prisma 参数化查询）
- XSS 防护（React 自动转义）
- CSRF 防护（NextAuth 内置）

## 👥 团队成员

- 开发者：尚凡（龚艳）
- 审批人：之奥（赵鸿刚）
- 部门：飞猪 - 大住宿 - 业务运营中心 - 经营效能

## 📄 License

Internal Use Only - 阿里巴巴集团内部使用
