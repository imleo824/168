import { ChevronLeft, ChevronRight } from 'lucide-react';

type AdminPaginationBarProps = {
  pageIndex: number;
  hasMorePage: boolean;
  nextCursor: string | null;
  pageSize: number;
  isLoadingList: boolean;
  setPageSize: (value: number) => void;
  setPageIndex: (updater: (prev: number) => number) => void;
  setCursorStack: (updater: (prev: Array<string | null>) => Array<string | null>) => void;
  applyFilterChange: () => void;
};

export function AdminPaginationBar({
  pageIndex,
  hasMorePage,
  nextCursor,
  pageSize,
  isLoadingList,
  setPageSize,
  setPageIndex,
  setCursorStack,
  applyFilterChange,
}: AdminPaginationBarProps) {
  return (
    <div className="admin-pagination-bar">
      <div className="admin-pagination-status">
        第 {pageIndex + 1} 页
        {hasMorePage ? ' · 还有下一页' : ' · 已是最后一页'}
      </div>
      <div className="admin-pagination-controls">
        <select
          value={pageSize}
          onChange={(event) => {
            setPageSize(Math.max(10, Number(event.target.value) || 20));
            applyFilterChange();
          }}
          className="admin-pagination-size"
        >
          <option value={20}>每页 20 条</option>
          <option value={50}>每页 50 条</option>
        </select>
        <button
          type="button"
          onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
          disabled={pageIndex === 0 || isLoadingList}
          className="pressable admin-pagination-button"
          data-variant="previous"
          aria-label="上一页"
          title="上一页"
        >
          <ChevronLeft className="admin-pagination-icon" aria-hidden="true" />
          <span>上一页</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (!nextCursor || !hasMorePage) return;
            setCursorStack((prev) => [...prev.slice(0, pageIndex + 1), nextCursor]);
            setPageIndex((prev) => prev + 1);
          }}
          disabled={!hasMorePage || !nextCursor || isLoadingList}
          className="pressable admin-pagination-button"
          data-variant="next"
          aria-label="下一页"
          title="下一页"
        >
          <span>下一页</span>
          <ChevronRight className="admin-pagination-icon" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
