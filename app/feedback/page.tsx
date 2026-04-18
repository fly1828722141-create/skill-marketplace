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
  upvoteCount: number;
  downvoteCount: number;
  replyCount: number;
  pinnedReplyId?: string | null;
  userVote: number;
  canManage?: boolean;
  canDelete?: boolean;
  createdAt: string;
  user: FeedbackUser;
  replies: FeedbackReply[];
}

type SortMode = 'new' | 'hot';

export default function FeedbackPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [threads, setThreads] = useState<FeedbackThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [postingThread, setPostingThread] = useState(false);
  const [threadTitle, setThreadTitle] = useState('');
  const [threadContent, setThreadContent] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('new');
  const [replySubmittingMap, setReplySubmittingMap] = useState<Record<string, boolean>>({});
  const [replyDraftMap, setReplyDraftMap] = useState<Record<string, string>>({});
  const [replyTargetMap, setReplyTargetMap] = useState<
    Record<string, { id: string; name: string } | null>
  >({});
  const [pinningMap, setPinningMap] = useState<Record<string, boolean>>({});
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);

  async function fetchThreads() {
    try {
      setLoading(true);
      const response = await fetch(`/api/feedback/threads?sort=${sortMode}&pageSize=30`, {
        cache: 'no-store',
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '加载反馈区失败');
      }

      setThreads(result.data?.items || []);
    } catch (error: any) {
      console.error('加载反馈区失败:', error);
      message.error(error.message || '加载反馈区失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchThreads();
    const timer = setInterval(fetchThreads, 20000);
    return () => clearInterval(timer);
  }, [sortMode]);

  const sortedThreads = useMemo(() => {
    const cloned = [...threads];
    if (sortMode === 'hot') {
      return cloned.sort((a, b) => {
        const scoreA = a.upvoteCount - a.downvoteCount + a.replyCount * 0.3;
        const scoreB = b.upvoteCount - b.downvoteCount + b.replyCount * 0.3;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return +new Date(b.createdAt) - +new Date(a.createdAt);
      });
    }

    return cloned.sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
    );
  }, [threads, sortMode]);

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

  async function handleCreateThread(event: React.FormEvent) {
    event.preventDefault();

    if (!(await ensureLogin('发帖'))) return;

    const title = threadTitle.trim();
    const content = threadContent.trim();

    if (title.length < 4) {
      message.warning('标题至少 4 个字');
      return;
    }
    if (!content) {
      message.warning('请填写反馈内容');
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
        throw new Error(result.error || '发帖失败');
      }

      setThreadTitle('');
      setThreadContent('');
      setThreads((prev) => [result.data, ...prev]);
      message.success('发帖成功');
    } catch (error: any) {
      console.error('发帖失败:', error);
      message.error(error.message || '发帖失败');
    } finally {
      setPostingThread(false);
    }
  }

  async function handleThreadVote(threadId: string, value: 1 | -1) {
    if (!(await ensureLogin('投票'))) return;

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
        throw new Error(result.error || '投票失败');
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
      message.error(error.message || '投票失败');
    }
  }

  async function handleReplyVote(threadId: string, replyId: string, value: 1 | -1) {
    if (!(await ensureLogin('投票'))) return;

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
        throw new Error(result.error || '投票失败');
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
      message.error(error.message || '投票失败');
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
      setPinningMap((prev) => ({ ...prev, [threadId]: true }));
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
        throw new Error(result.error || '置顶失败');
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
      message.error(error.message || '置顶失败');
    } finally {
      setPinningMap((prev) => ({ ...prev, [threadId]: false }));
    }
  }

  async function handleDeleteThread(threadId: string, threadTitle: string) {
    if (!(await ensureLogin('删帖'))) return;

    if (!window.confirm(`确认删除帖子「${threadTitle}」吗？此操作不可撤销。`)) {
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

  return (
    <div className="feedback-page">
      <section className="feedback-hero">
        <h1>意见反馈社区</h1>
        <p>公开透明讨论区：支持发帖、点赞、点踩、回复讨论，大家一起把产品做得更好。</p>
      </section>

      <section className="feedback-card">
        <div className="feedback-card-head">
          <h2>发新帖</h2>
          <span>公平机制：赞和踩都会被统计</span>
        </div>
        <form className="feedback-thread-form" onSubmit={handleCreateThread}>
          <input
            className="input"
            placeholder="帖子标题（4~120字）"
            maxLength={120}
            value={threadTitle}
            onChange={(event) => setThreadTitle(event.target.value)}
          />
          <textarea
            className="input textarea"
            rows={4}
            placeholder="详细描述你的问题、建议或想法..."
            maxLength={5000}
            value={threadContent}
            onChange={(event) => setThreadContent(event.target.value)}
          />
          <div className="feedback-thread-actions">
            <button type="submit" className="btn btn-primary" disabled={postingThread}>
              {postingThread ? '发布中...' : '发布帖子'}
            </button>
          </div>
        </form>
      </section>

      <section className="feedback-card">
        <div className="feedback-card-head">
          <h2>讨论列表</h2>
          <div className="feedback-sort">
            <button
              type="button"
              className={`feedback-sort-btn ${sortMode === 'new' ? 'active' : ''}`}
              onClick={() => setSortMode('new')}
            >
              最新
            </button>
            <button
              type="button"
              className={`feedback-sort-btn ${sortMode === 'hot' ? 'active' : ''}`}
              onClick={() => setSortMode('hot')}
            >
              最热
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-page">反馈区加载中...</div>
        ) : sortedThreads.length === 0 ? (
          <div className="empty-state">还没有帖子，来发第一条建议吧</div>
        ) : (
          <div className="feedback-thread-list">
            {sortedThreads.map((thread) => {
              const replyDraft = replyDraftMap[thread.id] || '';
              const replyTarget = replyTargetMap[thread.id] || null;
              const isSubmittingReply = Boolean(replySubmittingMap[thread.id]);
              const orderedReplies = getSortedReplies(thread);
              const canManage = canManageThread(thread);
              const canDelete = canDeleteThread(thread);
              const pinning = Boolean(pinningMap[thread.id]);

              return (
                <article key={thread.id} className="feedback-thread-item">
                  <header className="feedback-thread-header">
                    <div>
                      <h3>{thread.title}</h3>
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
                      {canDelete ? (
                        <button
                          type="button"
                          className="feedback-delete-btn"
                          disabled={deletingThreadId === thread.id}
                          onClick={() =>
                            void handleDeleteThread(thread.id, thread.title)
                          }
                        >
                          {deletingThreadId === thread.id ? '删除中...' : '管理员删帖'}
                        </button>
                      ) : null}
                    </div>
                  </header>

                  <p className="feedback-thread-content">{thread.content}</p>

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
                                onClick={() =>
                                  void handleReplyVote(thread.id, reply.id, 1)
                                }
                              >
                                👍 {formatNumber(reply.upvoteCount)}
                              </button>
                              <button
                                type="button"
                                className={`feedback-vote-btn small ${
                                  reply.userVote === -1 ? 'active-down' : ''
                                }`}
                                onClick={() =>
                                  void handleReplyVote(thread.id, reply.id, -1)
                                }
                              >
                                👎 {formatNumber(reply.downvoteCount)}
                              </button>
                              {canManage ? (
                                <button
                                  type="button"
                                  className={`feedback-pin-btn ${
                                    thread.pinnedReplyId === reply.id ? 'active' : ''
                                  }`}
                                  disabled={pinning}
                                  onClick={() =>
                                    void handlePinReply(thread.id, reply.id)
                                  }
                                >
                                  {pinning && thread.pinnedReplyId === reply.id
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
