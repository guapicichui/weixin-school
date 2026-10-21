'use strict';
function makeRepository(db) {
  function adapter(scope, canList) {
    return {
      async get(collection, id) {
        try {
          const result = await scope.collection(collection).doc(id).get();
          return result.data && result.data._id ? result.data : null;
        } catch (error) {
          if (/\bdocument (?:does not exist|not exists?|not found)\b|DOCUMENT_NOT_FOUND/i.test(error.message || error.errMsg || '')) return null;
          throw error;
        }
      },
      async set(collection, id, value) {
        const data = Object.assign({}, value);
        delete data._id;
        await scope.collection(collection).doc(id).set({ data });
      },
      async list(collection, filter, options) {
        if (!canList) throw new Error('Queries are not supported inside transactions');
        const where = {};
        for (const [key, value] of Object.entries(filter)) {
          where[key] = value && typeof value === 'object' && '$gt' in value ? db.command.gt(value.$gt) : value;
        }
        let query = db.collection(collection).where(where);
        for (const [field, direction] of options.orderBy || []) query = query.orderBy(field, direction);
        return (await query.skip(options.skip || 0).limit(options.limit || 20).get()).data;
      }
    };
  }
  const repository = adapter(db, true);
  repository.transaction = async callback => {
    const result = await db.runTransaction(async transaction => callback(adapter(transaction, false)));
    return result && Object.prototype.hasOwnProperty.call(result, 'result') ? result.result : result;
  };
  return repository;
}
module.exports = { makeRepository };
