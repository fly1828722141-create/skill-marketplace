import Link from 'next/link';

export default function GuidePage() {
  return (
    <div className="info-page">
      <section className="info-card">
        <h1>使用指南</h1>
        <ol>
          <li>登录账号：使用 Google 登录后即可上传、下载与互动。</li>
          <li>浏览技能：在首页数字人入口和技能库按数字人、关键词、排序筛选。</li>
          <li>查看详情：进入 Skill 详情页，复制安装命令或打开链接。</li>
          <li>参与评价：在详情页进行评分、评论与点赞交流。</li>
          <li>上传分享：到上传页填写标题、简介、类型并提交。</li>
          <li>参与社区：在意见反馈区发帖、回复、点赞或点踩。</li>
        </ol>
        <div className="info-actions">
          <Link href="/feedback" className="btn btn-primary">
            进入反馈区
          </Link>
          <Link href="/skills?mine=1" className="btn btn-secondary">
            查看我的 Skill
          </Link>
        </div>
      </section>
    </div>
  );
}
