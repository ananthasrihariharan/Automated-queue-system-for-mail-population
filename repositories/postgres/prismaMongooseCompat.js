const prisma = require('../../lib/prisma');

const idFieldAliases = {
  _id: 'id',
  assignedTo: 'assignedToId',
  pinnedToStaff: 'pinnedToStaffId',
  reassignedFrom: 'reassignedFromId',
  lastPausedBy: 'lastPausedById',
  currentQueueJob: 'legacyCurrentQueueJobMongoId',
  currentWalkinJob: 'legacyCurrentWalkinJobMongoId',
  createdBy: 'createdById',
  paymentHandledBy: 'paymentHandledById',
  dispatchedBy: 'dispatchedById',
  packedBy: 'packedById',
  printedBy: 'printedById',
  ppsCompletedBy: 'ppsCompletedById',
  finishingCompletedBy: 'finishingCompletedById',
  preferredStaff: 'preferredStaffId',
  requestedBy: 'requestedById'
};

const userPopulateFields = {
  assignedTo: 'assignedToId',
  pinnedToStaff: 'pinnedToStaffId',
  reassignedFrom: 'reassignedFromId',
  lastPausedBy: 'lastPausedById',
  createdBy: 'createdById',
  paymentHandledBy: 'paymentHandledById',
  dispatchedBy: 'dispatchedById',
  packedBy: 'packedById',
  printedBy: 'printedById',
  ppsCompletedBy: 'ppsCompletedById',
  finishingCompletedBy: 'finishingCompletedById',
  staffId: 'staffId',
  requestedBy: 'requestedById'
};

const scalarListFields = new Set(['emails', 'alternatePhones', 'attachments', 'itemScreenshots']);

const modelsWithLegacyId = new Set([
  'user', 'customer', 'walkinRequest', 'queueSession',
  'queueUnread', 'queueMessage', 'queueRequest', 'queueJob',
  'jobCard', 'jobEvent', 'job'
]);

function normalizeScalar(value) {
  if (value && typeof value === 'object' && typeof value.toString === 'function' && value.constructor?.name === 'ObjectId') {
    return value.toString();
  }
  return value;
}

function normalizeId(value) {
  const normalized = normalizeScalar(value);
  const numeric = Number(normalized);
  return Number.isNaN(numeric) ? normalized : numeric;
}

function normalizeFieldValue(field, value, modelName) {
  if (value === null || value === undefined) return value;
  if (field.startsWith('legacy')) return String(normalizeScalar(value));
  if (field.endsWith('Id') || field === 'id') {
    if (field === 'jobId' && (modelName === 'job' || modelName === 'jobCard')) {
      return String(normalizeScalar(value));
    }
    if (field === 'threadId' || field === 'recipientId') {
      return String(normalizeScalar(value));
    }
    const norm = normalizeId(value);
    if (typeof norm !== 'number') {
      return -1;
    }
    return norm;
  }
  return normalizeScalar(value);
}

