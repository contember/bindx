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
	type SelectedEntityFields,
	type SelectedEntityFieldsBase,
	type ScalarKeys,
	type HasManyKeys,
	type HasOneKeys,
	type FieldRefMeta,
	type InputProps,
	// Full types (for explicit selection - have .value, .length, etc.)
	type FieldRef,
	type HasManyRef,
	type HasOneRef,
	type HasOneAccessor,
	type EntityRef,
	type EntityAccessor,
	// Base types (for implicit selection - no .value, .length, etc.)
	type FieldRefBase,
	type HasManyRefBase,
	type HasOneRefBase,
	type HasOneAccessorBase,
	type EntityRefBase,
	type EntityAccessorBase,
	type Unsubscribe,
	// Type extraction helpers
	type ExtractHasOneEntityName,
	type ExtractHasManyEntityName,
	type ExtractRoleMap,
} from './types.js'
