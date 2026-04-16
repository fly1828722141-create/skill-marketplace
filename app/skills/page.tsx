/**
 * 技能库列表页（修复 useSearchParams）
 */

'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Skill } from '@/types';
import { formatNumber, formatTime, formatFileSize } from '@/lib/utils';

function SkillsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  
  const [keyword, setKeyword] = useState(searchParams.get('keyword') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc'
  );

  // 加载技能包列表
  useEffect(() => {
    async function fetchSkills() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          keyword: keyword,
          sortBy,
          sortOrder,
          pageSize: '20',
        });

        const response = await fetch(`/api/skills?${params}`);
        const result = await response.json();

        if (result.success) {
          setSkills(result.data.items);
          setTotal(result.data.total);
        }
      } catch (error) {
        console.error('加载失败:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSkills();
  }, [keyword, sortBy, sortOrder]);

  // 搜索处理
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/skills?keyword=${keyword}&sortBy=${sortBy}&sortOrder=${sortOrder}`);
  }

  return (
    <div className="skills-page">
      <h1>📚 技能库</h1>
      
      {/* 搜索栏 */}
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="搜索技能包..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="search-input"
        />
        <button type="submit" className="search-button">搜索</button>
      </form>

      {/* 技能列表 */}
      {loading ? (
        <div className="loading">加载中...</div>
      ) : skills.length === 0 ? (
        <div className="empty-state">暂无技能包</div>
      ) : (
        <div className="skills-grid">
          {skills.map((skill) => (
            <Link key={skill.id} href={`/skills/${skill.id}`} className="skill-card">
              <h3>{skill.title}</h3>
              <p>{skill.description}</p>
              <div className="skill-meta">
                <span>📥 {formatNumber(skill.downloadCount)}</span>
                <span>👁 {formatNumber(skill.viewCount)}</span>
                <span>💾 {formatFileSize(skill.fileSize)}</span>
              </div>
              <div className="skill-footer">
                <span className="author">{skill.author?.name || '未知作者'}</span>
                <span className="time">{formatTime(skill.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <style jsx>{`
        .skills-page { max-width: 1200px; margin: 0 auto; padding: 24px; }
        h1 { font-size: 28px; margin-bottom: 24px; }
        .search-form { display: flex; gap: 12px; margin-bottom: 32px; }
        .search-input { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
        .search-button { padding: 12px 24px; background: #FF6A00; color: white; border: none; border-radius: 8px; cursor: pointer; }
        .skills-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
        .skill-card { padding: 20px; border: 1px solid #eee; border-radius: 12px; transition: all 0.3s; text-decoration: none; color: inherit; }
        .skill-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); transform: translateY(-2px); }
        .skill-card h3 { font-size: 18px; margin-bottom: 8px; color: #1890ff; }
        .skill-card p { font-size: 14px; color: #666; margin-bottom: 16px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .skill-meta { display: flex; gap: 16px; font-size: 13px; color: #999; margin-bottom: 12px; }
        .skill-footer { display: flex; justify-content: space-between; font-size: 12px; color: #999; }
        .loading, .empty-state { text-align: center; padding: 60px; color: #999; }
      `}</style>
    </div>
  );
}

export default function SkillsPage() {
  return (
    <Suspense fallback={<div className="loading">加载中...</div>}>
      <SkillsContent />
    </Suspense>
  );
}
