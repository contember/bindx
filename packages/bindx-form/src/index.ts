/**
 * Form components for Bindx
 *
 * @packageDocumentation
 */

// Types
export type {
	FormFieldState,
	FormInputHandler,
	FormInputHandlerContext,
	FormInputHandlerFactory,
	ColumnType,
	TypeHandlerMap,
	FormFieldScopeProps,
	FormFieldStateProviderProps,
	FormInputProps,
	FormCheckboxProps,
	FormRadioInputProps,
	FormLabelProps,
	FormErrorProps,
} from './types.js'

// Contexts
export {
	FormFieldStateContext,
	useFormFieldState,
	useRequiredFormFieldState,
	useFormFieldId,
	useFormErrors,
} from './contexts.js'

// Hooks
export {
	useFormInputHandler,
	getDefaultInputProps,
	type UseFormInputHandlerOptions,
	useFormInputValidationHandler,
	type ValidationHandlerResult,
} from './hooks/index.js'

// Components
export {
	SlotInput,
	type SlotInputProps,
	FormFieldStateProvider,
	FormFieldScope,
	FormInput,
	FormCheckbox,
	FormRadioInput,
	FormLabel,
	FormError,
	FormHasOneRelationScope,
	FormHasManyRelationScope,
	type FormHasOneRelationScopeProps,
	type FormHasManyRelationScopeProps,
} from './components/index.js'
