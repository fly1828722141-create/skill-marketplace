# ✅ Skill Marketplace 部署检查清单

## 📋 部署前准备

### 本地环境检查
- [x] ✅ Node.js 版本 >= 16.0.0（当前：v22.19.0）
- [x] ✅ npm 安装完成（当前：10.9.3）
- [x] ✅ 项目依赖已安装（`npm install` 成功）
- [x] ✅ 本地数据库已初始化（SQLite dev.db）
- [x] ✅ 测试数据已创建（3 用户 + 5 技能包）
- [x] ✅ 生产构建成功（`npm run build` 通过）

### 代码文件检查
- [x] ✅ `.next/` 构建产物已生成
- [x] ✅ `node_modules/` 依赖完整
- [x] ✅ `package.json` 配置正确
- [x] ✅ 环境变量模板已创建（`env.example.txt`）
- [x] ✅ Prisma 数据库模型已定义
- [x] ✅ API 路由已全部实现
- [x] ✅ 前端页面已完成

---

## 🎯 FaaS 部署步骤

### 第一步：上传代码到 FaaS
- [ ] 访问 FaaS 控制台：https://cd.faas.alibaba-inc.com/unite/micro/apps
- [ ] 找到应用：`skill-youqiubiyingwu`
- [ ] 点击"新建变更"
- [ ] 选择以下**一种方式**上传：
  - [ ] **方式 A**：直接上传整个 `skill-marketplace/` 目录
  - [ ] **方式 B**：上传 zip 压缩包（包含 .next/, node_modules/, package.json）
  - [ ] **方式 C**：通过 Git 推送（如果已关联仓库）

### 第二步：配置预发环境变量
在 FaaS 控制台 -> 环境设置 -> 预发环境，添加以下变量：

- [ ] `DATABASE_URL` - FaaS 自动注入
- [ ] `NEXTAUTH_SECRET` - 运行 `openssl rand -base64 32` 生成
- [ ] `NEXTAUTH_URL` - FaaS 分配的预发域名
- [ ] `BUC_APP_KEY` - 联系之奥获取
- [ ] `BUC_APP_SECRET` - 联系之奥获取
- [ ] `OSS_ACCESS_KEY_ID` - 阿里云 OSS 密钥
- [ ] `OSS_ACCESS_KEY_SECRET` - 阿里云 OSS 密钥
- [ ] `OSS_BUCKET` - `skill-marketplace-test`
- [ ] `OSS_REGION` - `oss-cn-hangzhou`

### 第三步：配置正式环境变量
在 FaaS 控制台 -> 环境设置 -> 正式环境，添加以下变量：

- [ ] `DATABASE_URL` - FaaS 自动注入
- [ ] `NEXTAUTH_SECRET` - 新的随机字符串（不同于预发）
- [ ] `NEXTAUTH_URL` - FaaS 分配的正式域名
- [ ] `BUC_APP_KEY` - 同预发环境
- [ ] `BUC_APP_SECRET` - 同预发环境
- [ ] `OSS_ACCESS_KEY_ID` - 生产 OSS 密钥
- [ ] `OSS_ACCESS_KEY_SECRET` - 生产 OSS 密钥
- [ ] `OSS_BUCKET` - `skill-marketplace-prod`
- [ ] `OSS_REGION` - `oss-cn-hangzhou`

### 第四步：提交审批
- [ ] 填写变更描述（参考下方模板）
- [ ] 选择审批人：**之奥 - 赵鸿刚**
- [ ] 提交审批

**变更描述模板**：
```
【首次部署】Skill Marketplace 技能分享平台 v1.0.0
- 功能：用户上传/下载技能包、搜索筛选、统计展示
- 技术栈：Next.js 14 + TypeScript + Prisma + PostgreSQL + OSS
- 测试情况：本地测试通过，数据库初始化完成（3 用户 + 5 技能包）
- 负责人：龚艳 (尚凡) - 390599
```

---

## 🗄️ 数据库权限申请

### 准备申请材料
- [ ] 填写数据库权限申请表（见 FAAS_DEPLOYMENT_STEPS.md）
- [ ] 准备应用信息文档
- [ ] 说明业务场景和数据规模

### 提交流程
- [ ] 发送申请邮件/工单给之奥
- [ ] 抄送数据库管理团队
- [ ] 等待审批通过（预计 1-2 个工作日）

---

## 🧪 部署后验证

### 基础功能测试
- [ ] 访问首页，页面正常加载
- [ ] 统计卡片显示正确（总技能包数、总下载次数等）
- [ ] 点击"登录"，BUC 单点登录成功
- [ ] 登录后显示用户头像和昵称
- [ ] 进入"上传技能包"页面
- [ ] 上传一个测试文件（.zip 格式）
- [ ] 填写表单并提交成功
- [ ] 技能库列表中出现新上传的技能包
- [ ] 进入技能包详情页
- [ ] 点击下载按钮，文件开始下载
- [ ] 下载次数正确增加

### API 接口测试
- [ ] `GET /api/skills` - 获取技能包列表
- [ ] `GET /api/skills/:id` - 获取技能包详情
- [ ] `POST /api/upload` - 上传文件
- [ ] `POST /api/download` - 创建下载记录

### 数据库验证
- [ ] 连接数据库
- [ ] 执行 `SELECT COUNT(*) FROM users;` - 应返回 3
- [ ] 执行 `SELECT COUNT(*) FROM skills;` - 应返回 6（5 个初始 + 1 个测试）
- [ ] 执行 `SELECT * FROM downloads LIMIT 10;` - 查看下载记录

---

## ⚠️ 问题排查

### 如果遇到问题：

#### 构建失败
- [ ] 检查本地 `npm run build` 是否通过
- [ ] 查看 FaaS 构建日志
- [ ] 确认 Node.js 版本兼容

#### 运行时错误
- [ ] 检查环境变量是否全部配置
- [ ] 查看应用日志（FaaS 控制台 -> 日志服务）
- [ ] 确认数据库连接正常

#### 数据库连接失败
- [ ] 确认 DATABASE_URL 格式正确
- [ ] 检查数据库权限是否已审批
- [ ] 联系之奥确认白名单配置

#### OSS 上传失败
- [ ] 检查 OSS 密钥是否正确
- [ ] 确认 Bucket 存在且有权限
- [ ] 使用 ossutil 测试连接

---

## 📊 上线后监控

### 每日检查
- [ ] 查看错误日志
- [ ] 检查 HTTP 状态码分布
- [ ] 关注用户反馈

### 每周检查
- [ ] 统计数据（新增用户、技能包、下载量）
- [ ] 性能指标（响应时间、错误率）
- [ ] 资源使用（CPU、内存）

---

## 🎉 上线完成

当所有检查项都完成后：

- [ ] 通知团队成员平台已上线
- [ ] 分享访问地址
- [ ] 收集用户反馈
- [ ] 规划后续迭代

---

**部署负责人**：龚艳 (尚凡)  
**审批人**：赵鸿刚 (之奥)  
**预计耗时**：30-60 分钟（不含审批等待时间）