function translateIdFilter(rawValue, modelName) {
  if (rawValue === null || rawValue === undefined) {
    return { id: null };
  }

  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) && !(rawValue instanceof Date) && !(rawValue instanceof RegExp)) {
    const andConditions = [];
    const orConditions = [];
    const directConditions = {};

    for (const [operator, value] of Object.entries(rawValue)) {
      if (operator === '$in') {
        const values = Array.isArray(value) ? value : [];
        const numeric = [];
        const nonNumeric = [];
        for (const val of values) {
          const norm = normalizeScalar(val);
          const num = Number(norm);
          if (!Number.isNaN(num) && norm !== '' && norm !== null && norm !== undefined) {
            numeric.push(num);
          } else if (norm !== null && norm !== undefined) {
            nonNumeric.push(String(norm));
          }
        }
        if (numeric.length > 0 && nonNumeric.length > 0) {
          orConditions.push({ id: { in: numeric } }, { legacyMongoId: { in: nonNumeric } });
        } else if (numeric.length > 0) {
          directConditions.id = { in: numeric };
        } else if (nonNumeric.length > 0) {
          directConditions.legacyMongoId = { in: nonNumeric };
        } else {
          directConditions.id = { in: [] };
        }
      } else if (operator === '$nin') {
        const values = Array.isArray(value) ? value : [];
        const numeric = [];
        const nonNumeric = [];
        for (const val of values) {
          const norm = normalizeScalar(val);
          const num = Number(norm);
          if (!Number.isNaN(num) && norm !== '' && norm !== null && norm !== undefined) {
            numeric.push(num);
          } else if (norm !== null && norm !== undefined) {
            nonNumeric.push(String(norm));
          }
        }
        if (numeric.length > 0) {
          andConditions.push({ id: { notIn: numeric } });
        }
        if (nonNumeric.length > 0) {
          andConditions.push({ legacyMongoId: { notIn: nonNumeric } });
        }
      } else if (operator === '$ne') {
        const norm = normalizeScalar(value);
        const num = Number(norm);
        if (!Number.isNaN(num) && norm !== '' && norm !== null && norm !== undefined) {
          directConditions.id = { not: num };
        } else {
          directConditions.legacyMongoId = { not: String(norm) };
        }
      } else {
        const mappedOperator = mapOperator('id', operator, value, modelName);
        if (mappedOperator) {
          directConditions.id = mappedOperator;
        }
      }
    }

    const result = { ...directConditions };
    if (orConditions.length > 0) {
      result.OR = orConditions;
    }
    if (andConditions.length > 0) {
      result.AND = andConditions;
    }
    return result;
  }

  if (rawValue instanceof RegExp) {
    const mapped = regexToPrisma(rawValue);
    return mapped ? { legacyMongoId: mapped } : {};
  }

  const norm = normalizeScalar(rawValue);
  const num = Number(norm);
  if (!Number.isNaN(num) && norm !== '' && norm !== null && norm !== undefined) {
    return { id: num };
  } else {
    return { legacyMongoId: String(norm) };
  }
}


function regexToPrisma(value) {
  if (value instanceof RegExp) {
    const source = value.source.replace(/^\^/, '').replace(/\$$/, '');
    if (!source || /[\\()[\]{}+*?.|]/.test(source)) return undefined;
    
    const hasStartAnchor = value.source.startsWith('^');
    const hasEndAnchor = value.source.endsWith('$');
    
    if (hasStartAnchor && hasEndAnchor) {
      return { equals: source, mode: 'insensitive' };
    } else if (hasStartAnchor) {
      return { startsWith: source, mode: 'insensitive' };
    } else if (hasEndAnchor) {
      return { endsWith: source, mode: 'insensitive' };
    } else {
      return { contains: source, mode: 'insensitive' };
    }
  }
  return undefined;
}

function mapField(field, modelName) {
  if (modelName === 'queueMessage') {
    if (field === 'sender') return 'senderId';
    if (field === 'jobId') return 'legacyJobMongoId';
  }
  if (modelName === 'queueRequest') {
    if (field === 'jobId') return 'legacyJobMongoId';
    if (field === 'resultJobId') return 'legacyResultJobMongoId';
  }
  return idFieldAliases[field] || field;
}

function mapOperator(field, operator, value, modelName) {
  if (operator === '$ne') return { not: normalizeFieldValue(field, value, modelName) };
  if (operator === '$in') {
    const values = Array.isArray(value) ? value.map((entry) => normalizeFieldValue(field, entry, modelName)).filter((entry) => entry !== null) : [];
    return { in: values };
  }
  if (operator === '$nin') {
    const rawValues = Array.isArray(value) ? value.map((entry) => normalizeFieldValue(field, entry, modelName)) : [];
    const values = rawValues.filter((entry) => entry !== null);
    return rawValues.includes(null) ? { not: null, notIn: values } : { notIn: values };
  }
  if (operator === '$gte') return { gte: value };
  if (operator === '$lte') return { lte: value };
  if (operator === '$gt') return { gt: value };
  if (operator === '$lt') return { lt: value };
  if (operator === '$regex') {
    if (value instanceof RegExp) return regexToPrisma(value);
    return { contains: String(value), mode: 'insensitive' };
  }
  return undefined;
}

