// Types
export {
	BINDX_COMPONENT,
	FIELD_REF_META,
	type FieldRefMeta,
	type FieldRef,
	type HasManyRef,
	type HasOneRef,
	type EntityRef,
	type EntityFields,
	type FieldProps,
	type HasManyProps,
	type HasOneProps,
	type IfProps,
	type EntityComponentProps,
	type JsxSelectionMeta,
	type JsxSelectionFieldMeta,
	type HasManyComponentOptions,
} from './types.js'

// Selection metadata
export {
	SelectionMetaCollector,
	mergeSelections,
	createEmptySelection,
	toSelectionMeta,
	fromSelectionMeta,
} from './SelectionMeta.js'

// Proxy creation
export {
	createCollectorProxy,
	createRuntimeAccessor,
} from './proxy.js'

// JSX Analyzer
export {
	analyzeJsx,
	collectSelection,
	convertToQuerySelection,
	debugSelection,
} from './analyzer.js'

// Components
export { Field, FieldWithMeta } from './components/Field.js'
export { HasMany, HasManyWithMeta } from './components/HasMany.js'
export { HasOne, HasOneWithMeta } from './components/HasOne.js'
export { If, IfWithMeta } from './components/If.js'
export { Show, ShowWithMeta, type ShowProps } from './components/Show.js'
export { Entity, type EntityProps } from './components/Entity.js'

// Entity Fragment
export {
	createEntityFragment,
	isEntityFragmentComponent,
	mergeFragments,
	ENTITY_FRAGMENT_COMPONENT,
	ENTITY_FRAGMENT_PROPS,
	type EntityFragmentComponent,
	type EntityFragmentComponentWithProps,
	type EntityPropKeys,
	type EntityFromProp,
	type EntityFragmentProperties,
} from './createEntityFragment.js'
