'use client';

import { useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { useSession, signIn } from 'next-auth/react';
import { formatDateTime, formatNumber } from '@/lib/utils';

interface ReviewImage {
  id: string;
  url: string;
  fileName?: string | null;
  sortOrder: number;
}

interface Review {
  id: string;
  content: string;
  rating?: number | null;
  likeCount: number;
  likedByCurrentUser: boolean;
  createdAt: string;
  user: {
    id: string;
    name: string;
    avatar?: string | null;
    department?: string | null;
  };
  images: ReviewImage[];
}

interface ReviewListResponse {
  items: Review[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const MAX_REVIEW_IMAGES = 4;

export default function SkillReviews({ skillId }: { skillId: string }) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [content, setContent] = useState('');
  const [rating, setRating] = useState('5');
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  const canSubmit = useMemo(() => {
    return content.trim().length > 0 || imageFiles.length > 0;
  }, [content, imageFiles]);

  async function fetchReviews() {
    try {
      setLoading(true);
      const response = await fetch(`/api/skills/${skillId}/reviews?page=1&pageSize=50`, {
        cache: 'no-store',
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '加载评价失败');
      }

      const data = result.data as ReviewListResponse;
      setReviews(data.items || []);
      setTotal(data.total || 0);
    } catch (error: any) {
      console.error('加载评价失败:', error);
      message.error(error.message || '加载评价失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReviews();
    const timer = setInterval(fetchReviews, 20000);
    return () => clearInterval(timer);
  }, [skillId]);

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const merged = [...imageFiles, ...files].slice(0, MAX_REVIEW_IMAGES);
    setImageFiles(merged);
    event.target.value = '';
  }

  function removeImage(index: number) {
    setImageFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  }

  async function handleSubmitReview(event: React.FormEvent) {
    event.preventDefault();

    if (!session?.user) {
      signIn('google', { callbackUrl: `/skills/${skillId}` });
      return;
    }

    if (!canSubmit) {
      message.warning('请填写评价内容或上传图片');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('content', content);
      if (rating) {
        formData.append('rating', rating);
      }
      imageFiles.forEach((file) => {
        formData.append('images', file);
      });

      const response = await fetch(`/api/skills/${skillId}/reviews`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '提交评价失败');
      }

      message.success('评价提交成功');
      setContent('');
      setRating('5');
      setImageFiles([]);
      await fetchReviews();
    } catch (error: any) {
      console.error('提交评价失败:', error);
      message.error(error.message || '提交评价失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleLike(reviewId: string) {
    if (!session?.user) {
      signIn('google', { callbackUrl: `/skills/${skillId}` });
      return;
    }

    try {
      const response = await fetch(`/api/reviews/${reviewId}/like`, {
        method: 'POST',
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '点赞失败');
      }

      const liked = Boolean(result.data?.liked);
      const likeCount = Number(result.data?.likeCount || 0);

      setReviews((prev) =>
        prev.map((review) =>
          review.id === reviewId
            ? {
                ...review,
                likedByCurrentUser: liked,
                likeCount,
              }
            : review
        )
      );

      setReviews((prev) =>
        [...prev].sort((a, b) => {
          if (b.likeCount !== a.likeCount) {
            return b.likeCount - a.likeCount;
          }
          return +new Date(b.createdAt) - +new Date(a.createdAt);
        })
      );

    } catch (error: any) {
      console.error('点赞失败:', error);
      message.error(error.message || '点赞失败');
    }
  }

  return (
    <section className="skill-description-card">
      <div className="review-header">
        <h3>📝 评价 ({formatNumber(total)})</h3>
        <div className="review-tip">点赞数高的评价会自动置顶</div>
      </div>

      <form className="review-form" onSubmit={handleSubmitReview}>
        <textarea
          className="input textarea"
          rows={4}
          placeholder="写下你对这个 Skill 的使用体验..."
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={2000}
        />
        <div className="review-form-row">
          <label className="review-rating">
            评分：
            <select
              className="input"
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              style={{ width: 120 }}
            >
              <option value="5">5 星</option>
              <option value="4">4 星</option>
              <option value="3">3 星</option>
              <option value="2">2 星</option>
              <option value="1">1 星</option>
            </select>
          </label>

          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            添加图片
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageChange}
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !canSubmit}
          >
            {submitting ? '提交中...' : '提交评价'}
          </button>
        </div>

        {imageFiles.length > 0 && (
          <div className="review-images-uploaded">
            {imageFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="review-image-chip">
                <span>{file.name}</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => removeImage(index)}
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
      </form>

      {loading ? (
        <div className="loading-page">评价加载中...</div>
      ) : reviews.length === 0 ? (
        <div className="empty-state">还没有评价，来抢沙发吧</div>
      ) : (
        <div className="review-list">
          {reviews.map((review) => (
            <article key={review.id} className="review-item">
              <div className="review-item-header">
                <div className="review-author">
                  {review.user.avatar && (
                    <img
                      src={review.user.avatar}
                      alt={review.user.name}
                      className="review-author-avatar"
                    />
                  )}
                  <div>
                    <div className="review-author-name">{review.user.name}</div>
                    <div className="review-author-time">
                      {formatDateTime(review.createdAt)}
                    </div>
                  </div>
                </div>
                <div className="review-actions">
                  {typeof review.rating === 'number' && (
                    <span className="review-rating-badge">{review.rating} 星</span>
                  )}
                  <button
                    type="button"
                    className={`review-like-btn ${
                      review.likedByCurrentUser ? 'active' : ''
                    }`}
                    onClick={() => toggleLike(review.id)}
                  >
                    👍 {formatNumber(review.likeCount)}
                  </button>
                </div>
              </div>

              {review.content && <p className="review-content">{review.content}</p>}

              {review.images.length > 0 && (
                <div className="review-image-grid">
                  {review.images.map((image) => (
                    <a
                      key={image.id}
                      href={image.url}
                      target="_blank"
                      rel="noreferrer"
                      className="review-image-link"
                    >
                      <img src={image.url} alt="评价图片" className="review-image" />
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
