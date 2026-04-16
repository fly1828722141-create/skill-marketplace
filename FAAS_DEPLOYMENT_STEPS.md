# 🚀 Skill Marketplace FaaS 部署完整指南

## ✅ 构建已完成

项目已经成功构建，生产版本已生成在 `.next/` 目录中。

---

## 📦 部署文件清单

### 必须上传到 FaaS 平台的文件：

1. **`.next/`** - Next.js 构建产物（核心）
2. **`node_modules/`** - Node.js 依赖包
3. **`package.json`** - 项目配置和依赖定义
4. **`public/`** - 静态资源（如果有）

### 建议打包方式：

```bash
cd /Users/shangfan/.real/users/user-b59afc0b98ccff2a173dd4c320966513/workspace/skill-marketplace

# 方案一：直接上传整个项目目录（推荐）
# FaaS 平台会自动识别并部署

# 方案二：压缩为 zip 包
zip -r skill-marketplace-deploy.zip \
  .next/ \
  node_modules/ \
  public/ \
  package.json \
  next.config.js

# 文件大小预估：约 150-200MB
```

---

## 🔧 FaaS 控制台操作步骤

### 步骤 1：新建变更单

1. 访问阿里云 FaaS 控制台：`https://cd.faas.alibaba-inc.com/unite/micro/apps`
2. 找到你的应用：**`skill-youqiubiyingwu`**
3. 点击 **"新建变更"** 按钮
4. 选择变更类型：**代码部署**

### 步骤 2：上传代码

有两种上传方式：

#### 方式 A：直接上传（推荐小项目）
- 将整个 `skill-marketplace/` 目录拖拽到上传区域
- 或选择上传 `.zip` 压缩包

#### 方式 B：Git 关联（推荐持续集成）
- 如果选择了"创建仓库"接入方式，FaaS 会自动创建 Git 仓库
- 执行以下命令推送代码：

```bash
# 配置 Git 远程仓库（替换为你的实际仓库地址）
git remote add faas <faas-git-url>

# 推送代码
git push faas main
```

### 步骤 3：配置环境变量

在 FaaS 控制台的 **"环境设置"** 页面，配置以下变量：

#### 预发环境（pre-release）

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DATABASE_URL` | `postgresql://...` | FaaS 自动注入的数据库连接串 |
| `NEXTAUTH_SECRET` | `<随机字符串>` | 使用 `openssl rand -base64 32` 生成 |
| `NEXTAUTH_URL` | `https://<预发域名>` | FaaS 分配的预发环境域名 |
| `BUC_APP_KEY` | `<之奥提供>` | BUC 登录应用 Key |
| `BUC_APP_SECRET` | `<之奥提供>` | BUC 登录应用 Secret |
| `OSS_ACCESS_KEY_ID` | `<阿里云 OSS>` | OSS 访问密钥 ID |
| `OSS_ACCESS_KEY_SECRET` | `<阿里云 OSS>` | OSS 访问密钥 Secret |
| `OSS_BUCKET` | `skill-marketplace-test` | 测试 Bucket 名称 |
| `OSS_REGION` | `oss-cn-hangzhou` | OSS 地域 |

#### 正式环境（production）

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DATABASE_URL` | `postgresql://...` | FaaS 自动注入的生产数据库 |
| `NEXTAUTH_SECRET` | `<新的随机字符串>` | 生产环境必须使用独立 Secret |
| `NEXTAUTH_URL` | `https://<正式域名>` | FaaS 分配的正式环境域名 |
| `BUC_APP_KEY` | `<之奥提供>` | 同预发环境 |
| `BUC_APP_SECRET` | `<之奥提供>` | 同预发环境 |
| `OSS_ACCESS_KEY_ID` | `<阿里云 OSS>` | 生产 OSS 密钥 |
| `OSS_ACCESS_KEY_SECRET` | `<阿里云 OSS>` | 生产 OSS 密钥 |
| `OSS_BUCKET` | `skill-marketplace-prod` | 生产 Bucket 名称 |
| `OSS_REGION` | `oss-cn-hangzhou` | OSS 地域 |

### 步骤 4：提交审批

1. 填写变更描述：
   ```
   【首次部署】Skill Marketplace 技能分享平台 v1.0.0
   - 功能：用户上传/下载技能包、搜索筛选、统计展示
   - 技术栈：Next.js 14 + TypeScript + Prisma + PostgreSQL
   - 测试情况：本地测试通过，数据库初始化完成
   ```

2. 选择审批人：**之奥 - 赵鸿刚**

3. 提交审批

### 步骤 5：等待部署

- 审批通过后，FaaS 会自动执行部署
- 预计耗时：3-5 分钟
- 部署完成后会显示访问地址

---

## 🗄️ 数据库权限申请

由于这是首次部署，需要申请数据库访问权限：

### 申请材料准备

1. **应用信息**
   - 应用名称：`skill-youqiubiyingwu`
   - 应用类型：函数组应用
   - 负责人：龚艳 (尚凡) - 390599

