import type { DirtyEntity } from './ChangeRegistry.js'
import type {
	CollectedHasManyChange,
	CollectedHasOneChange,
	CollectedNestedCreate,
	CollectedNestedEntity,
	CollectedNestedUpdate,
	CollectedRelationField,
} from './MutationCollector.js'
import type { PersistScope, TransactionMutation } from './types.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'

export interface ExecutionEntity {
	readonly entityType: string
	readonly entityId: string
	readonly operation: 'create' | 'update' | 'delete'
	readonly scalarData: Readonly<Record<string, unknown>>
	readonly nested: boolean
}

export interface PersistExecution {
	readonly mutations: readonly TransactionMutation[]
	readonly entities: readonly ExecutionEntity[]
	readonly hasOneChanges: readonly CollectedHasOneChange[]
	readonly hasManyChanges: readonly CollectedHasManyChange[]
	readonly vetoed: readonly DirtyEntity[]
	readonly nestedEntities: readonly CollectedNestedEntity[]
	readonly relationFields: readonly CollectedRelationField[]
	readonly nestedCreates: readonly CollectedNestedCreate[]
	readonly nestedUpdates: readonly CollectedNestedUpdate[]
	readonly suppressedRelationItems: ReadonlyMap<string, ReadonlySet<string>>
}

export function entityIdentityKey(entityType: string, entityId: string): string {
	return `${entityType}:${entityId}`
}

export function createPersistExecution(
	store: SnapshotStore,
	mutations: readonly TransactionMutation[],
	entities: readonly DirtyEntity[],
	nestedEntities: readonly CollectedNestedEntity[],
	relationFieldMetadata: readonly CollectedRelationField[],
	nestedCreateMetadata: readonly CollectedNestedCreate[],
	nestedUpdateMetadata: readonly CollectedNestedUpdate[],
	hasOneChanges: readonly CollectedHasOneChange[],
	hasManyChanges: readonly CollectedHasManyChange[],
	vetoed: readonly DirtyEntity[],
	suppressedRelationItems: ReadonlyMap<string, ReadonlySet<string>>,
	scope: PersistScope,
): PersistExecution {
	const uniqueHasOne = new Map(
		hasOneChanges.map(change => [relationIdentityKey(change.entityType, change.entityId, change.fieldName), change]),
	)
	const uniqueHasMany = new Map(
		hasManyChanges.map(change => [relationIdentityKey(change.entityType, change.entityId, change.fieldName), change]),
	)
	const sentHasOneChanges = [...uniqueHasOne.values()]
	const sentHasManyChanges = [...uniqueHasMany.values()]
	const uniqueNestedCreates = new Map(
		nestedCreateMetadata.map(create => [nestedIdentityKey(
			create.parentEntityType,
			create.parentEntityId,
			create.fieldName,
			create.entityType,
			create.entityId,
		), create]),
	)
	const uniqueNestedUpdates = new Map(
		nestedUpdateMetadata.map(update => [nestedIdentityKey(
			update.parentEntityType,
			update.parentEntityId,
			update.fieldName,
			update.entityType,
			update.entityId,
		), update]),
	)
	const nestedCreates = [...uniqueNestedCreates.values()]
	const nestedUpdates = [...uniqueNestedUpdates.values()]
	const topLevelOperations = new Map(
		mutations.map(mutation => [entityIdentityKey(mutation.entityType, mutation.entityId), mutation.operation]),
	)
	const topLevelMutations = new Map(
		mutations.map(mutation => [entityIdentityKey(mutation.entityType, mutation.entityId), mutation]),
	)
	const uniqueRelationFields = new Map(
		relationFieldMetadata.map(field => [relationIdentityKey(field.entityType, field.entityId, field.fieldName), field]),
	)
	const relationFields = new Map<string, Set<string>>()
	for (const change of uniqueRelationFields.values()) {
		const key = entityIdentityKey(change.entityType, change.entityId)
		const fields = relationFields.get(key)
		if (fields) fields.add(change.fieldName)
		else relationFields.set(key, new Set([change.fieldName]))
	}
	const nestedKeys = new Set(nestedEntities.map(entity => entityIdentityKey(entity.entityType, entity.entityId)))
	const nestedMutationData = new Map<string, Readonly<Record<string, unknown>>>()
	for (const create of nestedCreates) {
		nestedMutationData.set(entityIdentityKey(create.entityType, create.entityId), create.createData)
	}
	for (const update of nestedUpdates) {
		nestedMutationData.set(entityIdentityKey(update.entityType, update.entityId), update.data)
		nestedKeys.add(entityIdentityKey(update.entityType, update.entityId))
	}
	const all = new Map<string, ExecutionEntity>()

	const candidates: DirtyEntity[] = [...entities]
	for (const nested of nestedEntities) {
		candidates.push({
			entityType: nested.entityType,
			entityId: nested.entityId,
			changeType: 'create',
			dirtyFields: [],
			dirtyRelations: [],
		})
	}
	for (const nested of nestedUpdates) {
		candidates.push({
			entityType: nested.entityType,
			entityId: nested.entityId,
			changeType: 'update',
			dirtyFields: Object.keys(nested.data),
			dirtyRelations: [],
		})
	}

	for (const entity of candidates) {
		const key = entityIdentityKey(entity.entityType, entity.entityId)
		if (all.has(key) || vetoed.some(item => entityIdentityKey(item.entityType, item.entityId) === key)) continue
		const operation = topLevelOperations.get(key) ?? entity.changeType
		all.set(key, {
			entityType: entity.entityType,
			entityId: entity.entityId,
			operation,
			scalarData: collectSentScalars(
				store,
				entity,
				scope,
				topLevelMutations.get(key)?.data ?? nestedMutationData.get(key),
				relationFields.get(key) ?? new Set(),
			),
			nested: nestedKeys.has(key),
		})
	}

	return {
		mutations: mutations.map(mutation => ({
			...mutation,
			data: mutation.data ? { ...mutation.data } : undefined,
		})),
		entities: [...all.values()],
		hasOneChanges: sentHasOneChanges.map(change => ({ ...change, transition: { ...change.transition } })),
		hasManyChanges: sentHasManyChanges.map(change => ({
			...change,
			additions: change.additions.map(addition => ({ ...addition })),
			removals: change.removals.map(removal => ({ ...removal })),
		})),
		vetoed: [...vetoed],
		nestedEntities: [...nestedEntities],
		relationFields: [...uniqueRelationFields.values()],
		nestedCreates: nestedCreates.map(create => ({
			...create,
			createData: { ...create.createData },
			knownServerIds: [...create.knownServerIds],
		})),
		nestedUpdates: nestedUpdates.map(update => ({ ...update, data: { ...update.data } })),
		suppressedRelationItems: new Map(
			[...suppressedRelationItems].map(([key, ids]) => [key, new Set(ids)]),
		),
	}
}

