import { useEffect, useRef, useState } from 'react';

interface History<Row> {
  rows: Row[];
  pending: boolean;
  error: unknown;
}

export function useFollowupHistory<Row>(
  recordId: number,
  requested: boolean,
  getScoped: (id: number) => Promise<Row[]>,
  getAdditional: (id: number) => Promise<Row[]>,
  merge: (scoped: Row[], additional: Row[], id: number) => Row[],
) {
  const [history, setHistory] = useState<History<Row>>({ rows: [], pending: true, error: null });
  const [revision, setRevision] = useState(0);
  const latestRevision = useRef(0);

  useEffect(() => {
    if (!requested) return;
    let active = true;
    const isCurrent = () => active && latestRevision.current === revision;
    let scopedRows: Row[] = [];
    let additionalRows: Row[] = [];
    const publish = () => {
      if (isCurrent()) setHistory({ rows: merge(scopedRows, additionalRows, recordId), pending: true, error: null });
    };

    // The scoped API can omit deleted records. Keep the second response for restore access.
    const scoped = getScoped(recordId).then((rows) => {
      scopedRows = rows;
      publish();
    });
    const additional = getAdditional(recordId).then((rows) => {
      additionalRows = rows;
      publish();
    });

    void Promise.allSettled([scoped, additional]).then(([scopedResult, additionalResult]) => {
      if (!isCurrent()) return;
      setHistory({
        rows: merge(scopedRows, additionalRows, recordId),
        pending: false,
        error: scopedResult.status === 'rejected' && additionalResult.status === 'rejected'
          ? (scopedResult.reason ?? new Error('Unable to load follow-up history.'))
          : null,
      });
    });

    return () => { active = false; };
  }, [recordId, requested, getScoped, getAdditional, merge, revision]);

  function refresh() {
    latestRevision.current += 1;
    setHistory({ rows: [], pending: true, error: null });
    setRevision(latestRevision.current);
  }

  return { ...history, refresh };
}