2. **数据库需求**
   - 数据库类型：PostgreSQL
   - 表结构：User, Skill, Download, Comment
   - 预计数据量：< 10GB（初期）
   - QPS 预估：< 100

3. **审批流程**
   - 审批人：之奥 - 赵鸿刚
   - 抄送：数据库管理团队

### 申请模板

```
【数据库权限申请】Skill Marketplace 技能分享平台

申请人：龚艳 (尚凡) - 飞猪 - 大住宿 - 经营效能部
应用名称：skill-youqiubiyingwu
应用类型：函数组应用（Next.js 14）

数据库需求：
- 类型：PostgreSQL
- 用途：存储用户信息、技能包元数据、下载记录
- 表结构：4 张表（User, Skill, Download, Comment）
- 预计容量：初期 < 10GB
- 访问频率：QPS < 100

业务说明：
技能分享平台，支持内部员工上传和下载技术技能包，促进知识共享。

请审批，谢谢！
```

---

## 🧪 部署后验证

部署完成后，按以下步骤验证：

### 1. 访问首页
- 打开 FaaS 提供的访问 URL
- 检查页面是否正常加载
- 验证统计卡片显示（总技能包数、总下载次数等）

### 2. 测试登录
- 点击"登录"按钮
- 验证 BUC 单点登录是否正常工作
- 登录后应显示用户头像和昵称

### 3. 测试上传
- 进入"上传技能包"页面
- 上传一个测试文件（.zip 格式）
- 填写标题、描述、标签
- 提交后检查是否出现在技能库列表

### 4. 测试下载
- 在技能库列表选择一个技能包
- 进入详情页
- 点击"立即下载"
- 验证下载次数是否正确增加

### 5. 检查数据库
```sql
-- 查看用户数
SELECT COUNT(*) FROM users;

-- 查看技能包数
SELECT COUNT(*) FROM skills;

-- 查看下载记录
SELECT * FROM downloads LIMIT 10;
```

---

## ⚠️ 常见问题排查

### 问题 1：构建失败
**现象**：FaaS 控制台显示"构建失败"

**排查步骤**：
1. 检查 `package.json` 中的依赖是否完整
2. 确认 Node.js 版本 >= 16.0.0
3. 查看构建日志，定位具体错误

**解决方案**：
```bash
# 本地重新构建测试
npm run build

# 如果有错误，修复后重新上传
```

### 问题 2：环境变量缺失
**现象**：运行时提示"DATABASE_URL is not defined"

**排查步骤**：
1. 检查 FaaS 控制台是否配置了所有必需的环境变量
2. 确认预发和正式环境都分别配置

**解决方案**：
- 在 FaaS 控制台 -> 环境设置 -> 添加缺失的变量
- 重新部署应用

### 问题 3：数据库连接失败
**现象**：API 调用返回"Database connection error"

**排查步骤**：
1. 检查 DATABASE_URL 格式是否正确
2. 确认数据库权限是否已审批通过
3. 查看 FaaS 日志中的详细错误信息

**解决方案**：
- 联系之奥确认数据库权限状态
- 检查数据库白名单是否包含 FaaS IP

### 问题 4：OSS 上传失败
**现象**：上传文件时提示"OSS access denied"

**排查步骤**：
1. 检查 OSS_ACCESS_KEY_ID 和 SECRET 是否正确
2. 确认 OSS Bucket 是否存在
3. 验证 RAM 角色是否有上传权限

**解决方案**：
```bash
# 使用 ossutil 测试连接
ossutil ls oss://skill-marketplace-test
```

---

## 📊 监控与运维

### 日常监控指标

1. **应用健康度**
   - HTTP 状态码分布（2xx/4xx/5xx）
   - 平均响应时间
   - 错误率

2. **业务指标**
   - 日活跃用户数（DAU）
   - 新增技能包数量
   - 下载次数统计

3. **资源使用**
   - CPU 使用率
   - 内存使用率
   - 磁盘空间

### 日志查看

在 FaaS 控制台 -> 应用详情 -> 日志服务 中查看：
- 访问日志（Access Log）
- 应用日志（Application Log）
- 错误日志（Error Log）

### 定期维护

- **每周**：检查错误日志，处理异常
- **每月**：清理过期技能包（如需要）
- **每季度**：更新依赖包，修复安全漏洞

---

## 🎯 后续优化建议

### 短期（1-2 周）
- [ ] 添加更多测试技能包（至少 20 个）
- [ ] 完善搜索和筛选功能
- [ ] 添加用户个人主页

### 中期（1 个月）
- [ ] 实现评论和评分系统
- [ ] 添加技能包版本管理
- [ ] 集成钉钉消息通知

### 长期（3 个月+）
- [ ] 推荐算法（基于用户行为）
- [ ] 技能学习路径规划
- [ ] 数据统计分析报表

---

## 📞 联系方式

如有问题，请联系：
- **技术支持**：龚艳 (尚凡) - gongyan.gy@alibaba-inc.com
- **审批人**：赵鸿刚 (之奥) - zhaohonggang.zhg@alibaba-inc.com

---

**祝部署顺利！** 🚀
