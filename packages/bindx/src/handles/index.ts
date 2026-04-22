export { BaseHandle, EntityRelatedHandle } from './BaseHandle.js'
export { FieldHandle } from './FieldHandle.js'
export { EntityHandle } from './EntityHandle.js'
export { HasOneHandle } from './HasOneHandle.js'
export { PlaceholderHandle } from './PlaceholderHandle.js'
export { HasManyListHandle } from './HasManyListHandle.js'
export {
	FIELD_REF_META,
	type HasOneRelationState,
	type EntityFields,
	type EntityFieldsAccessor,
	type EntityFieldsRef,
	type ScalarKeys,
	type HasManyKeys,
	type HasOneKeys,
	type FieldRefMeta,
	type InputProps,
	// Ref types (pointer, no data access)
	type FieldRef,
	type HasManyRef,
	type HasOneRef,
	type HasOneRefInterface,
	type EntityRef,
	type EntityRefInterface,
	// Accessor types (live data access, extends Ref)
	type FieldAccessor,
	type HasManyAccessor,
	type HasOneAccessor,
	type EntityAccessor,
	type Unsubscribe,
	// Type extraction helpers
	type ExtractHasOneEntityName,
	type ExtractHasManyEntityName,
	type ExtractHasOneEntity,
	type ExtractHasManyEntity,
	type ExtractEntityRefEntity,
	type ExtractRoleMap,
} from './types.js'
