import type { SnapshotStore, FieldError, SelectionMeta } from '@contember/bindx'
import { UnfetchedFieldError } from '@contember/bindx'
import {
	type EntityRef,
	type EntityAccessor,
	type EntityFields,
	type FieldRef,
	type HasManyRef,
	type HasOneRef,
	FIELD_REF_META,
} from './types.js'
import {
	type NotifyChange,
	type RuntimeRef,
	NON_FIELD_PROPERTIES,
	wrapEntityRefWithFieldAccessProxy,
	createNullFieldRef,
	createPlaceholderAccessor,
} from './proxyShared.js'

/**
 * Creates a fields proxy that reads directly from inline data.
 * Used for nested relations to avoid store modifications during render.
 */
export function createInlineFieldsProxy(
	data: Record<string, unknown>,
	basePath: string[],
	store: SnapshotStore,
	notifyChange: NotifyChange,
	selection?: SelectionMeta,
): EntityFields<unknown> {
	return new Proxy({} as EntityFields<unknown>, {
		get(_, fieldName: string): FieldRef<unknown> | HasManyRef<unknown> | HasOneRef<unknown> {
			const fieldSelection = selection?.fields.get(fieldName)
			return createInlineFieldRef(data, fieldName, basePath, store, notifyChange, selection, fieldSelection?.nested)
		},
	})
}

/**
 * Creates an accessor that reads directly from inline data.
 * Used for nested relations to avoid store modifications during render.
 */
export function createInlineAccessor(
	data: Record<string, unknown>,
	basePath: string[],
	store: SnapshotStore,
	notifyChange: NotifyChange,
	selection?: SelectionMeta,
): EntityAccessor<unknown> {
	const noop = () => () => {}
	const entityId = (data as { id?: string }).id ?? ''

	const fieldsProxy = createInlineFieldsProxy(data, basePath, store, notifyChange, selection)

	const ref: EntityRef<unknown> = {
		id: entityId,
		$fields: fieldsProxy,
		$data: data as unknown,
		$isDirty: false,
		$persistedId: entityId,
		$isNew: false,
		__entityType: undefined as unknown,
		__entityName: '',

		__schema: {} as Record<string, object>,
		$errors: [] as FieldError[],
		$hasError: false,
		$addError: () => {},
		$clearErrors: () => {},
		$clearAllErrors: () => {},
		$on: noop,
		$intercept: noop,
		$onPersisted: noop,
		$interceptPersisting: noop,
	}

	return wrapEntityRefWithFieldAccessProxy(ref)
}

/**
 * Creates a field ref that reads directly from inline data.
 */
