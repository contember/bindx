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
export {
	Field,
	HasMany,
	HasOne,
	If,
	Show,
	type ShowProps,
} from './components.js'

// Entity component
export { Entity, type EntityProps } from './Entity.js'
