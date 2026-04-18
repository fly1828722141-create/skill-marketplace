export default function DocsPage() {
  return (
    <div className="info-page">
      <section className="info-card">
        <h1>开发者文档</h1>
        <p>
          平台当前采用 Next.js + Prisma + PostgreSQL 架构，前后端一体部署，支持实时数据更新。
        </p>
        <h3>核心模块</h3>
        <ul>
          <li>Skill 管理：上传、编辑、删除、浏览、下载。</li>
          <li>权限系统：Google 登录 + 作者/管理员权限控制。</li>
          <li>数据看板：按事件统计浏览、下载、上传、互动等指标。</li>
          <li>意见反馈：发帖、回复、点赞/点踩、讨论协作。</li>
        </ul>
        <h3>主要接口</h3>
        <ul>
          <li>`GET /api/skills`：获取技能列表</li>
          <li>`GET /api/skills/[id]`：获取技能详情</li>
          <li>`POST /api/upload`：上传技能</li>
          <li>`GET/POST /api/feedback/threads`：反馈帖子列表与发帖</li>
          <li>`POST /api/feedback/threads/[id]/vote`：帖子赞踩</li>
          <li>`POST /api/feedback/threads/[id]/replies`：回复帖子</li>
        </ul>
      </section>
    </div>
  );
}