function mapFilter(filter = {}, modelName) {
  const where = {};

  for (const [rawField, rawValue] of Object.entries(filter || {})) {
    if (rawField === '$or' && Array.isArray(rawValue)) {
      where.OR = rawValue.map((f) => mapFilter(f, modelName));
      continue;
    }
    if (rawField === '$and' && Array.isArray(rawValue)) {
      where.AND = rawValue.map((f) => mapFilter(f, modelName));
      continue;
    }

    if ((rawField === '_id' || rawField === 'id') && modelsWithLegacyId.has(modelName)) {
      const idFilter = translateIdFilter(rawValue, modelName);
      Object.assign(where, idFilter);
      continue;
    }

    const field = mapField(rawField, modelName);
    if (rawValue instanceof RegExp) {
      const mapped = regexToPrisma(rawValue);
      if (mapped) where[field] = mapped;
      continue;
    }

    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) && !(rawValue instanceof Date)) {
      const mapped = {};
      for (const [operator, value] of Object.entries(rawValue)) {
        const mappedOperator = mapOperator(field, operator, value, modelName);
        if (mappedOperator) Object.assign(mapped, mappedOperator);
      }
      where[field] = Object.keys(mapped).length > 0 ? mapped : normalizeId(rawValue);
      continue;
    }

    where[field] = scalarListFields.has(field)
      ? { has: normalizeFieldValue(field, rawValue, modelName) }
      : normalizeFieldValue(field, rawValue, modelName);
  }

  return where;
}

function hasUnsupportedMongoFilter(filter = {}, modelName) {
  for (const [field, value] of Object.entries(filter || {})) {
    if (field.includes('.')) return true;
    if (modelName === 'user' && field === 'roles') return true;
    if ((field === '$or' || field === '$and') && Array.isArray(value)) {
      if (value.some((f) => hasUnsupportedMongoFilter(f, modelName))) return true;
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp)) {
      if ('$elemMatch' in value || '$exists' in value || '$options' in value) return true;
      if (hasUnsupportedMongoFilter(value, modelName)) return true;
    }
  }
  return false;
}

function getPathValues(source, pathName) {
  const parts = pathName.split('.');
  const walk = (value, index) => {
    if (value === null || value === undefined) return [];
    if (index >= parts.length) return [value];
    if (Array.isArray(value)) return value.flatMap((entry) => walk(entry, index));
    return walk(value[parts[index]], index + 1);
  };
  return walk(source, 0);
}

function valuesEqual(actual, expected) {
  const actualValue = normalizeScalar(actual);
  const expectedValue = normalizeScalar(expected);
  if (actualValue instanceof Date || expectedValue instanceof Date) {
    return new Date(actualValue).getTime() === new Date(expectedValue).getTime();
  }
  return actualValue === expectedValue;
}

