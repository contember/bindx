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
	CheckboxInput,
	RadioInput,
	inputConfig,
} from './ui/input.js'
export { Label } from './ui/label.js'
export { Textarea, TextareaAutosize } from './ui/textarea.js'
export { Button, AnchorButton, buttonConfig } from './ui/button.js'
export { Overlay, type OverlayProps } from './ui/overlay.js'
export { Loader, LoaderIcon, type LoaderProps } from './ui/loader.js'
export { Progress } from './ui/progress.js'
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from './ui/popover.js'
export { Tooltip, type TooltipProps } from './ui/tooltip.js'

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
	FormFieldLabel,
	FormLayout,
	FormDescriptionUI,
	FormErrorUI,
	FormLabelWrapperUI,
	FormLabelUI,
	FormContainerUI,
} from './form/index.js'

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
} from './labels/index.js'

// Errors
export { useErrorFormatter } from './errors/index.js'

// Upload
export * from './upload/index.js'

// DataGrid
export * from './datagrid/index.js'

// Dict
export { dict, dictFormat } from './dict.js'
