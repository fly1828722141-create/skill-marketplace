'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { message } from 'antd';
import ManagementCenterHeader from '@/components/management-center-header';
import { isDashboardOwnerEmail } from '@/lib/dashboard-access';
import { formatDateTime, formatNumber } from '@/lib/utils';

type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'published' | 'failed';
type CandidateFilter = CandidateStatus | 'all';
type CandidateSortBy = 'qualityScore' | 'discoveredAt' | 'updatedAt' | 'stars' | 'forks';
type CandidateSortOrder = 'asc' | 'desc';

interface IngestQualityWeights {
  stars: number;
  forks: number;
  recentActivity: number;
  issueHealth: number;
}

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
  qualityScore?: number;
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
  qualityWeights?: IngestQualityWeights;
  sortBy?: CandidateSortBy;
  sortOrder?: CandidateSortOrder;
}

const FILTERS: Array<{ key: CandidateFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'approved', label: '已通过' },
  { key: 'published', label: '已发布' },
  { key: 'failed', label: '失败' },
  { key: 'rejected', label: '已拒绝' },
];

const SORT_OPTIONS: Array<{ key: CandidateSortBy; label: string }> = [
  { key: 'qualityScore', label: '质量分' },
  { key: 'discoveredAt', label: '发现时间' },
  { key: 'updatedAt', label: '更新时间' },
  { key: 'stars', label: 'Star' },
  { key: 'forks', label: 'Fork' },
];

const STATUS_LABELS: Record<CandidateStatus, string> = {
  pending: '待处理',
  approved: '已通过',
  rejected: '已拒绝',
  published: '已发布',
  failed: '失败',
};

