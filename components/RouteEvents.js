'use client';
// PageView on every page, including in-app navigation (GA4 tracks those itself).
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '../lib/track.js';

export default function RouteEvents() {
  const pathname = usePathname();
  useEffect(() => { track('PageView'); }, [pathname]);
  return null;
}
