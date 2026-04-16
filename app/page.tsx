/**
 * 首页组件
 * 
 * 展示热门技能包、最新上传、统计数据等
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Skill } from '@/types';
import { formatNumber, formatTime, formatFileSize } from '@/lib/utils';

export default function HomePage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSkills: 0,
    totalDownloads: 0,
    activeUsers: 0,
  });

  // 加载技能包列表
  useEffect(() => {
    async function fetchSkills() {
      try {
        const response = await fetch('/api/skills?sortBy=downloadCount&pageSize=6');
        const result = await response.json();
        
        if (result.success) {
          setSkills(result.data.items);
          setStats({
            totalSkills: result.data.total,
            totalDownloads: result.data.items.reduce((sum: number, s: Skill) => sum + s.downloadCount, 0),
            activeUsers: new Set(result.data.items.map((s: Skill) => s.authorId)).size,
          });
        }
      } catch (error) {
        console.error('加载技能包失败:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSkills();
  }, []);

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h2>欢迎来到 Skill Marketplace</h2>
          <p>阿里巴巴内部技能分享平台 - 学习、分享、成长</p>
          <div className="hero-actions">
            <Link href="/upload" className="btn btn-primary">
              上传技能包
            </Link>
            <Link href="/skills" className="btn btn-secondary">
              浏览技能库
            </Link>
          </div>
        </div>
      </section>

      {/* 统计卡片 */}
      <section className="stats-section">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{formatNumber(stats.totalSkills)}</div>
            <div className="stat-label">技能包总数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatNumber(stats.totalDownloads)}</div>
            <div className="stat-label">总下载次数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatNumber(stats.activeUsers)}</div>
            <div className="stat-label">活跃分享者</div>
          </div>
        </div>
      </section>

      {/* 热门技能包 */}
      <section className="skills-section">
        <div className="section-header">
          <h3>🔥 热门技能包</h3>
          <Link href="/skills?sortBy=downloadCount" className="view-all">
            查看全部 →
          </Link>
        </div>

        {loading ? (
          <div className="loading-state">加载中...</div>
        ) : skills.length === 0 ? (
          <div className="empty-state">
            <p>暂无技能包，快来上传第一个吧！</p>
          </div>
        ) : (
          <div className="skills-grid">
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        )}
      </section>

      {/* 使用指南 */}
      <section className="guide-section">
        <h3>📖 使用指南</h3>
        <div className="guide-grid">
          <div className="guide-card">
            <div className="guide-icon">📤</div>
            <h4>上传技能包</h4>
            <p>将你的技能整理成 .zip 或 .tar.gz 格式，填写描述和标签后上传</p>
          </div>
          <div className="guide-card">
            <div className="guide-icon">🔍</div>
            <h4>搜索和筛选</h4>
            <p>通过关键词、标签、分类快速找到需要的技能包</p>
          </div>
          <div className="guide-card">
            <div className="guide-icon">📥</div>
            <h4>下载学习</h4>
            <p>点击下载按钮获取技能包，自动记录下载次数供作者参考</p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ===========================================
// 技能包卡片组件
// ===========================================
function SkillCard({ skill }: { skill: Skill }) {
  return (
    <Link href={`/skills/${skill.id}`} className="skill-card">
      <div className="skill-header">
        <h4 className="skill-title">{skill.title}</h4>
        <span className="skill-file-size">{formatFileSize(skill.fileSize)}</span>
      </div>
      
      <p className="skill-description">{skill.description.slice(0, 100)}...</p>
      
      <div className="skill-tags">
        {skill.tags.slice(0, 5).map((tag, index) => (
          <span key={index} className="tag">
            {tag}
          </span>
        ))}
      </div>
      
      <div className="skill-footer">
        <div className="skill-author">
          {skill.author?.avatar && (
            <img src={skill.author.avatar} alt={skill.author.name} className="author-avatar" />
          )}
          <span>{skill.author?.name || '未知用户'}</span>
        </div>
        <div className="skill-stats">
          <span>⬇️ {formatNumber(skill.downloadCount)}</span>
          <span>👁️ {formatNumber(skill.viewCount)}</span>
        </div>
        <div className="skill-time">{formatTime(skill.createdAt)}</div>
      </div>
    </Link>
  );
}
