import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="info-page">
      <section className="info-card">
        <h1>关于我们</h1>
        <p>
          有求必应屋是一个面向 AI Skill 分享与协作的社区平台，支持上传、浏览、下载与交流。
          我们希望把零散的优质 Skill 聚合起来，降低大家发现和复用能力的成本。
        </p>
        <ul>
          <li>开放分享：支持个人与团队发布 Skill。</li>
          <li>真实反馈：通过评价、点赞与讨论持续优化内容质量。</li>
          <li>可持续运营：以社区共建方式迭代平台能力。</li>
        </ul>
        <div className="info-actions">
          <Link href="/skills" className="btn btn-primary">
            浏览 Skill
          </Link>
          <Link href="/upload" className="btn btn-secondary">
            上传 Skill
          </Link>
        </div>
      </section>
    </div>
  );
}
