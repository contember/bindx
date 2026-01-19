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
	type SelectedEntityFields,
	type FieldProps,
	type HasManyProps,
	type HasOneProps,
	type IfProps,
	type EntityComponentProps,
	type SelectionMeta,
	type SelectionFieldMeta,
	type HasManyComponentOptions,
	type SelectionProvider,
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
export { Field, FieldWithMeta } from './components/Field.js'
export { HasMany, HasManyWithMeta } from './components/HasMany.js'
export { HasOne, HasOneWithMeta } from './components/HasOne.js'
export { HasRole, HasRoleWithMeta, type HasRoleComponentProps } from './components/HasRole.js'
export { If, IfWithMeta } from './components/If.js'
export { Show, ShowWithMeta, type ShowProps } from './components/Show.js'
export { Entity, type EntityProps } from './components/Entity.js'
export { EntityList, type EntityListProps } from './components/EntityList.js'

// Component builder (unified API)
export {
	isBindxComponent,
	mergeFragments,
	COMPONENT_MARKER,
	COMPONENT_BRAND,
	COMPONENT_SELECTIONS,
	createComponentBuilder,
	ComponentBuilderImpl,
	getComponentBrand,
	setBrandValidation,
	validateBrand,
} from './createComponent.js'

export type {
	SelectionPropMeta,
	BindxComponentBase,
	BindxComponent,
	ComponentBuilder,
	ComponentBuilderState,
	CreateComponentOptions,
	CreateComponentFn,
	// Interface types
	InterfaceEntityPropConfig,
	ImplicitInterfaceEntityConfig,
	ExplicitInterfaceEntityConfig,
	AddInterfaces,
	InterfaceSelectorsMap,
	AnyEntityPropConfig,
	// Entity prop config types
	EntityPropConfig,
	ImplicitEntityConfig,
	ExplicitEntityConfig,
	// State helpers
	AddImplicitEntity,
	AddExplicitEntity,
	AddImplicitInterfaceEntity,
	AddExplicitInterfaceEntity,
	SetScalarProps,
	// Props building
	BuildEntityProps,
	BuildProps,
	BuildFragmentProps,
	InitialBuilderState,
} from './createComponent.js'

// Legacy type exports for backwards compatibility
export type {
	EntityPropKeys,
	EntityFromProp,
	SelectionFromProp,
	ImplicitFragmentProperties,
} from './legacyTypes.js'
