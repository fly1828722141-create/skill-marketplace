'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { message } from 'antd';
import { isDashboardOwnerEmail } from '@/lib/dashboard-access';
import { formatDateTime, formatNumber } from '@/lib/utils';

type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'published' | 'failed';
type CandidateFilter = CandidateStatus | 'all';

interface IngestCandidate {
  id: string;
  source: string;
  sourceId: string;
  dedupeKey: string;
  status: CandidateStatus;
  autoDecision?: string | null;
  autoDecisionNote?: string | null;
  failureReason?: string | null;
  repoFullName: string;
  repoUrl: string;
  sourceUrl: string;
  installCommand: string;
  title: string;
  summary?: string | null;
  description?: string | null;
  tags: string[];
  licenseKey?: string | null;
  language?: string | null;
  pushedAt?: string | null;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  archived: boolean;
  disabled: boolean;
  categoryId?: string | null;
  publishedSkillId?: string | null;
  publishedAt?: string | null;
  discoveredAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

interface CandidateListResult {
  items: IngestCandidate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusSummary: Record<string, number>;
}

const FILTERS: Array<{ key: CandidateFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'approved', label: '已通过' },
  { key: 'published', label: '已发布' },
  { key: 'failed', label: '失败' },
  { key: 'rejected', label: '已拒绝' },
];

const STATUS_LABELS: Record<CandidateStatus, string> = {
  pending: '待处理',
  approved: '已通过',
  rejected: '已拒绝',
  published: '已发布',
  failed: '失败',
};

function formatRelativeStatus(candidate: IngestCandidate): string {
  if (candidate.archived) return '仓库已归档';
  if (candidate.disabled) return '仓库已禁用';
  if (candidate.publishedSkillId) return `Skill: ${candidate.publishedSkillId.slice(0, 8)}`;
  if (candidate.failureReason) return candidate.failureReason;
  if (candidate.autoDecisionNote) return candidate.autoDecisionNote;
  return '-';
}

function buildStatusClass(status: CandidateStatus): string {
  return `ingest-status-badge ingest-status-${status}`;
}

