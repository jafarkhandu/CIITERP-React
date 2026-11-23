import { useEffect, useState } from 'react';
import { leadApi } from '@/api/leadApi';

export async function getEnquiryLeadSources() {
  const sources = await leadApi.getSources();
  return sources.filter((source) => Number(source.sourceId) > 0 && !source.deletedAt);
}

export function useEnquiryOptions<Row>(load: () => Promise<Row[]>, enabled = true) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void load().then(
      (nextRows) => { if (active) setRows(nextRows); },
      () => { if (active) setError(true); },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, load, revision]);

  function retry() {
    setError(false);
    setLoading(true);
    setRevision((current) => current + 1);
  }

  return { rows, loading, error, retry };
}
