'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ManagementCenterHeader from '@/components/management-center-header';
import { isDashboardOwnerEmail } from '@/lib/dashboard-access';
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
  degraded?: boolean;
  degradedReasons?: string[];
}

const EVENT_NAME_LABELS: Record<string, string> = {
  page_view: '页面访问',
  user_sign_in: '用户登录',
  skill_detail_open: '打开技能详情',
  skill_upload_success: '技能上传成功',
  skill_download_click: '技能下载点击',
  skill_search: '技能搜索',
  category_click: '分类点击',
  review_submit_success: '评价提交成功',
  review_like_toggle: '评价点赞切换',
};

const MODULE_LABELS: Record<string, string> = {
  navigation: '导航栏',
  home: '首页',
  upload: '上传页',
  review: '评价区',
  auth: '登录模块',
  'skills-page': '技能列表页',
  'skill-detail': '技能详情页',
  dashboard: '管理中心',
  unknown: '未知模块',
};

function toZhEventName(eventName: string) {
  return EVENT_NAME_LABELS[eventName] || '其他事件';
}

function toZhModuleName(moduleName: string) {
  return MODULE_LABELS[moduleName] || '其他模块';
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isDashboardOwner = isDashboardOwnerEmail(session?.user?.email);

  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

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
          throw new Error(result.error || '加载数据中心失败');
        }

        setData(result.data);
        setFetchError(null);
      } catch (error: any) {
        console.error('加载数据中心失败:', error);
        if (!mounted) return;
        setFetchError(error?.message || '加载数据中心失败');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    if (isDashboardOwner) {
      void fetchDashboard();
    }

    const timer = setInterval(() => {
      if (isDashboardOwner) {
        void fetchDashboard();
      }
    }, 30000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [days, isDashboardOwner, reloadNonce]);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || !isDashboardOwner) {
      router.replace('/');
    }
  }, [isDashboardOwner, router, session?.user, status]);

  if (status === 'loading') {
    return <div className="loading-page">加载中...</div>;
  }

  if (!session?.user || !isDashboardOwner) {
    return <div className="loading-page">页面跳转中...</div>;
  }

  return (
    <div className="dashboard-page management-center-page">
      <ManagementCenterHeader
        sectionTitle="数据中心"
        sectionDescription="监控站点访问、行为热点与业务活跃度，支持 1/7/30/90 天窗口快速切换。"
        actions={
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
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loading}
              onClick={() => setReloadNonce((value) => value + 1)}
            >
              {loading ? '刷新中...' : '立即刷新'}
            </button>
          </div>
        }
      />

      {fetchError ? (
        <section className="dashboard-card management-notice management-notice-danger">
          <strong>数据中心刷新失败</strong>
          <p>
            {fetchError}
            {data ? '，当前展示的是最近一次成功加载的数据。' : '，请稍后点击刷新重试。'}
          </p>
        </section>
      ) : null}

      {data?.degraded ? (
        <section className="dashboard-card management-notice management-notice-warning">
          <strong>数据中心已降级展示</strong>
          <p>当前存在数据库波动，部分统计暂时为默认值，系统会自动重试恢复。</p>
        </section>
      ) : null}

      {loading && !data ? (
        <div className="loading-page">数据中心加载中...</div>
      ) : !data ? (
        <section className="dashboard-card management-surface">
          <h3>暂无可用数据</h3>
          <p className="dashboard-manage-tip">
            当前未拉取到看板数据，请点击上方“立即刷新”重试。
          </p>
        </section>
      ) : (
        <>
          <div className="dashboard-grid management-kpi-grid">
            <StatCard title="总事件数" value={data.overview.totalEvents} />
            <StatCard title="独立访客" value={data.overview.uniqueVisitors} />
            <StatCard title="页面访问" value={data.overview.pageViews} />
            <StatCard title="登录次数" value={data.overview.logins} />
            <StatCard title="技能上传" value={data.overview.uploads} />
            <StatCard title="下载点击" value={data.overview.downloads} />
            <StatCard title="评价提交" value={data.overview.reviewSubmits} />
            <StatCard title="评价点赞" value={data.overview.reviewLikes} />
          </div>

          <div className="dashboard-grid management-kpi-grid">
            <StatCard title="总技能数" value={data.site.totalSkills} />
            <StatCard title="总用户数" value={data.site.totalUsers} />
            <StatCard title="累计下载" value={data.site.totalDownloads} />
            <StatCard title="累计浏览" value={data.site.totalViews} />
          </div>

          <section className="dashboard-card management-surface">
            <h3>热门事件 Top 10</h3>
            <SimpleTable
              headers={['事件名', '次数']}
              rows={data.topEvents.map((item) => [toZhEventName(item.eventName), formatNumber(item.count)])}
            />
          </section>

          <section className="dashboard-card management-surface">
            <h3>模块使用 Top 10</h3>
            <SimpleTable
              headers={['模块', '次数']}
              rows={data.moduleUsage.map((item) => [toZhModuleName(item.module), formatNumber(item.count)])}
            />
          </section>

          <section className="dashboard-card management-surface">
            <h3>分类点击 Top 10</h3>
            <SimpleTable
              headers={['分类', '次数']}
              rows={data.topCategories.map((item) => [item.categoryName, formatNumber(item.count)])}
            />
          </section>

          <section className="dashboard-card management-surface">
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

          <section className="dashboard-card management-surface">
            <h3>分类趋势 Top 5</h3>
            <SimpleTable
              headers={['分类', '窗口总点击', '近 7 天']}
              rows={data.categoryTrends.map((item) => {
                const total = item.points.reduce((sum, point) => sum + point.count, 0);
                const last7 = item.points.slice(-7).reduce((sum, point) => sum + point.count, 0);
                return [item.categoryName, formatNumber(total), formatNumber(last7)];
              })}
            />
          </section>

          <section className="dashboard-card management-surface">
            <h3>下载榜单 Top 5</h3>
            <SimpleTable
              headers={['技能名称', '分类', '下载', '浏览']}
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
    <div className="dashboard-card stat-card management-stat-card">
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
      <table className="dashboard-table management-table">
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
