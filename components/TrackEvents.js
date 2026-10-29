'use client';
// Fires a marketing event once when mounted (e.g. ViewContent, Search).
import { useEffect } from 'react';
import { track } from '../lib/track.js';

export function TrackOnMount({ event, data }) {
  const key = JSON.stringify(data);
  useEffect(() => { track(event, JSON.parse(key)); }, [event, key]);
  return null;
}

export function SearchTracker({ query }) {
  return <TrackOnMount event="Search" data={{ search_string: query }} />;
}
