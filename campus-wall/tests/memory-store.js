'use strict';
const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
function makeMemoryStore() {
  let tables = {};
  let queue = Promise.resolve();
  function adapter(source) {
    return {
      async get(collection, id) { return clone((source[collection] || {})[id]); },
      async set(collection, id, value) { if (!source[collection]) source[collection] = {}; source[collection][id] = clone(value); },
      async list(collection, filter, options) {
        let rows = Object.values(source[collection] || {}).filter(row => Object.entries(filter).every(([key, value]) => value && typeof value === 'object' && '$gt' in value ? row[key] > value.$gt : row[key] === value));
        const order = options.orderBy || [];
        rows.sort((a, b) => {
          for (const [field, direction] of order) {
            if (a[field] === b[field]) continue;
            return (a[field] < b[field] ? -1 : 1) * (direction === 'desc' ? -1 : 1);
          }
          return 0;
        });
        return clone(rows.slice(options.skip || 0, (options.skip || 0) + options.limit));
      }
    };
  }
  return {
    get: (...args) => adapter(tables).get(...args),
    set: (...args) => adapter(tables).set(...args),
    list: (...args) => adapter(tables).list(...args),
    transaction(callback) {
      const task = queue.then(async () => {
        const working = clone(tables);
        const result = await callback(adapter(working));
        tables = working;
        return result;
      });
      queue = task.catch(() => {});
      return task;
    },
    dump: () => clone(tables)
  };
}
module.exports = { makeMemoryStore };
