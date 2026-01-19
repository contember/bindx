import { useMemo, type ReactNode } from 'react'
import { FIELD_REF_META, type FieldRefMeta, type HasManyRef } from '@contember/bindx'
import { FormFieldStateProvider } from './FormFieldStateProvider.js'

/**
 * Props for FormHasManyRelationScope component
 */
export interface FormHasManyRelationScopeProps {
	/** Has-many relation handle from entity */
	readonly relation: HasManyRef<any>
	/** Children to render */
	readonly children: ReactNode
	/** Override required detection */
	readonly required?: boolean
}

/**
 * Wraps a has-many relation with FormFieldState context.
 *
 * @example
 * ```tsx
 * <Entity name="Article" by={{ id }}>
 *   {entity => (
 *     <FormHasManyRelationScope relation={entity.fields.tags}>
 *       <FormLabel><label>Tags</label></FormLabel>
 *       <TagsMultiSelect relation={entity.fields.tags} />
 *     </FormHasManyRelationScope>
 *   )}
 * </Entity>
 * ```
 */
export function FormHasManyRelationScope({
	relation,
	children,
	required,
}: FormHasManyRelationScopeProps): ReactNode {
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
			errors={relation.errors}
			required={required}
			dirty={relation.isDirty}
			field={fieldInfo}
		>
			{children}
		</FormFieldStateProvider>
	)
}