function relationIdentityKey(entityType: string, entityId: string, fieldName: string): string {
	return `${entityIdentityKey(entityType, entityId)}:${fieldName}`
}

function nestedIdentityKey(
	parentEntityType: string,
	parentEntityId: string,
	fieldName: string,
	entityType: string,
	entityId: string,
): string {
	return `${relationIdentityKey(parentEntityType, parentEntityId, fieldName)}>${entityIdentityKey(entityType, entityId)}`
}

function collectSentScalars(
	store: SnapshotStore,
	entity: Pick<DirtyEntity, 'entityType' | 'entityId' | 'changeType' | 'dirtyFields'>,
	scope: PersistScope,
	mutationData: Readonly<Record<string, unknown>> | undefined,
	relationFields: ReadonlySet<string>,
): Readonly<Record<string, unknown>> {
	if (entity.changeType === 'delete') return {}
	if (mutationData) {
		const result: Record<string, unknown> = {}
		for (const [field, value] of Object.entries(mutationData)) {
			if (!relationFields.has(field)) result[field] = value
		}
		return result
	}
	const snapshot = store.getEntitySnapshot<Record<string, unknown>>(entity.entityType, entity.entityId)
	if (!snapshot) return {}
	const fields = scope.type === 'fields'
		&& scope.entityType === entity.entityType
		&& scope.entityId === entity.entityId
		? scope.fields
		: entity.changeType === 'create'
			? Object.keys(snapshot.data)
			: store.getDirtyFields(entity.entityType, entity.entityId)
	const result: Record<string, unknown> = {}
	for (const field of fields) {
		if (field === 'id' && entity.entityId.startsWith('__temp_')) continue
		result[field] = snapshot.data[field]
	}
	return result
}
