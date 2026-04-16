# FaaS 平台部署指南

本文档详细说明如何将 Skill Marketplace 部署到阿里云 FaaS 平台。

## 📋 前置准备

### 1. 确认应用已创建

- 应用名称：`skill-youqiubiyingwu`
- 应用类型：函数组应用
- 脚手架：Next.js 社区基础模板
- 状态：已完成初始化

### 2. 准备数据库

#### 2.1 申请数据库权限

1. 访问数据库管理平台（内部地址）
2. 提交权限申请：
   ```
   申请系统：Skill Marketplace
   数据库类型：PostgreSQL
   权限级别：读写权限
   审批人：之奥（赵鸿刚）
   ```

3. 等待审批通过后，获取数据库连接串：
   ```
   DATABASE_URL=postgresql://user:password@host:port/database_name
   ```

#### 2.2 初始化数据库表结构

在 FaaS 平台的在线终端或本地执行：

```bash
# 安装依赖
npm install

# 生成 Prisma 客户端
npm run db:generate

# 推送数据库结构
npm run db:push
```

或者使用迁移命令（推荐生产环境）：

```bash
npm run db:migrate
```

### 3. 配置阿里云 OSS

#### 3.1 创建 OSS Bucket

1. 访问阿里云 OSS 控制台
2. 创建 Bucket：
   - Bucket 名称：`skill-marketplace`
   - 地域：华东 1（杭州）
   - 权限：私有（推荐）
   - 存储类型：标准存储

#### 3.2 获取访问凭证

1. 进入 RAM 访问控制
2. 创建用户或使用现有用户
3. 创建 AccessKey：
   - AccessKeyId: `xxx`
   - AccessKeySecret: `xxx`
4. 授予 OSS 相关权限：
   - `oss:GetObject`
   - `oss:PutObject`
   - `oss:DeleteObject`
   - `oss:ListObjects`

### 4. 配置 BUC 登录

#### 4.1 注册 BUC 应用

1. 访问 BUC 开发者平台（内部地址）
2. 创建新应用：
   ```
   应用名称：Skill Marketplace
   回调地址：https://cd.faas.alibaba-inc.com/api/auth/callback
   应用类型：Web 应用
   ```

3. 获取应用凭证：
   - AppKey: `xxx`
   - AppSecret: `xxx`

---

## 🚀 部署流程

### Step 1: 本地构建

```bash
# 1. 安装依赖
npm install

# 2. 生成 Prisma 客户端
npm run db:generate

# 3. 构建项目
npm run build
```

构建完成后，检查输出：
- `.next/` 目录包含编译后的应用
- `node_modules/` 包含所有依赖

### Step 2: 创建变更单

1. 访问 FaaS 控制台：`https://cd.faas.alibaba-inc.com/unite/micro/apps`
2. 找到应用 `skill-youqiubiyingwu`
3. 点击"新建变更"
4. 选择变更类型：**代码部署**
5. 上传文件：
   ```
   ✅ .next/
   ✅ node_modules/
   ✅ package.json
   ✅ prisma/schema.prisma
   ✅ public/
   ```

### Step 3: 配置环境变量

在 FaaS 平台的"环境设置"中配置以下变量：

#### 预发环境（pre-release）

```bash
# 数据库
DATABASE_URL=postgresql://pre_user:pre_pass@pre_host:5432/skill_marketplace_pre

# NextAuth
NEXTAUTH_SECRET=your_secret_key_for_pre_release
NEXTAUTH_URL=https://pre-skill-youqiubiyingwu.faas.alibaba-inc.com

# BUC 登录
BUC_APP_KEY=pre_buc_app_key
BUC_APP_SECRET=pre_buc_app_secret
BUC_LOGIN_URL=https://login.alibaba-inc.com/buc/login
BUC_CALLBACK_URL=https://pre-skill-youqiubiyingwu.faas.alibaba-inc.com/api/auth/callback

# OSS 配置
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=skill-marketplace
OSS_ACCESS_KEY_ID=your_oss_access_key_id
OSS_ACCESS_KEY_SECRET=your_oss_access_key_secret
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com

# 应用配置
MAX_FILE_SIZE_MB=50
NODE_ENV=pre-release
```

#### 正式环境（production）

