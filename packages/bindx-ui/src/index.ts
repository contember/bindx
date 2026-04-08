/**
 * UI components for Bindx forms
 *
 * @packageDocumentation
 */

// Utils
export { cn } from './utils/cn.js'
export { uic, uiconfig, type ConfigVariants, type NoInfer } from './utils/uic.js'

// UI Components
export {
	Input,
	InputLike,
	InputBare,
	inputConfig,
} from '#bindx-ui/ui/input'
export { CheckboxInput } from '#bindx-ui/ui/checkbox-input'
export { RadioInput } from '#bindx-ui/ui/radio-input'
export { Label } from '#bindx-ui/ui/label'
export { Textarea, TextareaAutosize } from '#bindx-ui/ui/textarea'
export { Button, AnchorButton, buttonConfig } from '#bindx-ui/ui/button'
export { Overlay, type OverlayProps } from '#bindx-ui/ui/overlay'
export { Loader, LoaderIcon, type LoaderProps } from '#bindx-ui/ui/loader'
export { Progress } from '#bindx-ui/ui/progress'
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from '#bindx-ui/ui/popover'
export { Tooltip, type TooltipProps } from '#bindx-ui/ui/tooltip'
export {
	Sheet, SheetTrigger, SheetClose, SheetContent,
} from '#bindx-ui/ui/sheet'
export {
	SheetPortal, SheetOverlay,
	SheetHeader, SheetBody, SheetFooter, SheetTitle, SheetDescription,
} from '#bindx-ui/ui/sheet-layout'

// Form Components
export {
	FormContainer,
	type FormContainerProps,
	InputField,
	TextareaField,
	CheckboxField,
	RadioEnumField,
	type InputFieldProps,
	type TextareaFieldProps,
	type CheckboxFieldProps,
	type RadioEnumFieldProps,
	SelectEnumField,
	type SelectEnumFieldProps,
	FormFieldLabel,
	FormLayout,
	FormDescriptionUI,
	FormErrorUI,
	FormLabelWrapperUI,
	FormLabelUI,
	FormContainerUI,
} from '#bindx-ui/form/index'

// Labels
export {
	useFieldLabelFormatter,
	FieldLabelFormatterProvider,
	type FieldLabelFormatter,
	type FieldLabelFormatterProviderProps,
	useEnumOptionsFormatter,
	EnumOptionsFormatterProvider,
	type EnumOptionsFormatter,
	type EnumOptionsFormatterProviderProps,
} from '#bindx-ui/labels/index'

// Errors
export { useErrorFormatter } from '#bindx-ui/errors/index'

// Upload
export * from '#bindx-ui/upload/index'

// DataGrid
export * from '#bindx-ui/datagrid/index'

// Select
export * from '#bindx-ui/select/index'

// Repeater
export * from '#bindx-ui/repeater/index'

// Persist
export * from '#bindx-ui/persist/index'

// Dict
export { dict, dictFormat } from './dict.js'
