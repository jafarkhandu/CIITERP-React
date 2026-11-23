import { useState } from 'react';

const PAGE_SIZE = 25;

type Pagination = {
  page: number;
  pages: number;
  total: number;
  firstRow: number;
  lastRow: number;
  changePage: (page: number) => void;
};

export function useTablePage<T>(rows: readonly T[], filterKey: string | number = '') {
  const [position, setPosition] = useState({ filterKey, page: 1 });
  if (position.filterKey !== filterKey) setPosition({ filterKey, page: 1 });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = position.filterKey === filterKey ? Math.min(position.page, pages) : 1;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, rows.length);
  const pagination: Pagination = {
    page,
    pages,
    total: rows.length,
    firstRow: rows.length ? start + 1 : 0,
    lastRow: end,
    changePage: (next) => setPosition({ filterKey, page: Math.max(1, Math.min(next, pages)) }),
  };

  return { pageRows: rows.slice(start, end), pagination };
}

export function TablePagination({ page, pages, total, firstRow, lastRow, changePage, label }: Pagination & { label: string }) {
  if (pages <= 1) return null;

  return (
    <nav aria-label={`Pagination for ${label}`} className="d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-2">
      <span className="small" aria-live="polite">{firstRow}–{lastRow} of {total} {label}</span>
      <div className="d-flex align-items-center gap-2">
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page === 1} onClick={() => changePage(page - 1)}>
          Previous
        </button>
        <span className="small">Page {page} of {pages}</span>
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page === pages} onClick={() => changePage(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}
