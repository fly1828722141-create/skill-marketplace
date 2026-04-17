'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/analytics-client';

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const previousKey = useRef<string>('');

  useEffect(() => {
    const routeKey = pathname;

    if (!routeKey || routeKey === previousKey.current) {
      return;
    }

    previousKey.current = routeKey;
    trackEvent({
      eventName: 'page_view',
      module: 'navigation',
      action: 'view',
      page: routeKey,
      metadata: {
        referrer: document.referrer || null,
      },
    });
  }, [pathname]);

  return null;
}
