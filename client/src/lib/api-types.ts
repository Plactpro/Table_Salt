export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function selectPageData<T>(r: PaginatedResponse<T>): T[] {
  return r.data;
}
