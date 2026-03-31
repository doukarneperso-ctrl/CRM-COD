/**
 * Build pagination SQL and response metadata
 */
export interface PaginationParams {
    page: number;
    pageSize: number;
}

export interface PaginationResult {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

export function parsePagination(query: { page?: string; pageSize?: string }): PaginationParams {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const pageSize = Math.min(1000, Math.max(1, parseInt(query.pageSize || '20', 10)));
    return { page, pageSize };
}

export function paginationMeta(total: number, params: PaginationParams): PaginationResult {
    return {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
    };
}

export function paginationSQL(params: PaginationParams): { limit: number; offset: number } {
    return {
        limit: params.pageSize,
        offset: (params.page - 1) * params.pageSize,
    };
}
