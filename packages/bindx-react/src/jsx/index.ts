// Types
export {
	BINDX_COMPONENT,
	FIELD_REF_META,
	SCOPE_REF,
	type FieldRefMeta,
	// Ref types (pointer, no data access)
	type FieldRef,
	type HasManyRef,
	type HasOneRef,
	type EntityRef,
	// Accessor types (live data access, extends Ref)
	type FieldAccessor,
	type HasManyAccessor,
	type HasOneAccessor,
	type EntityAccessor,
	// Field mapping types
	type EntityFields,
	type EntityFieldsAccessor,
	type EntityFieldsRef,
	// Component props
	type FieldProps,
	type HasManyProps,
	type HasOneProps,
	type IfProps,
	type EntityComponentProps,
	type SelectionMeta,
	type SelectionFieldMeta,
	type HasManyComponentOptions,
	type SelectionProvider,
	type AnyBrand,
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
} from './proxy.js'

// JSX Analyzer
export {
	analyzeJsx,
	collectSelection,
	convertToQuerySelection,
	debugSelection,
} from './analyzer.js'

// Components
export { Attribute, AttributeWithMeta, type AttributeProps } from './components/Attribute.js'
export { Field, FieldWithMeta } from './components/Field.js'
export { HasMany, HasManyWithMeta } from './components/HasMany.js'
export { HasOne, HasOneWithMeta } from './components/HasOne.js'
export { If, IfWithMeta } from './components/If.js'
export { Show, ShowWithMeta, type ShowProps } from './components/Show.js'
export { Entity, type EntityProps } from './components/Entity.js'
export { EntityList, type EntityListProps } from './components/EntityList.js'
export { HasRole, type HasRoleProps } from './components/HasRole.js'

// Condition DSL for <If> component
export {
	cond,
	isCondition,
	evaluateCondition,
	collectConditionFields,
	CONDITION_META,
	type Condition,
	type ConditionMeta,
} from './conditions.js'

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

// Standalone createComponent function
export { createComponent } from './standaloneCreateComponent.js'

// withCollector — attach staticRender to a component for selection collection
export { withCollector } from './withCollector.js'

export type {
	SelectionPropMeta,
	BindxComponentBase,
	BindxComponent,
	ComponentBuilder,
	ComponentBuilderState,
	CreateComponentOptions,
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