function matchesCondition(actualValues, condition, modelName) {
  const values = (Array.isArray(actualValues) ? actualValues : [actualValues])
    .flatMap((value) => Array.isArray(value) ? value : [value]);

  if (condition instanceof RegExp) {
    return values.some((value) => condition.test(String(value || '')));
  }

  if (!condition || typeof condition !== 'object' || condition instanceof Date || Array.isArray(condition)) {
    return values.some((value) => valuesEqual(value, condition));
  }

  if ('$elemMatch' in condition) {
    return values.some((value) => {
      if (Array.isArray(value)) {
        return value.some((entry) => matchesMongoFilter(entry, condition.$elemMatch, modelName));
      }
      return matchesMongoFilter(value, condition.$elemMatch, modelName);
    });
  }

  for (const [operator, expected] of Object.entries(condition)) {
    if (operator === '$options') continue;
    if (operator === '$regex') {
      const regex = expected instanceof RegExp ? expected : new RegExp(String(expected), condition.$options || '');
      if (!values.some((value) => regex.test(String(value || '')))) return false;
      continue;
    }
    if (operator === '$ne') {
      if (values.some((value) => valuesEqual(value, expected))) return false;
      continue;
    }
    if (operator === '$in') {
      if (!values.some((value) => expected.some((entry) => valuesEqual(value, entry)))) return false;
      continue;
    }
    if (operator === '$nin') {
      if (values.some((value) => expected.some((entry) => valuesEqual(value, entry)))) return false;
      continue;
    }
    if (operator === '$gte') {
      if (!values.some((value) => new Date(value).getTime() >= new Date(expected).getTime())) return false;
      continue;
    }
    if (operator === '$lte') {
      if (!values.some((value) => new Date(value).getTime() <= new Date(expected).getTime())) return false;
      continue;
    }
    if (operator === '$gt') {
      if (!values.some((value) => new Date(value).getTime() > new Date(expected).getTime())) return false;
      continue;
    }
    if (operator === '$lt') {
      if (!values.some((value) => new Date(value).getTime() < new Date(expected).getTime())) return false;
      continue;
    }
    if (operator === '$exists') {
      const exists = values.some((value) => value !== undefined);
      if (exists !== Boolean(expected)) return false;
      continue;
    }
    if (!matchesCondition(getPathValues(values[0], operator), expected, modelName)) return false;
  }

  return true;
}

function mapPath(row, path) {
  if (typeof path !== 'string' || !row) return path;
  let parts = path.split('.');
  if (parts[0] === 'items' && !('items' in row) && 'jobItems' in row) parts[0] = 'jobItems';
  else if (parts[0] === 'parcels' && !('parcels' in row) && 'jobParcels' in row) parts[0] = 'jobParcels';
  else if (parts[0] === 'taskLog' && !('taskLog' in row) && 'taskLogs' in row) parts[0] = 'taskLogs';
  else if (parts[0] === 'itemScreenshots' && !('itemScreenshots' in row) && 'screenshots' in row) parts[0] = 'screenshots';
  return parts.join('.');
}

function matchesMongoFilter(row, filter = {}, modelName) {
  for (const [rawField, condition] of Object.entries(filter || {})) {
    if (rawField === '$or') {
      if (!condition.some((entry) => matchesMongoFilter(row, entry, modelName))) return false;
      continue;
    }
    if (rawField === '$and') {
      if (!condition.every((entry) => matchesMongoFilter(row, entry, modelName))) return false;
      continue;
    }

    const field = mapPath(row, mapField(rawField, modelName));
    const values = (rawField.includes('.') || field.includes('.')) ? getPathValues(row, field) : [row[field]];
    if (!matchesCondition(values, condition, modelName)) return false;
  }
  return true;
}

function serializeForPrisma(value) {
  if (value instanceof Map) return Object.fromEntries(value);
  if (Array.isArray(value)) return value.map(serializeForPrisma);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeForPrisma(entry)])
    );
  }
  return value;
}

function mapOrderBy(sortSpec = {}, modelName) {
  return Object.entries(sortSpec).map(([field, direction]) => ({
    [mapField(field, modelName)]: Number(direction) < 0 ? 'desc' : 'asc'
  }));
}

