'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { message } from 'antd';
import { useSession } from 'next-auth/react';
import { isSuperAdminEmail } from '@/lib/dashboard-access';
import { formatDateTime, formatNumber } from '@/lib/utils';

interface FeedbackUser {
  id: string;
  name: string;
  avatar?: string | null;
  department?: string | null;
}

interface FeedbackReply {
  id: string;
  content: string;
  threadId: string;
  parentId?: string | null;
  upvoteCount: number;
  downvoteCount: number;
  userVote: number;
  createdAt: string;
  user: FeedbackUser;
  parent?: {
    id: string;
    user: {
      id: string;
      name: string;
    };
  } | null;
}

interface FeedbackThread {
  id: string;
  title: string;
  content: string;
  status: string;
  isPinned: boolean;
  upvoteCount: number;
  downvoteCount: number;
  replyCount: number;
  pinnedReplyId?: string | null;
  userVote: number;
  canManage?: boolean;
  canDelete?: boolean;
  canAdminManage?: boolean;
  createdAt: string;
  updatedAt?: string;
  user: FeedbackUser;
  replies: FeedbackReply[];
}

type ViewMode = 'wish' | 'mine';

const THREAD_TITLE_MAX = 120;
const THREAD_CONTENT_MAX = 5000;

export default function FeedbackPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [threads, setThreads] = useState<FeedbackThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [postingThread, setPostingThread] = useState(false);
  const [threadTitle, setThreadTitle] = useState('');
  const [threadContent, setThreadContent] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('wish');
  const [replySubmittingMap, setReplySubmittingMap] = useState<Record<string, boolean>>({});
  const [replyDraftMap, setReplyDraftMap] = useState<Record<string, string>>({});
  const [replyTargetMap, setReplyTargetMap] = useState<
    Record<string, { id: string; name: string } | null>
  >({});
  const [pinningReplyMap, setPinningReplyMap] = useState<Record<string, boolean>>({});
  const [pinningThreadMap, setPinningThreadMap] = useState<Record<string, boolean>>({});
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  async function fetchThreads() {
    if (viewMode === 'mine' && !session?.user?.id) {
      setThreads([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const mine = viewMode === 'mine' ? 1 : 0;
      const response = await fetch(`/api/feedback/threads?sort=new&pageSize=30&mine=${mine}`, {
        cache: 'no-store',
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '加载许愿列表失败');
      }

      setThreads(result.data?.items || []);
    } catch (error: any) {
      console.error('加载许愿区失败:', error);
      message.error(error.message || '加载许愿区失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchThreads();
    const timer = setInterval(() => {
      void fetchThreads();
    }, 20000);
    return () => clearInterval(timer);
  }, [viewMode, session?.user?.id]);

  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      const pinnedA = a.isPinned ? 1 : 0;
      const pinnedB = b.isPinned ? 1 : 0;
      if (pinnedB !== pinnedA) {
        return pinnedB - pinnedA;
      }

      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [threads]);

  const isAdmin = isSuperAdminEmail(session?.user?.email);

  function canManageThread(thread: FeedbackThread) {
    if (typeof thread.canManage === 'boolean') {
      return thread.canManage;
    }
    return isAdmin || session?.user?.id === thread.user.id;
  }

  function canDeleteThread(thread: FeedbackThread) {
    if (typeof thread.canDelete === 'boolean') {
      return thread.canDelete;
    }
    return isAdmin;
  }

  function canAdminManageThread(thread: FeedbackThread) {
    if (typeof thread.canAdminManage === 'boolean') {
      return thread.canAdminManage;
    }
    return isAdmin;
  }

  function getSortedReplies(thread: FeedbackThread) {
    return [...thread.replies].sort((a, b) => {
      const aPinned = thread.pinnedReplyId === a.id ? 1 : 0;
      const bPinned = thread.pinnedReplyId === b.id ? 1 : 0;
      if (bPinned !== aPinned) {
        return bPinned - aPinned;
      }

      return +new Date(a.createdAt) - +new Date(b.createdAt);
    });
  }

  async function ensureLogin(actionLabel: string): Promise<boolean> {
    if (session?.user) return true;
    message.warning(`${actionLabel}前请先登录 Google 账号`);
    router.push('/login');
    return false;
  }

  function startEditThread(thread: FeedbackThread) {
    setEditingThreadId(thread.id);
    setEditingTitle(thread.title || '');
    setEditingContent(thread.content || '');
  }

  function cancelEditThread() {
    setEditingThreadId(null);
    setEditingTitle('');
    setEditingContent('');
  }

  async function handleCreateThread(event: React.FormEvent) {
    event.preventDefault();

    if (!(await ensureLogin('发布许愿'))) return;

    const title = threadTitle.trim();
    const content = threadContent.trim();

    if (title.length < 4) {
      message.warning('标题至少 4 个字');
      return;
    }

    if (!content) {
      message.warning('请填写许愿内容');
      return;
    }

    try {
      setPostingThread(true);
      const response = await fetch('/api/feedback/threads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          content,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '发布许愿失败');
      }

      setThreadTitle('');
      setThreadContent('');
      setThreads((prev) => [result.data, ...prev]);
      message.success('许愿发布成功');
    } catch (error: any) {
      console.error('发布许愿失败:', error);
      message.error(error.message || '发布许愿失败');
    } finally {
      setPostingThread(false);
    }
  }

  async function handleSaveThreadEdit(threadId: string) {
    if (!(await ensureLogin('修改帖子'))) return;

    const title = editingTitle.trim();
    const content = editingContent.trim();

    if (title.length < 4 || title.length > THREAD_TITLE_MAX) {
      message.warning(`标题长度需在 4-${THREAD_TITLE_MAX} 字之间`);
      return;
    }

    if (!content || content.length > THREAD_CONTENT_MAX) {
      message.warning(`正文不能为空且不能超过 ${THREAD_CONTENT_MAX} 字`);
      return;
    }

    try {
      setSavingEdit(true);
      const response = await fetch(`/api/feedback/threads/${threadId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          content,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '修改帖子失败');
      }

      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                title: result.data?.title || title,
                content: result.data?.content || content,
                updatedAt: result.data?.updatedAt || thread.updatedAt,
              }
            : thread
        )
      );
      cancelEditThread();
      message.success('帖子已修改');
    } catch (error: any) {
      console.error('修改帖子失败:', error);
      message.error(error.message || '修改帖子失败');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleThreadPin(threadId: string, currentPinned: boolean) {
    if (!(await ensureLogin('置顶帖子'))) return;

    try {
      setPinningThreadMap((prev) => ({ ...prev, [threadId]: true }));
      const response = await fetch(`/api/feedback/threads/${threadId}/pin-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pinned: !currentPinned,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '帖子置顶失败');
      }

      const nextPinned = Boolean(result.data?.isPinned);
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                isPinned: nextPinned,
              }
            : thread
        )
      );
      message.success(nextPinned ? '帖子已置顶' : '已取消置顶');
    } catch (error: any) {
      console.error('置顶帖子失败:', error);
      message.error(error.message || '置顶帖子失败');
    } finally {
      setPinningThreadMap((prev) => ({ ...prev, [threadId]: false }));
    }
  }

  async function handleThreadVote(threadId: string, value: 1 | -1) {
    if (!(await ensureLogin('点赞'))) return;

    try {
      const response = await fetch(`/api/feedback/threads/${threadId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '点赞失败');
      }

      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                userVote: Number(result.data?.userVote || 0),
                upvoteCount: Number(result.data?.upvoteCount || 0),
                downvoteCount: Number(result.data?.downvoteCount || 0),
              }
            : thread
        )
      );
    } catch (error: any) {
      console.error('帖子投票失败:', error);
      message.error(error.message || '点赞失败');
    }
  }

  async function handleReplyVote(threadId: string, replyId: string, value: 1 | -1) {
    if (!(await ensureLogin('点赞'))) return;

    try {
      const response = await fetch(`/api/feedback/replies/${replyId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '点赞失败');
      }

      setThreads((prev) =>
        prev.map((thread) => {
          if (thread.id !== threadId) return thread;
          return {
            ...thread,
            replies: thread.replies.map((reply) =>
              reply.id === replyId
                ? {
                    ...reply,
                    userVote: Number(result.data?.userVote || 0),
                    upvoteCount: Number(result.data?.upvoteCount || 0),
                    downvoteCount: Number(result.data?.downvoteCount || 0),
                  }
                : reply
            ),
          };
        })
      );
    } catch (error: any) {
      console.error('回复投票失败:', error);
      message.error(error.message || '点赞失败');
    }
  }

  async function handleSubmitReply(threadId: string) {
    if (!(await ensureLogin('回复'))) return;

    const content = (replyDraftMap[threadId] || '').trim();
    if (!content) {
      message.warning('请输入回复内容');
      return;
    }

    try {
      setReplySubmittingMap((prev) => ({ ...prev, [threadId]: true }));
      const target = replyTargetMap[threadId] || null;

      const response = await fetch(`/api/feedback/threads/${threadId}/replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          parentId: target?.id || null,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '回复失败');
      }

      const newReply = result.data as FeedbackReply;

      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                replyCount: thread.replyCount + 1,
                replies: [...thread.replies, newReply],
              }
            : thread
        )
      );
      setReplyDraftMap((prev) => ({ ...prev, [threadId]: '' }));
      setReplyTargetMap((prev) => ({ ...prev, [threadId]: null }));
      message.success('回复成功');
    } catch (error: any) {
      console.error('发布回复失败:', error);
      message.error(error.message || '回复失败');
    } finally {
      setReplySubmittingMap((prev) => ({ ...prev, [threadId]: false }));
    }
  }

  async function handlePinReply(threadId: string, replyId: string) {
    if (!(await ensureLogin('置顶回复'))) return;

    try {
      setPinningReplyMap((prev) => ({ ...prev, [threadId]: true }));
      const response = await fetch(`/api/feedback/threads/${threadId}/pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          replyId,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '置顶回复失败');
      }

      const pinnedReplyId = result.data?.pinnedReplyId || null;
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                pinnedReplyId,
              }
            : thread
        )
      );
      message.success(pinnedReplyId ? '已置顶该回复' : '已取消置顶');
    } catch (error: any) {
      console.error('置顶回复失败:', error);
      message.error(error.message || '置顶回复失败');
    } finally {
      setPinningReplyMap((prev) => ({ ...prev, [threadId]: false }));
    }
  }

  async function handleDeleteThread(threadId: string, title: string) {
    if (!(await ensureLogin('删帖'))) return;

    if (!window.confirm(`确认删除帖子「${title}」吗？此操作不可撤销。`)) {
      return;
    }

    try {
      setDeletingThreadId(threadId);
      const response = await fetch(`/api/feedback/threads/${threadId}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '删帖失败');
      }

      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      message.success('帖子已删除');
    } catch (error: any) {
      console.error('删除帖子失败:', error);
      message.error(error.message || '删帖失败');
    } finally {
      setDeletingThreadId(null);
    }
  }

  const showMineLoginHint = viewMode === 'mine' && !session?.user;

  return (
    <div className="feedback-page">
      <section className="feedback-hero">
        <h1>技能许愿池</h1>
        <p>发布你想要的 Skill，社区可跟帖回复与点赞，管理员可对帖子进行置顶、修改和删除。</p>
        <div className="feedback-hero-meta">
          <span>排序规则：按许愿日期降序</span>
          <span>互动方式：跟帖回复 + 点赞</span>
        </div>
      </section>

      <section className="feedback-mode-tabs" aria-label="许愿视图切换">
        <button
          type="button"
          className={`feedback-mode-tab ${viewMode === 'wish' ? 'active' : ''}`}
          onClick={() => setViewMode('wish')}
        >
          我要许愿
        </button>
        <button
          type="button"
          className={`feedback-mode-tab ${viewMode === 'mine' ? 'active' : ''}`}
          onClick={() => setViewMode('mine')}
        >
          我的许愿
        </button>
      </section>

      {viewMode === 'wish' ? (
        <section className="feedback-card">
          <div className="feedback-card-head">
            <h2>发布新许愿</h2>
            <span>请描述你希望社区补充的 Skill 场景</span>
          </div>
          <form className="feedback-thread-form" onSubmit={handleCreateThread}>
            <input
              className="input"
              placeholder="许愿标题（4~120字）"
              maxLength={THREAD_TITLE_MAX}
              value={threadTitle}
              onChange={(event) => setThreadTitle(event.target.value)}
            />
            <textarea
              className="input textarea"
              rows={8}
              placeholder="详细说明你的需求、使用场景、期望产出..."
              maxLength={THREAD_CONTENT_MAX}
              value={threadContent}
              onChange={(event) => setThreadContent(event.target.value)}
            />
            <div className="feedback-thread-actions">
              <button type="submit" className="btn btn-primary" disabled={postingThread}>
                {postingThread ? '发布中...' : '发布许愿'}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="feedback-card">
          <div className="feedback-card-head">
            <h2>我的许愿</h2>
            <span>只展示你发布的帖子</span>
          </div>
          {showMineLoginHint ? (
            <div className="empty-state">请先登录后查看“我的许愿”。</div>
          ) : null}
        </section>
      )}

      <section className="feedback-card">
        <div className="feedback-card-head">
          <h2>{viewMode === 'wish' ? '最新许愿' : '我的许愿列表'}</h2>
          <span>置顶帖子优先，其余按许愿日期降序</span>
        </div>

        {loading ? (
          <div className="loading-page">许愿区加载中...</div>
        ) : showMineLoginHint ? (
          <div className="empty-state">登录后可查看和管理你的许愿帖。</div>
        ) : sortedThreads.length === 0 ? (
          <div className="empty-state">暂时没有许愿帖，来发布第一条吧</div>
        ) : (
          <div className="feedback-thread-list">
            {sortedThreads.map((thread) => {
              const replyDraft = replyDraftMap[thread.id] || '';
              const replyTarget = replyTargetMap[thread.id] || null;
              const isSubmittingReply = Boolean(replySubmittingMap[thread.id]);
              const orderedReplies = getSortedReplies(thread);
              const canManage = canManageThread(thread);
              const canDelete = canDeleteThread(thread);
              const canAdminManage = canAdminManageThread(thread);
              const pinningReply = Boolean(pinningReplyMap[thread.id]);
              const pinningThread = Boolean(pinningThreadMap[thread.id]);
              const isEditing = editingThreadId === thread.id;

              return (
                <article key={thread.id} className="feedback-thread-item">
                  <header className="feedback-thread-header">
                    <div>
                      <h3>
                        {thread.title}
                        {thread.isPinned ? (
                          <span className="feedback-thread-pinned-tag">管理员置顶</span>
                        ) : null}
                      </h3>
                      <div className="feedback-thread-meta">
                        <span>{thread.user?.name || '匿名用户'}</span>
                        <span>·</span>
                        <span>{formatDateTime(thread.createdAt)}</span>
                      </div>
                    </div>
                    <div className="feedback-thread-header-right">
                      <div className="feedback-thread-score">
                        热度 {formatNumber(thread.upvoteCount - thread.downvoteCount)}
                      </div>
                      {canAdminManage ? (
                        <div className="feedback-admin-actions">
                          <button
                            type="button"
                            className={`feedback-pin-btn ${thread.isPinned ? 'active' : ''}`}
                            disabled={pinningThread}
                            onClick={() =>
                              void handleToggleThreadPin(thread.id, Boolean(thread.isPinned))
                            }
                          >
                            {pinningThread
                              ? '处理中...'
                              : thread.isPinned
                              ? '取消置顶帖子'
                              : '置顶帖子'}
                          </button>
                          <button
                            type="button"
                            className="feedback-edit-btn"
                            onClick={() => startEditThread(thread)}
                          >
                            管理员修改
                          </button>
                          {canDelete ? (
                            <button
                              type="button"
                              className="feedback-delete-btn"
                              disabled={deletingThreadId === thread.id}
                              onClick={() => void handleDeleteThread(thread.id, thread.title)}
                            >
                              {deletingThreadId === thread.id ? '删除中...' : '管理员删帖'}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </header>

                  {isEditing ? (
                    <div className="feedback-edit-form">
                      <input
                        className="input"
                        maxLength={THREAD_TITLE_MAX}
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        placeholder="请输入新的帖子标题"
                      />
                      <textarea
                        className="input textarea"
                        rows={5}
                        maxLength={THREAD_CONTENT_MAX}
                        value={editingContent}
                        onChange={(event) => setEditingContent(event.target.value)}
                        placeholder="请输入新的帖子正文"
                      />
                      <div className="feedback-thread-actions feedback-edit-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={savingEdit}
                          onClick={() => void handleSaveThreadEdit(thread.id)}
                        >
                          {savingEdit ? '保存中...' : '保存修改'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={savingEdit}
                          onClick={cancelEditThread}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="feedback-thread-content">{thread.content}</p>
                  )}

                  <div className="feedback-vote-row">
                    <button
                      type="button"
                      className={`feedback-vote-btn ${thread.userVote === 1 ? 'active-up' : ''}`}
                      onClick={() => void handleThreadVote(thread.id, 1)}
                    >
                      👍 {formatNumber(thread.upvoteCount)}
                    </button>
                    <button
                      type="button"
                      className={`feedback-vote-btn ${thread.userVote === -1 ? 'active-down' : ''}`}
                      onClick={() => void handleThreadVote(thread.id, -1)}
                    >
                      👎 {formatNumber(thread.downvoteCount)}
                    </button>
                    <span className="feedback-reply-count">
                      回复 {formatNumber(thread.replyCount)}
                    </span>
                  </div>

                  <div className="feedback-reply-form">
                    {replyTarget ? (
                      <div className="feedback-reply-target">
                        回复 @{replyTarget.name}
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() =>
                            setReplyTargetMap((prev) => ({ ...prev, [thread.id]: null }))
                          }
                        >
                          取消
                        </button>
                      </div>
                    ) : null}
                    <textarea
                      className="input textarea"
                      rows={2}
                      placeholder="写下你的回复..."
                      value={replyDraft}
                      onChange={(event) =>
                        setReplyDraftMap((prev) => ({
                          ...prev,
                          [thread.id]: event.target.value,
                        }))
                      }
                    />
                    <div className="feedback-thread-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isSubmittingReply}
                        onClick={() => void handleSubmitReply(thread.id)}
                      >
                        {isSubmittingReply ? '发送中...' : '发送回复'}
                      </button>
                    </div>
                  </div>

                  {orderedReplies.length > 0 ? (
                    <div className="feedback-reply-list">
                      {orderedReplies.map((reply) => (
                        <div key={reply.id} className="feedback-reply-item">
                          <div className="feedback-reply-head">
                            <div className="feedback-reply-user">
                              <span>{reply.user?.name || '匿名用户'}</span>
                              <span>·</span>
                              <span>{formatDateTime(reply.createdAt)}</span>
                              {thread.pinnedReplyId === reply.id ? (
                                <span className="feedback-pinned-badge">楼主置顶</span>
                              ) : null}
                            </div>
                            <div className="feedback-reply-votes">
                              <button
                                type="button"
                                className={`feedback-vote-btn small ${
                                  reply.userVote === 1 ? 'active-up' : ''
                                }`}
                                onClick={() => void handleReplyVote(thread.id, reply.id, 1)}
                              >
                                👍 {formatNumber(reply.upvoteCount)}
                              </button>
                              <button
                                type="button"
                                className={`feedback-vote-btn small ${
                                  reply.userVote === -1 ? 'active-down' : ''
                                }`}
                                onClick={() => void handleReplyVote(thread.id, reply.id, -1)}
                              >
                                👎 {formatNumber(reply.downvoteCount)}
                              </button>
                              {canManage ? (
                                <button
                                  type="button"
                                  className={`feedback-pin-btn ${
                                    thread.pinnedReplyId === reply.id ? 'active' : ''
                                  }`}
                                  disabled={pinningReply}
                                  onClick={() => void handlePinReply(thread.id, reply.id)}
                                >
                                  {pinningReply && thread.pinnedReplyId === reply.id
                                    ? '处理中...'
                                    : thread.pinnedReplyId === reply.id
                                    ? '取消置顶'
                                    : '楼主置顶'}
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <p className="feedback-reply-content">
                            {reply.parent?.user?.name ? (
                              <span className="feedback-reply-prefix">
                                回复 @{reply.parent.user.name}：
                              </span>
                            ) : null}
                            {reply.content}
                          </p>
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() =>
                              setReplyTargetMap((prev) => ({
                                ...prev,
                                [thread.id]: {
                                  id: reply.id,
                                  name: reply.user?.name || '匿名用户',
                                },
                              }))
                            }
                          >
                            回复TA
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
