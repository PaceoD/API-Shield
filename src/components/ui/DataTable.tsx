import React from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (item: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (item: T) => void;
  // Pagination
  pagination?: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
  };
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items to display right now.',
  emptyAction,
  onRowClick,
  pagination,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="w-full border border-zinc-800/80 rounded-lg overflow-hidden bg-zinc-900/30">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3" style={{ width: col.width }}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {[...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3.5">
                      <div className="h-4 bg-zinc-800 rounded w-3/4"></div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full border border-zinc-800/80 rounded-lg bg-zinc-900/20 p-12 text-center flex flex-col items-center justify-center">
        <div className="w-10 h-10 rounded-full bg-zinc-800/60 flex items-center justify-center text-zinc-500 mb-3">
          <Inbox className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-zinc-200">{emptyTitle}</h4>
        <p className="text-xs text-zinc-400 mt-1 max-w-sm">{emptyDescription}</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  const totalPages = pagination ? Math.ceil(pagination.totalItems / pagination.pageSize) : 1;

  return (
    <div className="w-full border border-zinc-800/80 rounded-lg overflow-hidden bg-zinc-900/30">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900/90 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase tracking-wider">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-semibold ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  }`}
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
            {data.map((item, index) => (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick && onRowClick(item)}
                className={`transition-colors duration-100 ${
                  onRowClick
                    ? 'cursor-pointer hover:bg-zinc-800/40 hover:text-zinc-100'
                    : 'hover:bg-zinc-800/20'
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3.5 align-middle ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    }`}
                  >
                    {col.render
                      ? col.render(item, index)
                      : (item as any)[col.key] !== undefined
                      ? String((item as any)[col.key])
                      : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="px-4 py-3 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400">
          <div>
            Showing{' '}
            <span className="font-medium text-zinc-200">
              {(pagination.currentPage - 1) * pagination.pageSize + 1}
            </span>{' '}
            to{' '}
            <span className="font-medium text-zinc-200">
              {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)}
            </span>{' '}
            of <span className="font-medium text-zinc-200">{pagination.totalItems}</span> results
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={pagination.currentPage <= 1}
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
              icon={<ChevronLeft className="w-3.5 h-3.5" />}
            >
              Previous
            </Button>
            <span className="text-zinc-500">
              Page {pagination.currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="xs"
              disabled={pagination.currentPage >= totalPages}
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              icon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