export default function IngestDashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isDashboardOwner = isDashboardOwnerEmail(session?.user?.email);

  const [filter, setFilter] = useState<CandidateFilter>('pending');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [runningDiscover, setRunningDiscover] = useState(false);
  const [runningPublish, setRunningPublish] = useState(false);
  const [reviewingId, setReviewingId] = useState('');
  const [candidates, setCandidates] = useState<IngestCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusSummary, setStatusSummary] = useState<Record<string, number>>({});

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || !isDashboardOwner) {
      router.replace('/');
    }
  }, [isDashboardOwner, router, session?.user, status]);

  useEffect(() => {
    if (!isDashboardOwner) return;
    void loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDashboardOwner, filter, page, pageSize]);

  const summaryCards = useMemo(
    () => [
      {
        key: 'total',
        title: '候选总数',
        value: total,
      },
      {
        key: 'pending',
        title: '待处理',
        value: statusSummary.pending || 0,
      },
      {
        key: 'approved',
        title: '已通过',
        value: statusSummary.approved || 0,
      },
      {
        key: 'published',
        title: '已发布',
        value: statusSummary.published || 0,
      },
      {
        key: 'failed',
        title: '失败',
        value: statusSummary.failed || 0,
      },
      {
        key: 'rejected',
        title: '已拒绝',
        value: statusSummary.rejected || 0,
      },
    ],
    [statusSummary, total]
  );

  async function loadCandidates() {
    try {
      setLoading(true);
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (filter !== 'all') {
        query.set('status', filter);
      }

      const response = await fetch(`/api/ingest/candidates?${query.toString()}`, {
        cache: 'no-store',
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '加载候选池失败');
      }

      const data = (result.data || {}) as CandidateListResult;
      setCandidates(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
      setTotalPages(Math.max(1, Number(data.totalPages || 1)));
      setStatusSummary(data.statusSummary || {});
    } catch (error: any) {
      console.error('加载候选池失败:', error);
      message.error(error?.message || '加载候选池失败');
    } finally {
      setLoading(false);
    }
  }

  async function runDiscoveryNow() {
    setRunningDiscover(true);
    try {
      const response = await fetch('/api/ingest/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runPublishWorker: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '执行自动收录失败');
      }

      const discover = result?.data?.discover;
      const publish = result?.data?.publish;
      message.success(
        `收录完成：扫描 ${discover?.scannedCount ?? 0}，新增 ${discover?.insertedCount ?? 0}，发布 ${publish?.publishedCount ?? 0}`
      );
      setPage(1);
      await loadCandidates();
    } catch (error: any) {
      console.error('执行自动收录失败:', error);
      message.error(error?.message || '执行自动收录失败');
    } finally {
      setRunningDiscover(false);
    }
  }

  async function runPublishWorkerNow() {
    setRunningPublish(true);
    try {
      const response = await fetch('/api/ingest/publish-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onlyApproved: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '执行发布任务失败');
      }

      const data = result.data || {};
      message.success(
        `发布任务完成：待处理 ${data.selectedCount ?? 0}，成功 ${data.publishedCount ?? 0}，失败 ${data.failedCount ?? 0}`
      );
      await loadCandidates();
    } catch (error: any) {
      console.error('执行发布任务失败:', error);
      message.error(error?.message || '执行发布任务失败');
    } finally {
      setRunningPublish(false);
    }
  }

  async function reviewCandidate(
    candidate: IngestCandidate,
    action: 'approve' | 'reject' | 'retry',
    options?: { publishNow?: boolean; reason?: string }
  ) {
    setReviewingId(candidate.id);
    try {
      const response = await fetch(`/api/ingest/candidates/${encodeURIComponent(candidate.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          publishNow: options?.publishNow,
          reason: options?.reason,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '审批操作失败');
      }

      if (action === 'approve') {
        message.success(options?.publishNow === false ? '候选已通过审批' : '候选已通过并触发发布');
      } else if (action === 'reject') {
        message.success('候选已拒绝');
      } else {
        message.success('候选已重置为待处理');
      }

      await loadCandidates();
    } catch (error: any) {
      console.error('审批操作失败:', error);
      message.error(error?.message || '审批操作失败');
    } finally {
      setReviewingId('');
    }
  }

  function promptRejectReason(candidate: IngestCandidate) {
    const reason = window.prompt(`请输入拒绝原因（可选）\n${candidate.repoFullName}`, '与当前站点定位不匹配');
    if (reason === null) return;
    void reviewCandidate(candidate, 'reject', { reason });
  }

  if (status === 'loading') {
    return <div className="loading-page">加载中...</div>;
  }

  if (!session?.user || !isDashboardOwner) {
    return <div className="loading-page">页面跳转中...</div>;
  }

  return (
    <div className="dashboard-page ingest-page">
      <div className="dashboard-header ingest-header">
        <div>
          <h1>自动收录审核面板</h1>
          <p className="dashboard-manage-tip">
            管理开源 Skill 候选池，执行自动收录、审批发布与失败重试。
          </p>
        </div>
        <div className="dashboard-manage-actions ingest-header-actions">
          <Link href="/dashboard" className="btn btn-secondary">
            返回看板
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadCandidates()}
            disabled={loading}
          >
            {loading ? '刷新中...' : '刷新候选池'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void runPublishWorkerNow()}
            disabled={runningPublish}
          >
            {runningPublish ? '发布中...' : '发布已审批'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runDiscoveryNow()}
            disabled={runningDiscover}
          >
            {runningDiscover ? '收录中...' : '立即收录'}
          </button>
        </div>
      </div>

      <section className="dashboard-card ingest-summary-grid">
        {summaryCards.map((item) => (
          <div key={item.key} className="ingest-summary-item">
            <span>{item.title}</span>
            <strong>{formatNumber(item.value)}</strong>
          </div>
        ))}
      </section>

      <section className="dashboard-card">
        <div className="ingest-filter-tabs" role="tablist" aria-label="候选状态筛选">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`ingest-filter-tab ${filter === item.key ? 'active' : ''}`}
              onClick={() => {
                setFilter(item.key);
                setPage(1);
              }}
            >
              {item.label}
              <span>
                {formatNumber(item.key === 'all' ? total : statusSummary[item.key] || 0)}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-page">候选池加载中...</div>
        ) : candidates.length === 0 ? (
          <div className="empty-state">当前筛选下暂无候选 Skill</div>
        ) : (
          <div className="table-wrap">
            <table className="dashboard-table ingest-table">
              <thead>
                <tr>
                  <th>Skill / 仓库</th>
                  <th>指标</th>
                  <th>状态说明</th>
                  <th>发现时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => {
                  const statusText = STATUS_LABELS[candidate.status] || candidate.status;
                  const isBusy = reviewingId === candidate.id;

                  return (
                    <tr key={candidate.id}>
                      <td>
                        <div className="ingest-skill-title">{candidate.title}</div>
                        <div className="ingest-repo-cell">
                          <a
                            href={candidate.repoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ingest-repo-link"
                          >
                            {candidate.repoFullName}
                          </a>
                          <span className={buildStatusClass(candidate.status)}>{statusText}</span>
                        </div>
                        {candidate.summary ? (
                          <p className="ingest-summary-text">{candidate.summary}</p>
                        ) : null}
                        <div className="ingest-command">{candidate.installCommand}</div>
                      </td>
                      <td>
                        <div className="ingest-metrics">
                          <span>⭐ {formatNumber(candidate.stars || 0)}</span>
                          <span>Fork {formatNumber(candidate.forks || 0)}</span>
                          <span>Issue {formatNumber(candidate.openIssues || 0)}</span>
                          <span>语言 {candidate.language || '未知'}</span>
                          <span>License {candidate.licenseKey || '未知'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="ingest-note">{formatRelativeStatus(candidate)}</div>
                      </td>
                      <td>
                        <div className="ingest-time-cell">
                          <span>发现：{formatDateTime(candidate.discoveredAt)}</span>
                          <span>更新：{formatDateTime(candidate.updatedAt)}</span>
                          {candidate.publishedAt ? (
                            <span>发布：{formatDateTime(candidate.publishedAt)}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="dashboard-inline-actions ingest-actions">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void reviewCandidate(candidate, 'approve', { publishNow: true })}
                            disabled={
                              isBusy ||
                              candidate.status === 'published' ||
                              candidate.status === 'rejected'
                            }
                          >
                            {isBusy ? '处理中...' : '通过并发布'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void reviewCandidate(candidate, 'approve', { publishNow: false })}
                            disabled={
                              isBusy ||
                              candidate.status === 'published' ||
                              candidate.status === 'rejected'
                            }
                          >
                            仅通过
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => promptRejectReason(candidate)}
                            disabled={isBusy || candidate.status === 'published'}
                          >
                            拒绝
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void reviewCandidate(candidate, 'retry')}
                            disabled={isBusy}
                          >
                            重试
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="ingest-pagination">
          <span>
            第 {page} / {Math.max(totalPages, 1)} 页 · 共 {formatNumber(total)} 条
          </span>
          <div className="dashboard-inline-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              上一页
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              下一页
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
