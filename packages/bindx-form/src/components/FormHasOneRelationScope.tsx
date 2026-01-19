import { useMemo, type ReactNode } from 'react'
import { FIELD_REF_META, type FieldRefMeta, type HasOneRef } from '@contember/bindx'
import { FormFieldStateProvider } from './FormFieldStateProvider.js'

/**
 * Props for FormHasOneRelationScope component
 */
export interface FormHasOneRelationScopeProps {
	/** Has-one relation handle from entity */
	readonly relation: HasOneRef<any>
	/** Children to render */
	readonly children: ReactNode
	/** Override required detection */
	readonly required?: boolean
}

/**
 * Wraps a has-one relation with FormFieldState context.
 *
 * @example
 * ```tsx
 * <Entity name="Article" by={{ id }}>
 *   {entity => (
 *     <FormHasOneRelationScope relation={entity.fields.author}>
 *       <FormLabel><label>Author</label></FormLabel>
 *       <SelectAuthor relation={entity.fields.author} />
 *     </FormHasOneRelationScope>
 *   )}
 * </Entity>
 * ```
 */
export function FormHasOneRelationScope({
	relation,
	children,
	required,
}: FormHasOneRelationScopeProps): ReactNode {
	// Get metadata from the relation handle
	const meta = relation[FIELD_REF_META] as FieldRefMeta | undefined

	const entityName = meta?.entityType ?? 'unknown'
	const fieldName = meta?.fieldName ?? 'unknown'

	const fieldInfo = useMemo(
		() => ({
			entityName,
			fieldName,
		}),
		[entityName, fieldName],
	)

	return (
		<FormFieldStateProvider
			errors={relation.$errors}
			required={required}
			dirty={relation.$isDirty}
			field={fieldInfo}
		>
			{children}
		</FormFieldStateProvider>
	)
}
