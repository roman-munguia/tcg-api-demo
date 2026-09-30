// Helpers shared by the card and deck search endpoints. The data set is tiny, so searching is plain
// JavaScript over the whole list: filter, sort, then cut out one page.

/** Case-insensitive "contains". */
export const includesText = (text, part) => text.toLowerCase().includes(part.toLowerCase());

/** Case-insensitive "equals". */
export const sameText = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Sorts by valueOf(item), ascending or descending. Ties are always broken by id ascending (even for desc),
 * so the order is the same on every run - important for pagination tests.
 */
export function sortItems(items, valueOf, order) {
  const dir = order === 'desc' ? -1 : 1;
  return items.toSorted((a, b) => {
    const x = valueOf(a);
    const y = valueOf(b);
    if (x < y) return -dir;
    if (x > y) return dir;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export const paginate = (items, page, pageSize) => ({
  items: items.slice((page - 1) * pageSize, page * pageSize),
  page,
  pageSize,
  total: items.length,
  totalPages: Math.ceil(items.length / pageSize),
});

/** check() for validate(): each [min, max] query pair must not have min above max. */
export const minNotAboveMax = (...pairs) => (req) => pairs
  .filter(([min, max]) => req.validQuery[min] !== undefined && req.validQuery[max] !== undefined
    && req.validQuery[min] > req.validQuery[max])
  .map(([min, max]) => ({ field: `query.${min}`, rule: 'minNotAboveMax', message: `must not be greater than ${max}` }));
