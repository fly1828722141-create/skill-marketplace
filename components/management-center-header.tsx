'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface ManagementCenterHeaderProps {
  sectionTitle: string;
  sectionDescription: string;
  actions?: ReactNode;
}

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: '数据中心',
    hint: '站点与行为指标',
    iconText: '数',
  },
  {
    href: '/dashboard/categories',
    label: '分类管理中心',
    hint: '分类体系与迁移',
    iconText: '类',
  },
  {
    href: '/dashboard/ingest',
    label: '收录审核台',
    hint: '候选池审批发布',
    iconText: '审',
  },
];

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }
  return pathname.startsWith(href);
}

export default function ManagementCenterHeader(props: ManagementCenterHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="management-center-header">
      <div className="management-center-top">
        <div className="management-center-intro">
          <span className="management-center-badge">管理员专属</span>
          <h1>管理中心</h1>
          <p>
            <strong>{props.sectionTitle}</strong>
            <span>{props.sectionDescription}</span>
          </p>
        </div>
        {props.actions ? <div className="management-center-actions">{props.actions}</div> : null}
      </div>

      <nav className="management-center-nav" aria-label="管理中心子类目">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`management-center-nav-item${active ? ' active' : ''}`}
            >
              <span className="management-center-nav-icon" aria-hidden>
                {item.iconText}
              </span>
              <span className="management-center-nav-text">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
