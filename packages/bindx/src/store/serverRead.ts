import type { QueryFieldSpec, QuerySpec } from '../selection/buildQuery.js'
import { canHasManyParamsExcludeMembers } from '../utils/aliasGenerator.js'
import type { HasManyViewMembership } from './hasManyState.js'

/** The schema knowledge a server read needs: where a relation points and whether it is a list. */
export interface ServerReadSchema {
	getRelationTarget(entityType: string, fieldName: string): string | undefined
	isHasMany(entityType: string, fieldName: string): boolean
}

type EntityRecord = Record<string, unknown>

/** An entity's own columns from one occurrence in a read, keyed as the read returned them. */
export interface ServerReadEntity {
	readonly entityType: string
	readonly id: string
	readonly columns: EntityRecord
}

export interface ServerReadHasOne {
	readonly parentType: string
	readonly parentId: string
	readonly fieldName: string
	readonly targetId: string | null
}

export interface ServerReadHasMany {
	readonly parentType: string
	readonly parentId: string
	readonly fieldName: string
	/** The view the list was read under: the output key, an alias for a list read with params. */
	readonly alias: string
	readonly ids: readonly string[]
	readonly totalCount: number | undefined
	/** Whether the view's params can leave members out; known only for a view read under an alias with params. */
	readonly membership: HasManyViewMembership | undefined
}

export interface ServerReadOptions {
	/** The query the read answered. Without it, each record's keys are read as schema field names. */
	readonly spec?: QuerySpec
	/** Stores a single root record under this id instead of its own, for an entity loaded by another unique field. */
	readonly rootId?: string
}

/** A server read taken apart: every entity once per occurrence, relations as references only. */
export interface NormalizedServerRead {
	readonly entities: readonly ServerReadEntity[]
	readonly hasOne: readonly ServerReadHasOne[]
	readonly hasMany: readonly ServerReadHasMany[]
}

interface ReadCollector {
	readonly entities: ServerReadEntity[]
	readonly hasOne: ServerReadHasOne[]
	readonly hasMany: ServerReadHasMany[]
}

interface FieldReading {
	readonly key: string
	readonly fieldName: string
	readonly spec: QueryFieldSpec | undefined
}

/**
 * Takes a server read apart by its query and the schema (issue #170).
 *
 * Each entity's columns are kept for its own snapshot, and each relation becomes a
 * reference to the related ids, so no snapshot holds a copy of another entity.
 * A record without a string id has nowhere to be stored and is left out, with
 * everything below it.
 */
export function normalizeServerRead(
	entityType: string,
	data: EntityRecord | readonly EntityRecord[],
	schema: ServerReadSchema,
	options: ServerReadOptions = {},
): NormalizedServerRead {
	const read: ReadCollector = { entities: [], hasOne: [], hasMany: [] }
	if (isRecordArray(data)) {
		for (const record of data) visitEntity(read, entityType, record, schema, options.spec)
	} else {
		visitEntity(read, entityType, data, schema, options.spec, options.rootId)
	}
	return read
}

function visitEntity(
	read: ReadCollector,
	entityType: string,
	record: EntityRecord,
	schema: ServerReadSchema,
	spec: QuerySpec | undefined,
	storedId?: string,
): void {
	const id = storedId ?? record['id']
	if (typeof id !== 'string') return

	const columns: EntityRecord = {}
	for (const field of readFields(record, spec)) {
		const value = record[field.key]
		const targetType = schema.getRelationTarget(entityType, field.fieldName)
		if (targetType === undefined) {
			columns[field.key] = value
			continue
		}
		if (schema.isHasMany(entityType, field.fieldName)) {
			const items = listItems(value)
			if (items === null) continue
			read.hasMany.push({
				parentType: entityType,
				parentId: id,
				fieldName: field.fieldName,
				alias: field.key,
				ids: items.map(item => item['id']).filter((itemId): itemId is string => typeof itemId === 'string'),
				totalCount: listTotalCount(value),
				membership: field.spec && field.key !== field.fieldName ? viewMembership(field.spec) : undefined,
			})
			for (const item of items) visitEntity(read, targetType, item, schema, field.spec?.nested)
			continue
		}
		if (value === null) {
			read.hasOne.push({ parentType: entityType, parentId: id, fieldName: field.fieldName, targetId: null })
			continue
		}
		if (!isRecord(value) || typeof value['id'] !== 'string') continue
		read.hasOne.push({ parentType: entityType, parentId: id, fieldName: field.fieldName, targetId: value['id'] })
		visitEntity(read, targetType, value, schema, field.spec?.nested)
	}
	read.entities.push({ entityType, id, columns })
}

/** The fields of a record to read: those of its query present in it, or every key read as a field name. */
function readFields(record: EntityRecord, spec: QuerySpec | undefined): readonly FieldReading[] {
	if (!spec) {
		return Object.keys(record).map(key => ({ key, fieldName: key, spec: undefined }))
	}
	return spec.fields
		.filter(field => Object.hasOwn(record, field.name))
		.map(field => ({ key: field.name, fieldName: field.sourcePath[0] ?? field.name, spec: field }))
}

function viewMembership(field: QueryFieldSpec): HasManyViewMembership {
	const params = { filter: field.filter, orderBy: field.orderBy, limit: field.limit, offset: field.offset }
	return canHasManyParamsExcludeMembers(params) ? 'partial' : 'total'
}

/** The items of a has-many value: a plain list, or a connection (`{ pageInfo, edges: [{ node }] }`). */
function listItems(value: unknown): readonly EntityRecord[] | null {
	if (Array.isArray(value)) return value.filter(isRecord)
	if (!isRecord(value) || !Array.isArray(value['edges'])) return null
	return value['edges'].map(edge => (isRecord(edge) ? edge['node'] : undefined)).filter(isRecord)
}

/** A list read with `totalCount` carries it on the array (non-enumerable) or in the connection's `pageInfo`. */
function listTotalCount(value: unknown): number | undefined {
	if (Array.isArray(value)) {
		const totalCount: unknown = Reflect.get(value, 'totalCount')
		return typeof totalCount === 'number' ? totalCount : undefined
	}
	if (!isRecord(value) || !isRecord(value['pageInfo'])) return undefined
	const totalCount = value['pageInfo']['totalCount']
	return typeof totalCount === 'number' ? totalCount : undefined
}

function isRecordArray(value: EntityRecord | readonly EntityRecord[]): value is readonly EntityRecord[] {
	return Array.isArray(value)
}

function isRecord(value: unknown): value is EntityRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