function mapSelect(selection, modelName) {
  if (!selection) return undefined;
  if (modelName === 'job' || modelName === 'jobCard') return undefined;
  const select = {};
  let excludeId = false;
  let hasPositiveSelect = false;

  if (typeof selection === 'string') {
    const fields = selection.split(/\s+/).filter(Boolean);
    if (fields.includes('-_id')) {
      excludeId = true;
    }
    for (const field of fields) {
      if (field.startsWith('-')) continue;
      const isForceInclude = field.startsWith('+');
      const cleanField = isForceInclude ? field.substring(1) : field;
      if (!isForceInclude) {
        hasPositiveSelect = true;
      }
      if (modelName === 'user' && cleanField === 'roles') {
        select.role = true;
        select.rawRoles = true;
      } else {
        select[mapField(cleanField, modelName)] = true;
      }
    }
  } else {
    for (const [field, enabled] of Object.entries(selection)) {
      if (field === '_id' && !enabled) {
        excludeId = true;
        continue;
      }
      if (enabled) {
        const isForceInclude = field.startsWith('+');
        const cleanField = isForceInclude ? field.substring(1) : field;
        if (!isForceInclude) {
          hasPositiveSelect = true;
        }
        if (modelName === 'user' && cleanField === 'roles') {
          select.role = true;
          select.rawRoles = true;
        } else {
          select[mapField(cleanField, modelName)] = true;
        }
      }
    }
  }

  if (!hasPositiveSelect) {
    return undefined;
  }

  if (!excludeId) {
    select[mapField('_id', modelName)] = true;
  }

  return Object.keys(select).length > 0 ? select : undefined;
}

function mapUpdate(update = {}, modelName) {
  if (Array.isArray(update)) return {};
  const data = {};
  const set = update.$set || {};
  const inc = update.$inc || {};
  const unset = update.$unset || {};
  const addToSet = update.$addToSet || {};
  const direct = {};
  for (const [key, val] of Object.entries(update)) {
    if (!key.startsWith('$')) {
      direct[key] = val;
    }
  }

  for (const [rawField, value] of Object.entries({ ...direct, ...set })) {
    if (modelName === 'user' && rawField === 'roles') {
      data.rawRoles = normalizeFieldValue('rawRoles', value, modelName);
      if (Array.isArray(value) && value.length > 0) {
        data.role = String(value[0]);
      }
      continue;
    }
    const field = mapField(rawField, modelName);
    data[field] = normalizeFieldValue(field, value, modelName);
  }
  for (const [rawField, value] of Object.entries(inc)) {
    data[mapField(rawField, modelName)] = { increment: Number(value) || 0 };
  }
  for (const rawField of Object.keys(unset)) {
    data[mapField(rawField, modelName)] = null;
  }
  for (const [rawField, value] of Object.entries(addToSet)) {
    data[mapField(rawField, modelName)] = { push: normalizeScalar(value) };
  }

  return data;
}

function materializeCreateData(data = {}) {
  const createData = {};
  for (const [field, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'increment')) {
      createData[field] = value.increment;
    } else {
      createData[field] = value;
    }
  }
  return createData;
}

function reviveParcelMaps(parcels) {
  if (!Array.isArray(parcels)) return parcels;
  return parcels.map((parcel) => {
    if (!parcel || typeof parcel !== 'object') return parcel;
    const copy = { ...parcel };
    for (const field of ['itemRacks', 'itemStatuses']) {
      if (copy[field] && !(copy[field] instanceof Map)) {
        copy[field] = new Map(Object.entries(copy[field]));
      }
    }
    return copy;
  });
}