const DEFAULT_WEIGHTS: IngestQualityWeights = {
  stars: 0.45,
  forks: 0.25,
  recentActivity: 0.2,
  issueHealth: 0.1,
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

function normalizeWeights(weights: IngestQualityWeights): IngestQualityWeights {
  const safe = {
    stars: Math.max(0, Number(weights.stars || 0)),
    forks: Math.max(0, Number(weights.forks || 0)),
    recentActivity: Math.max(0, Number(weights.recentActivity || 0)),
    issueHealth: Math.max(0, Number(weights.issueHealth || 0)),
  };

  const total = safe.stars + safe.forks + safe.recentActivity + safe.issueHealth;
  if (total <= 0) return { ...DEFAULT_WEIGHTS };

  return {
    stars: Number((safe.stars / total).toFixed(4)),
    forks: Number((safe.forks / total).toFixed(4)),
    recentActivity: Number((safe.recentActivity / total).toFixed(4)),
    issueHealth: Number((safe.issueHealth / total).toFixed(4)),
  };
}

function formatScore(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return value.toFixed(2);
}

function formatSourceLabel(source: string): string {
  const normalized = String(source || '').trim().toLowerCase();
  if (normalized === 'skills.sh') return 'skills.sh';
  if (normalized === 'github') return 'GitHub';
  return source || '未知来源';
}

export default function IngestDashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isDashboardOwner = isDashboardOwnerEmail(session?.user?.email);

  const [filter, setFilter] = useState<CandidateFilter>('pending');
  const [sortBy, setSortBy] = useState<CandidateSortBy>('qualityScore');
  const [sortOrder, setSortOrder] = useState<CandidateSortOrder>('desc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [runningDiscover, setRunningDiscover] = useState(false);
  const [runningPublish, setRunningPublish] = useState(false);
  const [runningRefreshPublished, setRunningRefreshPublished] = useState(false);
  const [runningRebuild, setRunningRebuild] = useState(false);
  const [runningRecategorize, setRunningRecategorize] = useState(false);
  const [reviewingId, setReviewingId] = useState('');
  const [candidates, setCandidates] = useState<IngestCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusSummary, setStatusSummary] = useState<Record<string, number>>({});
  const [draftWeights, setDraftWeights] = useState<IngestQualityWeights>({ ...DEFAULT_WEIGHTS });
  const [appliedWeights, setAppliedWeights] = useState<IngestQualityWeights>({ ...DEFAULT_WEIGHTS });
  const [serverDefaultWeights, setServerDefaultWeights] = useState<IngestQualityWeights>({
    ...DEFAULT_WEIGHTS,
  });
  const [weightsHydrated, setWeightsHydrated] = useState(false);

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
  }, [
    isDashboardOwner,
    filter,
    sortBy,
    sortOrder,
    page,
    pageSize,
    appliedWeights.stars,
    appliedWeights.forks,
    appliedWeights.recentActivity,
    appliedWeights.issueHealth,
  ]);

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

  const draftWeightSum = useMemo(
    () => draftWeights.stars + draftWeights.forks + draftWeights.recentActivity + draftWeights.issueHealth,
    [draftWeights]
  );

  function updateDraftWeight(key: keyof IngestQualityWeights, value: string) {
    const parsed = Number.parseFloat(value);
    setDraftWeights((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? parsed : 0,
    }));
  }

  function applyWeights() {
    const normalized = normalizeWeights(draftWeights);
    setDraftWeights(normalized);
    setAppliedWeights(normalized);
    setSortBy('qualityScore');
    setSortOrder('desc');
    setPage(1);
  }

  function resetWeightsToServerDefault() {
    setDraftWeights({ ...serverDefaultWeights });
    setAppliedWeights({ ...serverDefaultWeights });
    setSortBy('qualityScore');
    setSortOrder('desc');
    setPage(1);
  }

  async function loadCandidates() {
    try {
      setLoading(true);
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
        weightStars: String(appliedWeights.stars),
        weightForks: String(appliedWeights.forks),
        weightRecentActivity: String(appliedWeights.recentActivity),
        weightIssueHealth: String(appliedWeights.issueHealth),
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

      if (data.qualityWeights) {
        setServerDefaultWeights(data.qualityWeights);
        if (!weightsHydrated) {
          setDraftWeights(data.qualityWeights);
          setAppliedWeights(data.qualityWeights);
          setWeightsHydrated(true);
        }
      }
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
        `收录完成：扫描 ${discover?.scannedCount ?? 0}，过滤 ${discover?.qualityFilteredCount ?? 0}，新增 ${discover?.insertedCount ?? 0}，发布 ${publish?.publishedCount ?? 0}`
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

  async function runRefreshPublishedNow() {
    const confirmed = window.confirm(
      '将全量扫描并刷新站内 Skill 介绍（优先同步自动收录候选信息），是否继续？'
    );
    if (!confirmed) return;

    setRunningRefreshPublished(true);
    try {
      const response = await fetch('/api/ingest/refresh-published', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchSize: 2000,
          fullRefresh: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '刷新已收录介绍失败');
      }

      const data = result.data || {};
      message.success(
        `刷新完成：处理 ${data.selectedCount ?? 0}，更新 ${data.refreshedCount ?? 0}，跳过 ${data.skippedCount ?? 0}，失败 ${data.failedCount ?? 0}`
      );
      await loadCandidates();
    } catch (error: any) {
      console.error('刷新已收录介绍失败:', error);
      message.error(error?.message || '刷新已收录介绍失败');
    } finally {
      setRunningRefreshPublished(false);
    }
  }

  async function runRebuildNow() {
    const confirmed = window.confirm(
      '将删除当前自动收录的历史结果并从 GitHub/外部来源重新发现发布，是否继续？'
    );
    if (!confirmed) return;

    const secondConfirmed = window.confirm('高风险操作：确认执行“重建收录库”？');
    if (!secondConfirmed) return;

    setRunningRebuild(true);
    try {
      const response = await fetch('/api/ingest/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runPublishWorker: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '重建收录库失败');
      }

      const data = result.data || {};
      const discover = data.discover || {};
      const publish = data.publish || {};

      message.success(
        `重建完成：清理 Skill ${data.archivedSkillCount ?? 0}，清空候选 ${data.clearedCandidateCount ?? 0}，发现新增 ${discover.insertedCount ?? 0}，发布 ${publish.publishedCount ?? 0}`
      );

      setPage(1);
      await loadCandidates();
    } catch (error: any) {
      console.error('重建收录库失败:', error);
      message.error(error?.message || '重建收录库失败');
    } finally {
      setRunningRebuild(false);
    }
  }

  async function runRecategorizeNow() {
    setRunningRecategorize(true);
    try {
      const response = await fetch('/api/ingest/recategorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          includeCandidates: true,
          deactivateLegacy: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '批量重分类失败');
      }

      const taxonomy = result?.data?.taxonomy || {};
      const skillsResult = result?.data?.skills || {};
      const candidatesResult = result?.data?.candidates || {};

      message.success(
        `重分类完成：Skill 扫描 ${skillsResult.scanned ?? 0}，更新 ${skillsResult.recategorized ?? 0}；候选池更新 ${candidatesResult.recategorized ?? 0}；停用旧分类 ${taxonomy.deactivatedLegacy ?? 0}`
      );

      setPage(1);
      await loadCandidates();
    } catch (error: any) {
      console.error('批量重分类失败:', error);
      message.error(error?.message || '批量重分类失败');
    } finally {
      setRunningRecategorize(false);
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
    <div className="dashboard-page ingest-page management-center-page">
      <ManagementCenterHeader
        sectionTitle="收录审核台"
        sectionDescription="管理 GitHub 与外部来源候选池，按质量分排序审批，通过后发布到线上。"
        actions={
          <div className="dashboard-inline-actions ingest-header-actions">
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
              onClick={() => void runRefreshPublishedNow()}
              disabled={runningRefreshPublished}
            >
              {runningRefreshPublished ? '全量刷新中...' : '全量刷新已收录介绍'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void runRebuildNow()}
              disabled={runningRebuild}
            >
              {runningRebuild ? '重建中...' : '重建收录库'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void runRecategorizeNow()}
              disabled={runningRecategorize}
            >
              {runningRecategorize ? '重分类中...' : '按新规范重分类'}
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
        }
      />

      <section className="dashboard-card ingest-summary-grid management-surface">
        {summaryCards.map((item) => (
          <div key={item.key} className="ingest-summary-item">
            <span>{item.title}</span>
            <strong>{formatNumber(item.value)}</strong>
          </div>
        ))}
      </section>

      <section className="dashboard-card ingest-score-board management-surface">
        <div className="ingest-score-board-header">
          <div>
            <h3>质量分权重与排序</h3>
            <p>
              质量分 = Star × {appliedWeights.stars.toFixed(2)} + Fork × {appliedWeights.forks.toFixed(2)} +
              活跃度 × {appliedWeights.recentActivity.toFixed(2)} + Issue 健康度 ×{' '}
              {appliedWeights.issueHealth.toFixed(2)}
            </p>
          </div>
          <div className="dashboard-inline-actions">
            <label htmlFor="sortBySelect">排序字段</label>
            <select
              id="sortBySelect"
              className="input"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as CandidateSortBy);
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                setPage(1);
              }}
            >
              {sortOrder === 'desc' ? '降序' : '升序'}
            </button>
          </div>
        </div>

        <div className="ingest-weight-grid">
          <label>
            Star 权重
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              className="input"
              value={draftWeights.stars}
              onChange={(e) => updateDraftWeight('stars', e.target.value)}
            />
          </label>
          <label>
            Fork 权重
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              className="input"
              value={draftWeights.forks}
              onChange={(e) => updateDraftWeight('forks', e.target.value)}
            />
          </label>
          <label>
            活跃度权重
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              className="input"
              value={draftWeights.recentActivity}
              onChange={(e) => updateDraftWeight('recentActivity', e.target.value)}
            />
          </label>
          <label>
            Issue 健康度权重
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              className="input"
              value={draftWeights.issueHealth}
              onChange={(e) => updateDraftWeight('issueHealth', e.target.value)}
            />
          </label>
        </div>

        <div className="ingest-score-actions">
          <span>当前权重和：{draftWeightSum.toFixed(2)}（应用时自动归一化）</span>
          <div className="dashboard-inline-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void runRecategorizeNow()}
              disabled={runningRecategorize}
            >
              {runningRecategorize ? '重分类中...' : '按新规范重分类'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDraftWeights(normalizeWeights(draftWeights))}
            >
              归一化草稿
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetWeightsToServerDefault}
            >
              恢复默认
            </button>
            <button type="button" className="btn btn-primary" onClick={applyWeights}>
              应用并按质量分排序
            </button>
          </div>
        </div>
      </section>

      <section className="dashboard-card management-surface">
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
              <span>{formatNumber(item.key === 'all' ? total : statusSummary[item.key] || 0)}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-page">候选池加载中...</div>
        ) : candidates.length === 0 ? (
          <div className="empty-state">当前筛选下暂无候选 Skill</div>
        ) : (
          <div className="table-wrap">
            <table className="dashboard-table ingest-table management-table">
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
                          <span className="ingest-source-pill">{formatSourceLabel(candidate.source)}</span>
                          <span className={buildStatusClass(candidate.status)}>{statusText}</span>
                        </div>
                        {candidate.summary ? <p className="ingest-summary-text">{candidate.summary}</p> : null}
                        <div className="ingest-command">{candidate.installCommand}</div>
                      </td>
                      <td>
                        <div className="ingest-metrics">
                          <span className="ingest-quality-pill">质量分 {formatScore(candidate.qualityScore)}</span>
                          <span>⭐ {formatNumber(candidate.stars || 0)}</span>
                          <span>Fork {formatNumber(candidate.forks || 0)}</span>
                          <span>Issue {formatNumber(candidate.openIssues || 0)}</span>
                          <span>
                            {candidate.source === 'skills.sh' ? 'Installs' : 'Watch'}{' '}
                            {formatNumber(candidate.watchers || 0)}
                          </span>
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
                          {candidate.publishedAt ? <span>发布：{formatDateTime(candidate.publishedAt)}</span> : null}
                        </div>
                      </td>
                      <td>
                        <div className="dashboard-inline-actions ingest-actions">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void reviewCandidate(candidate, 'approve', { publishNow: true })}
                            disabled={isBusy || candidate.status === 'published' || candidate.status === 'rejected'}
                          >
                            {isBusy ? '处理中...' : '通过并发布'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void reviewCandidate(candidate, 'approve', { publishNow: false })}
                            disabled={isBusy || candidate.status === 'published' || candidate.status === 'rejected'}
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
