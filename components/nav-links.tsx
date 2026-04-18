'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { isDashboardOwnerEmail } from '@/lib/dashboard-access';

function getNavClass(pathname: string, target: string): string {
  if (target === '/') {
    return pathname === '/' ? 'nav-link active' : 'nav-link';
  }
  return pathname.startsWith(target) ? 'nav-link active' : 'nav-link';
}

export default function NavLinks() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isDashboardOwner = isDashboardOwnerEmail(session?.user?.email);

  return (
    <nav className="nav-links">
      <Link href="/" className={getNavClass(pathname, '/')}>
        首页
      </Link>
      <Link href="/skills" className={getNavClass(pathname, '/skills')}>
        分类
      </Link>
      <Link href="/#leaderboard" className="nav-link">
        排行榜
      </Link>
      <Link href="/skills" className="nav-link">
        我的
      </Link>
      {isDashboardOwner ? (
        <Link href="/dashboard" className={getNavClass(pathname, '/dashboard')}>
          数据看板
        </Link>
      ) : null}
    </nav>
  );
}
