export function ok(data, message = 'Success', statusCode = 200) {
    return { success: true, message, status_code: statusCode, data, errors: null };
}
export function fail(message, statusCode = 400, errors = null) {
    return { success: false, message, status_code: statusCode, data: null, errors };
}
export function paginate(items, total, page, perPage, path) {
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    return {
        current_page: page,
        data: items,
        first_page_url: `${path}?page=1`,
        from: items.length > 0 ? (page - 1) * perPage + 1 : null,
        last_page: lastPage,
        last_page_url: `${path}?page=${lastPage}`,
        links: [],
        next_page_url: page < lastPage ? `${path}?page=${page + 1}` : null,
        path,
        per_page: perPage,
        prev_page_url: page > 1 ? `${path}?page=${page - 1}` : null,
        to: items.length > 0 ? (page - 1) * perPage + items.length : null,
        total,
    };
}
//# sourceMappingURL=api-response.js.map