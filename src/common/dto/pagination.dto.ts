export class PaginationDto {
  page?: number = 1;
  limit?: number = 10;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
