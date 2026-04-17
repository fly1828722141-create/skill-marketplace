'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { message } from 'antd';
import { formatNumber } from '@/lib/utils';

interface DashboardData {
  range: {
    days: number;
    startAt: string;
    endAt: string;
  };
  overview: {
    totalEvents: number;
    uniqueVisitors: number;
    pageViews: number;
    logins: number;
    downloads: number;
    uploads: number;
    reviewSubmits: number;
    reviewLikes: number;
  };
  site: {
    totalSkills: number;
    totalUsers: number;
    totalDownloads: number;
    totalViews: number;
  };
  topEvents: Array<{
    eventName: string;
    count: number;
  }>;
  moduleUsage: Array<{
    module: string;
    count: number;
  }>;
  topCategories: Array<{
    categoryId: string | null;
    categoryName: string;
    count: number;
  }>;
  categoryTrends: Array<{
    categoryId: string;
    categoryName: string;
    points: Array<{
      date: string;
      count: number;
    }>;
  }>;
  activeUsers: Array<{
    userId: string;
    name: string;
    department?: string | null;
    eventCount: number;
  }>;
  trends: Array<{
    date: string;
    events: number;
    pageViews: number;
    downloads: number;
  }>;
  topSkills: Array<{
    id: string;
    title: string;
    downloadCount: number;
    viewCount: number;
    category?: {
      id: string;
      name: string;
    } | null;
  }>;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchProviders() {
      try {
        const response = await fetch('/api/auth/providers', { cache: 'no-store' });
        const providers = await response.json();
        if (!mounted) return;
        setGoogleEnabled(Boolean(providers?.google));
      } catch (error) {
        if (!mounted) return;
        setGoogleEnabled(false);
      }
    }

    fetchProviders();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function fetchDashboard() {
      try {
        setLoading(true);
        const response = await fetch(`/api/analytics/dashboard?days=${days}`, {
          cache: 'no-store',
        });
        const result = await response.json();

        if (!mounted) return;

        if (!response.ok || !result.success) {
          throw new Error(result.error || '加载看板失败');
        }

        setData(result.data);
      } catch (error: any) {
        console.error('加载看板失败:', error);
        message.error(error.message || '加载看板失败');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    if (googleEnabled === false || session?.user) {
      fetchDashboard();
    }

    const timer = setInterval(() => {
      if (googleEnabled === false || session?.user) {
        fetchDashboard();
      }
    }, 30000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [days, session?.user, googleEnabled]);

  if (status === 'loading' || googleEnabled === null) {
    return <div className="loading-page">加载中...</div>;
  }

  if (googleEnabled && !session?.user) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-card" style={{ textAlign: 'center' }}>
          <h2>请先登录后查看数据看板</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => router.push('/login')}
          >
            使用 Google 登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>数据看板</h1>
        <div className="dashboard-actions">
          <label htmlFor="days">统计窗口</label>
          <select
            id="days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="input"
            style={{ maxWidth: 140 }}
          >
            <option value={1}>最近 1 天</option>
            <option value={7}>最近 7 天</option>
            <option value={30}>最近 30 天</option>
            <option value={90}>最近 90 天</option>
          </select>
        </div>
      </div>

      {loading || !data ? (
        <div className="loading-page">看板加载中...</div>
      ) : (
        <>
          <div className="dashboard-grid">
            <StatCard title="总事件数" value={data.overview.totalEvents} />
            <StatCard title="独立访客" value={data.overview.uniqueVisitors} />
            <StatCard title="页面访问" value={data.overview.pageViews} />
            <StatCard title="登录次数" value={data.overview.logins} />
            <StatCard title="Skill 上传" value={data.overview.uploads} />
            <StatCard title="下载点击" value={data.overview.downloads} />
            <StatCard title="评价提交" value={data.overview.reviewSubmits} />
            <StatCard title="评价点赞" value={data.overview.reviewLikes} />
          </div>

          <div className="dashboard-grid">
            <StatCard title="总 Skill 数" value={data.site.totalSkills} />
            <StatCard title="总用户数" value={data.site.totalUsers} />
            <StatCard title="累计下载" value={data.site.totalDownloads} />
            <StatCard title="累计浏览" value={data.site.totalViews} />
          </div>

          <section className="dashboard-card">
            <h3>热门事件 Top 10</h3>
            <SimpleTable
              headers={['事件名', '次数']}
              rows={data.topEvents.map((item) => [item.eventName, formatNumber(item.count)])}
            />
          </section>

          <section className="dashboard-card">
            <h3>模块使用 Top 10</h3>
            <SimpleTable
              headers={['模块', '次数']}
              rows={data.moduleUsage.map((item) => [item.module, formatNumber(item.count)])}
            />
          </section>

          <section className="dashboard-card">
            <h3>分类点击 Top 10</h3>
            <SimpleTable
              headers={['分类', '次数']}
              rows={data.topCategories.map((item) => [
                item.categoryName,
                formatNumber(item.count),
              ])}
            />
          </section>

          <section className="dashboard-card">
            <h3>活跃用户 Top 10</h3>
            <SimpleTable
              headers={['用户', '部门', '事件次数']}
              rows={data.activeUsers.map((item) => [
                item.name,
                item.department || '-',
                formatNumber(item.eventCount),
              ])}
            />
          </section>

          <section className="dashboard-card">
            <h3>分类趋势 Top 5</h3>
            <SimpleTable
              headers={['分类', '窗口总点击', '近 7 天']}
              rows={data.categoryTrends.map((item) => {
                const total = item.points.reduce((sum, point) => sum + point.count, 0);
                const last7 = item.points
                  .slice(-7)
                  .reduce((sum, point) => sum + point.count, 0);
                return [
                  item.categoryName,
                  formatNumber(total),
                  formatNumber(last7),
                ];
              })}
            />
          </section>

          <section className="dashboard-card">
            <h3>下载榜单 Top 5</h3>
            <SimpleTable
              headers={['Skill', '分类', '下载', '浏览']}
              rows={data.topSkills.map((item) => [
                item.title,
                item.category?.name || '未分类',
                formatNumber(item.downloadCount),
                formatNumber(item.viewCount),
              ])}
            />
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="dashboard-card stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{formatNumber(value)}</div>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  if (rows.length === 0) {
    return <div className="empty-state">暂无数据</div>;
  }

  return (
    <div className="table-wrap">
      <table className="dashboard-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((column, colIndex) => (
                <td key={colIndex}>{column}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