function createInlineFieldRef(
	data: Record<string, unknown>,
	fieldName: string,
	basePath: string[],
	store: SnapshotStore,
	notifyChange: NotifyChange,
	selection?: SelectionMeta,
	nestedSelection?: SelectionMeta,
): FieldRef<unknown> & HasManyRef<unknown> & HasOneRef<unknown> {
	const path = [...basePath, fieldName]
	const noop = () => () => {}

	const getValue = (): unknown => {
		// Check if this field was included in the selection
		// Only check when selection is provided
		if (selection && !selection.fields.has(fieldName)) {
			throw new UnfetchedFieldError('inline', '', path)
		}
		return data[fieldName]
	}

	const meta = {
		entityType: '',
		entityId: '',
		path,
		fieldName,
		isArray: false,
		isRelation: false,
	}

	const getFieldsProxy = (): EntityFields<unknown> => {
		const value = getValue()
		if (typeof value !== 'object' || value === null || !('id' in value)) {
			return new Proxy({} as EntityFields<unknown>, {
				get(_, nestedFieldName: string) {
					return createNullFieldRef([...path, nestedFieldName], nestedFieldName)
				},
			})
		}
		return createInlineFieldsProxy(value as Record<string, unknown>, path, store, notifyChange, nestedSelection)
	}

	const getEntity = (): EntityAccessor<unknown> => {
		const value = getValue()
		if (typeof value !== 'object' || value === null || !('id' in value)) {
			return createPlaceholderAccessor<unknown>()
		}
		return createInlineAccessor(value as Record<string, unknown>, path, store, notifyChange, nestedSelection)
	}

	const mapFn = <R>(fn: (item: EntityAccessor<unknown>, index: number) => R): R[] => {
		const items = getValue()
		if (!Array.isArray(items)) return []
		return items.map((item: unknown, index: number) => {
			if (typeof item !== 'object' || item === null) {
				return fn(createPlaceholderAccessor<unknown>(), index)
			}
			return fn(createInlineAccessor(item as Record<string, unknown>, [...path, String(index)], store, notifyChange, nestedSelection), index)
		})
	}

	const getItems = (): EntityAccessor<unknown>[] => {
		const items = getValue()
		if (!Array.isArray(items)) return []
		return items.map((item: unknown, index: number) => {
			if (typeof item !== 'object' || item === null) {
				return createPlaceholderAccessor<unknown>()
			}
			return createInlineAccessor(item as Record<string, unknown>, [...path, String(index)], store, notifyChange, nestedSelection)
		})
	}

	const inputProps = { value: getValue() ?? null, setValue: () => {}, onChange: () => {} }

	const refObject = {
		[FIELD_REF_META]: meta,

		// FieldRef properties
		get value() { return getValue() ?? null },
		serverValue: getValue() ?? null,
		isDirty: false,
		isTouched: false,
		touch: () => {},
		setValue: () => {},
		inputProps,
		errors: [] as FieldError[],
		hasError: false,
		addError: () => {},
		clearErrors: () => {},
		onChange: noop,
		onChanging: noop,

		// HasManyRef properties
		get length() { const v = getValue(); return Array.isArray(v) ? v.length : 0 },
		get items() { return getItems() },
		map: mapFn,
		add: () => '',
		remove: () => {},
		move: () => {},
		connect: () => {},
		disconnect: () => {},
		reset: () => {},
		onItemConnected: noop,
		onItemDisconnected: noop,
		interceptItemConnecting: noop,
		interceptItemDisconnecting: noop,

		// HasOneRef properties
		get $id() { const v = getValue(); return (typeof v === 'object' && v !== null && 'id' in v) ? (v as {id: string}).id : '' },
		$isDirty: false,
		get $fields() { return getFieldsProxy() },
		get $entity() { return getEntity() },
		get $state() { const v = getValue(); return (typeof v === 'object' && v !== null && 'id' in v) ? 'connected' as const : 'disconnected' as const },
		$delete: () => {},
		$errors: [] as FieldError[],
		$hasError: false,
		$addError: () => {},
		$clearErrors: () => {},
		$connect: () => {},
		$disconnect: () => {},
		$reset: () => {},
		$onConnect: noop,
		$onDisconnect: noop,
		$interceptConnect: noop,
		$interceptDisconnect: noop,

		// EntityRef compatibility
		get id() { const v = getValue(); return (typeof v === 'object' && v !== null && 'id' in v) ? (v as {id: string}).id : '' },
		get $data() { return getEntity().$data },
		$isNew: false,
		$persistedId: null,
		__entityName: '',

		__schema: {} as Record<string, object>,
		$clearAllErrors: () => {},
		$on: noop,
		$intercept: noop,
		$onPersisted: noop,
		$interceptPersisting: noop,
		__entityType: undefined as unknown,
	}

	// Only wrap for hasOne relations
	const value = getValue()
	const isHasOneRelation = typeof value === 'object' && value !== null && 'id' in value && !Array.isArray(value)

	if (isHasOneRelation) {
		return wrapInlineRefWithFieldAccessProxy(refObject, getFieldsProxy)
	}

	return refObject as RuntimeRef
}

/**
 * Wraps an inline field ref with direct field access proxy.
 */
function wrapInlineRefWithFieldAccessProxy(
	ref: RuntimeRef,
	getFieldsProxy: () => EntityFields<unknown>,
): RuntimeRef {
	let cachedFieldsProxy: EntityFields<unknown> | null = null

	return new Proxy(ref, {
		get(target, prop) {
			if (typeof prop !== 'string') {
				return Reflect.get(target, prop)
			}
			if (prop in target) {
				return Reflect.get(target, prop)
			}
			if (NON_FIELD_PROPERTIES.has(prop) || prop.startsWith('@@') || prop.startsWith('_')) {
				return undefined
			}
			if (!cachedFieldsProxy) {
				cachedFieldsProxy = getFieldsProxy()
			}
			return cachedFieldsProxy[prop as keyof EntityFields<unknown>]
		},
	}) as RuntimeRef
}