```bash
# 数据库
DATABASE_URL=postgresql://prod_user:prod_pass@prod_host:5432/skill_marketplace_prod

# NextAuth
NEXTAUTH_SECRET=your_secret_key_for_production
NEXTAUTH_URL=https://skill-youqiubiyingwu.faas.alibaba-inc.com

# BUC 登录
BUC_APP_KEY=prod_buc_app_key
BUC_APP_SECRET=prod_buc_app_secret
BUC_LOGIN_URL=https://login.alibaba-inc.com/buc/login
BUC_CALLBACK_URL=https://skill-youqiubiyingwu.faas.alibaba-inc.com/api/auth/callback

# OSS 配置
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=skill-marketplace
OSS_ACCESS_KEY_ID=your_oss_access_key_id
OSS_ACCESS_KEY_SECRET=your_oss_access_key_secret
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com

# 应用配置
MAX_FILE_SIZE_MB=50
NODE_ENV=production
```

### Step 4: 提交审批

1. 填写变更说明：
   ```
   变更标题：Skill Marketplace 首次上线
   变更描述：
   - 部署 Next.js 14 技能分享平台
   - 功能：用户上传/下载技能包、搜索筛选、统计评论
   - 技术栈：Next.js + TypeScript + Prisma + PostgreSQL + OSS
   - 负责人：尚凡（龚艳）
   - 审批人：之奥（赵鸿刚）
   ```

2. 选择审批人：**之奥（赵鸿刚）**
3. 提交变更单

### Step 5: 等待审批通过

- 审批人会收到钉钉通知
- 可在变更单页面查看审批进度
- 审批通过后自动开始部署

### Step 6: 验证部署

部署完成后：

1. 访问应用 URL：
   - 预发：`https://pre-skill-youqiubiyingwu.faas.alibaba-inc.com`
   - 正式：`https://skill-youqiubiyingwu.faas.alibaba-inc.com`

2. 测试核心功能：
   - ✅ 登录功能（BUC 单点登录）
   - ✅ 首页展示
   - ✅ 技能包列表
   - ✅ 技能包详情
   - ✅ 上传功能
   - ✅ 下载功能

3. 检查监控日志：
   - 访问 FaaS 控制台 -> 应用监控
   - 查看错误日志和性能指标

---

## 🔧 常见问题

### Q1: 数据库连接失败

**错误信息**: `PrismaClientInitializationError`

**解决方案**:
1. 检查 `DATABASE_URL` 是否正确
2. 确认数据库白名单已添加 FaaS 服务器 IP
3. 验证数据库用户权限

### Q2: OSS 上传失败

**错误信息**: `AccessDenied`

**解决方案**:
1. 检查 OSS AccessKey 是否有效
2. 确认 RAM 用户有 OSS 操作权限
3. 验证 Bucket 名称和地域配置

### Q3: BUC 登录回调失败

**错误信息**: `Invalid callback URL`

**解决方案**:
1. 在 BUC 开发者平台检查回调地址配置
2. 确保 `NEXTAUTH_URL` 与实际域名一致
3. 检查 `BUC_CALLBACK_URL` 配置

### Q4: 构建失败

**错误信息**: `Module not found`

**解决方案**:
```bash
# 清理缓存重新构建
rm -rf node_modules .next
npm install
npm run build
```

---

## 📊 监控和运维

### 日常监控

1. **应用健康度**
   - CPU 使用率 < 70%
   - 内存使用率 < 80%
   - 响应时间 < 500ms

2. **业务指标**
   - 日活跃用户数
   - 技能包上传/下载量
   - 错误率 < 1%

3. **数据库性能**
   - 查询延迟
   - 连接池使用率
   - 慢查询数量

### 日志查看

```bash
# FaaS 控制台 -> 应用日志
- 访问日志：查看所有请求
- 错误日志：排查异常
- 性能日志：分析瓶颈
```

### 备份策略

1. **数据库备份**
   - 每日自动备份（FaaS 平台提供）
   - 保留周期：7 天

2. **OSS 文件备份**
   - 开启版本控制
   - 跨区域复制（可选）

---

## 📞 联系方式

- **开发者**: 尚凡（龚艳）
- **部门**: 飞猪 - 大住宿 - 业务运营中心 - 经营效能
- **审批人**: 之奥（赵鸿刚）
- **技术支持**: 阿里云 FaaS 文档中心

---

## ✅ 部署检查清单

- [ ] 数据库权限申请完成
- [ ] OSS Bucket 创建完成
- [ ] BUC 应用注册完成
- [ ] 环境变量配置完成
- [ ] 本地构建成功
- [ ] 变更单提交
- [ ] 审批通过
- [ ] 部署完成
- [ ] 功能验证通过
- [ ] 监控告警配置

祝部署顺利！🎉