function normalizeRow(row, modelName) {
  if (!row || typeof row !== 'object') return row;
  const normalized = { ...row, _id: row.id };
  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === 'bigint') normalized[key] = Number(value);
  }
  if ('parcels' in normalized) normalized.parcels = reviveParcelMaps(normalized.parcels) || [];
  if ('items' in normalized) normalized.items = Array.isArray(normalized.items) ? normalized.items : [];
  if ('taskLog' in normalized) normalized.taskLog = Array.isArray(normalized.taskLog) ? normalized.taskLog : [];
  if (modelName === 'queueMessage') {
    if ('senderId' in normalized && !('sender' in normalized)) {
      normalized.sender = normalized.senderId;
    }
    if ('legacyJobMongoId' in normalized && !('jobId' in normalized)) {
      normalized.jobId = normalized.legacyJobMongoId;
    }
  }
  if (modelName === 'customerPreference') {
    if ('preferredStaffId' in normalized && !('preferredStaff' in normalized)) {
      normalized.preferredStaff = normalized.preferredStaffId;
    }
  }
  if (modelName === 'queueSession') {
    // Expose currentQueueJob / currentWalkinJob as read/write aliases for the legacy
    // string fields so queueEngine can get/set them without knowing the PG field names.
    Object.defineProperty(normalized, 'currentQueueJob', {
      get() { return this.legacyCurrentQueueJobMongoId || null; },
      set(v) { this.legacyCurrentQueueJobMongoId = v != null ? String(v) : null; },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(normalized, 'currentWalkinJob', {
      get() { return this.legacyCurrentWalkinJobMongoId || null; },
      set(v) { this.legacyCurrentWalkinJobMongoId = v != null ? String(v) : null; },
      enumerable: true,
      configurable: true
    });
  }
  if (modelName === 'queueJob') {
    // Read/write aliases: Mongoose-style field names (assignedTo, pinnedToStaff, etc.)
    // map to PG FK columns (*Id). The closure-based setter handles both plain ID assignment
    // (from queueEngine .save() paths) and populated user objects (from populateRows).
    for (const [alias, pgField] of [
      ['assignedTo', 'assignedToId'],
      ['pinnedToStaff', 'pinnedToStaffId'],
      ['reassignedFrom', 'reassignedFromId'],
      ['lastPausedBy', 'lastPausedById']
    ]) {
      let _obj = undefined;
      Object.defineProperty(normalized, alias, {
        get() { return _obj !== undefined ? _obj : (this[pgField] ?? null); },
        set(v) {
          if (v != null && typeof v === 'object') {
            _obj = v;
            const numId = Number(v.id || v._id);
            if (numId) this[pgField] = numId;
          } else {
            _obj = undefined;
            this[pgField] = v != null ? (Number(v) || null) : null;
          }
        },
        enumerable: true,
        configurable: true
      });
    }
  }
  if (modelName === 'queueRequest') {
    // Alias resultJobId ↔ legacyResultJobMongoId (legacy string FK to job)
    Object.defineProperty(normalized, 'resultJobId', {
      get() { return this.legacyResultJobMongoId || null; },
      set(v) { this.legacyResultJobMongoId = v != null ? String(v) : null; },
      enumerable: true,
      configurable: true
    });
  }
  return normalized;
}

function attachSave(row, modelName, updateFields) {
  const normalized = normalizeRow(row, modelName);
  if (!normalized || typeof normalized !== 'object') return normalized;

  Object.defineProperty(normalized, 'save', {
    enumerable: false,
    value: async function save() {
      const data = {};
      for (const field of updateFields) {
        if (this[field] !== undefined) data[field] = serializeForPrisma(this[field]);
      }
      const updated = await prisma[modelName].update({
        where: { id: Number(this.id || this._id) },
        data
      });
      Object.assign(this, normalizeRow(updated, modelName));
      return this;
    }
  });

  Object.defineProperty(normalized, 'markModified', {
    enumerable: false,
    value: function markModified() {}
  });

  Object.defineProperty(normalized, 'toObject', {
    enumerable: false,
    value: function toObject() {
      return this;
    }
  });

  Object.defineProperty(normalized, 'toJSON', {
    enumerable: false,
    value: function toJSON() {
      return this;
    }
  });

  return normalized;
}

async function populateRows(rows, populates) {
  if (!populates.length) return rows;
  const rowList = Array.isArray(rows) ? rows : [rows];

  for (const populate of populates) {
    const pathName = typeof populate === 'string' ? populate : populate.path;
    const idField = userPopulateFields[pathName];
    if (!idField) continue;

    const ids = [...new Set(rowList.map((row) => row && row[idField]).filter((id) => id !== null && id !== undefined).map(Number))];
    if (ids.length === 0) continue;

    const users = await prisma.user.findMany({ where: { id: { in: ids } } });
    const usersById = new Map(users.map((user) => [user.id, normalizeRow(user, 'user')]));
    for (const row of rowList) {
      if (row && row[idField] !== null && row[idField] !== undefined) {
        row[pathName] = usersById.get(Number(row[idField])) || row[idField];
      }
    }
  }

  return Array.isArray(rows) ? rowList : rowList[0];
}

class PrismaQuery {
  constructor(modelName, filter = {}, options = {}) {
    this.modelName = modelName;
    this.filter = filter;
    this.projection = options.projection;
    this.single = Boolean(options.single);
    this.updateFields = options.updateFields || [];
    this.orderBy = options.orderBy;
    this.skipCount = undefined;
    this.takeCount = undefined;
    this.populates = [];
  }

  sort(sortSpec) {
    this.orderBy = mapOrderBy(sortSpec, this.modelName);
    return this;
  }

  skip(count) {
    this.skipCount = Number(count) || 0;
    return this;
  }

  limit(count) {
    this.takeCount = Number(count) || undefined;
    return this;
  }

  select(selection) {
    this.projection = selection;
    return this;
  }

  populate(pathName) {
    this.populates.push(pathName);
    return this;
  }

  async distinct(field) {
    const mappedField = mapField(field, this.modelName);
    const useMemoryFilter = hasUnsupportedMongoFilter(this.filter, this.modelName);
    const rows = await prisma[this.modelName].findMany(useMemoryFilter ? {} : {
      where: mapFilter(this.filter, this.modelName),
      distinct: [mappedField],
      select: { [mappedField]: true }
    });
    const filteredRows = useMemoryFilter ? rows.filter((row) => matchesMongoFilter(row, this.filter, this.modelName)) : rows;
    return filteredRows.map((row) => row[mappedField]).filter((value) => value !== null && value !== undefined);
  }

  lean() {
    return this;
  }

  async exec() {
    const useMemoryFilter = hasUnsupportedMongoFilter(this.filter, this.modelName);
    const args = {
      where: useMemoryFilter ? {} : mapFilter(this.filter, this.modelName)
    };
    const select = mapSelect(this.projection, this.modelName);
    if (!useMemoryFilter && select) args.select = select;
    if (!useMemoryFilter && this.orderBy) args.orderBy = this.orderBy;
    if (!useMemoryFilter && this.skipCount !== undefined) args.skip = this.skipCount;
    if (!useMemoryFilter && this.takeCount !== undefined) args.take = this.takeCount;

    if (this.modelName === 'jobCard' && !args.select) {
      args.include = { dieCuttingRows: true };
    } else if (this.modelName === 'job' && !args.select) {
      args.include = {
        jobItems: {
          include: {
            laminationSpec:    true,
            bindingSpec:       true,
            creasingSpec:      true,
            cuttingSpec:       true,
            dieCuttingSpec:    { include: { rows: true } },
            cornerCuttingSpec: true,
            foilSpec:          true,
            idCardSpec:        true,
            workflowSteps:     true
          }
        },
        jobParcels: {
          include: {
            parcelItems: true
          }
        },
        taskLogs:        true,
        packingOverride: true,
        screenshots:     true
      };
    }

    let result = this.single
      ? await prisma[this.modelName].findFirst(args)
      : await prisma[this.modelName].findMany(args);

    // Map rows to Mongoose shape before filtering/paginating so nested fields exist
    const mapRow = (row) => {
      if (!row) return null;
      if (this.modelName === 'jobCard') {
        const { adaptJobCardToLegacyShape } = require('../../lib/responseAdapters');
        const PgJobCardRepo = require('./PgJobCardRepository');
        return PgJobCardRepo.attachSaveJobCard(adaptJobCardToLegacyShape(row));
      } else if (this.modelName === 'job') {
        const { adaptJobToLegacyShape } = require('../../lib/responseAdapters');
        const PgJobRepo = require('./PgJobRepository');
        return PgJobRepo.attachSaveJob(adaptJobToLegacyShape(row));
      } else if (this.modelName === 'user') {
        const rawRoles = Array.isArray(row.rawRoles) ? row.rawRoles : [];
        const roles = rawRoles.length > 0 ? rawRoles : (row.role ? [row.role] : []);
        const normalized = {
          ...row,
          _id: row.id,
          roles
        };
        return attachSave(normalized, 'user', this.updateFields);
      }
      return attachSave(row, this.modelName, this.updateFields);
    };

    let normalized = this.single
      ? (result ? mapRow(result) : null)
      : (result || []).map(mapRow).filter(Boolean);

    if (useMemoryFilter) {
      const rows = (this.single ? (normalized ? [normalized] : []) : normalized).filter((row) => matchesMongoFilter(row, this.filter, this.modelName));
      if (this.orderBy) {
        const orderEntries = this.orderBy.flatMap((entry) => Object.entries(entry));
        rows.sort((a, b) => {
          for (const [field, direction] of orderEntries) {
            const av = a[field];
            const bv = b[field];
            if (av < bv) return direction === 'desc' ? 1 : -1;
            if (av > bv) return direction === 'desc' ? -1 : 1;
          }
          return 0;
        });
      }
      const start = this.skipCount || 0;
      const end = this.takeCount !== undefined ? start + this.takeCount : undefined;
      normalized = this.single ? (rows[0] || null) : rows.slice(start, end);
    }

    return populateRows(normalized, this.populates);
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

async function countDocuments(modelName, filter = {}) {
  if (hasUnsupportedMongoFilter(filter, modelName)) {
    const query = new PrismaQuery(modelName, filter);
    const rows = await query.exec();
    return rows.length;
  }
  return prisma[modelName].count({ where: mapFilter(filter, modelName) });
}

async function findOneAndUpdate(modelName, filter = {}, update = {}, options = {}, updateFields = []) {
  if (modelName === 'job') {
    const PgJobRepo = require('./PgJobRepository');
    return PgJobRepo.findOneAndUpdate(filter, update, options);
  }
  if (modelName === 'jobCard') {
    const PgJobCardRepo = require('./PgJobCardRepository');
    return PgJobCardRepo.findOneAndUpdate(filter, update, options);
  }
  const existing = await prisma[modelName].findFirst({ where: mapFilter(filter, modelName), select: { id: true } });
  const data = mapUpdate(update, modelName);

  if (!existing) {
    if (!options.upsert) return null;
    const created = await prisma[modelName].create({ data: materializeCreateData(data) });
    return attachSave(created, modelName, updateFields);
  }

  const updated = await prisma[modelName].update({
    where: { id: existing.id },
    data
  });
  return attachSave(updated, modelName, updateFields);
}

async function findByIdAndUpdate(modelName, id, update = {}, options = {}, updateFields = []) {
  if (modelName === 'job') {
    const PgJobRepo = require('./PgJobRepository');
    return PgJobRepo.findByIdAndUpdate(id, update, options);
  }
  const numericId = Number(id);
  if (Number.isNaN(numericId)) return null;

  try {
    const updated = await prisma[modelName].update({
      where: { id: numericId },
      data: mapUpdate(update, modelName)
    });
    return attachSave(updated, modelName, updateFields);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

async function updateMany(modelName, filter = {}, update = {}) {
  return prisma[modelName].updateMany({
    where: mapFilter(filter, modelName),
    data: mapUpdate(update, modelName)
  });
}

async function deleteMany(modelName, filter = {}) {
  if (modelName === 'job') {
    const PgJobRepo = require('./PgJobRepository');
    return PgJobRepo.deleteMany(filter);
  }
  return prisma[modelName].deleteMany({ where: mapFilter(filter, modelName) });
}

module.exports = {
  PrismaQuery,
  attachSave,
  countDocuments,
  deleteMany,
  findByIdAndUpdate,
  findOneAndUpdate,
  mapFilter,
  mapUpdate,
  matchesMongoFilter,
  updateMany,
  normalizeRow
};
