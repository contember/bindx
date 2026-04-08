/**
 * Label components for DataGrid columns — resolve field/relation labels
 * using entity type from DataView context + field label formatter.
 *
 * All label components accept a typed field ref (from the entity proxy)
 * to ensure type-safe field identification.
 */
import type { ReactElement, ReactNode } from 'react'
import { FIELD_REF_META, type FieldRefMeta } from '@contember/bindx'
import { useDataViewContext } from '@contember/bindx-dataview'
import { useBindxContext } from '@contember/bindx-react'
import { useFieldLabelFormatter } from '#bindx-ui/labels/index'

/** Any ref that carries FIELD_REF_META (FieldRef, HasOneRef, HasManyRef) */
interface RefWithMeta {
	readonly [FIELD_REF_META]: FieldRefMeta
}

/**
 * Resolves a field label using the field label formatter context.
 * Falls back to the raw field name if no formatter or no match.
 */
export function useDefaultFieldLabel(field: RefWithMeta): ReactNode {
	const { entityType } = useDataViewContext()
	const formatter = useFieldLabelFormatter()
	const fieldName = field[FIELD_REF_META].fieldName
	return formatter(entityType, fieldName) ?? fieldName
}

/**
 * Renders a label for a scalar field using the field label formatter.
 * Resolves entity type from DataView context.
 */
export function DataViewFieldLabel({ field }: { field: RefWithMeta }): ReactElement {
	const { entityType } = useDataViewContext()
	const formatter = useFieldLabelFormatter()
	const fieldName = field[FIELD_REF_META].fieldName
	return <>{formatter(entityType, fieldName) ?? fieldName}</>
}

/**
 * Renders a label for a has-one relation.
 * Resolves the relation's target entity name via SchemaRegistry for better labels.
 */
export function DataViewHasOneLabel({ field }: { field: RefWithMeta }): ReactElement {
	const { entityType } = useDataViewContext()
	const { schema } = useBindxContext()
	const formatter = useFieldLabelFormatter()

	const fieldName = field[FIELD_REF_META].fieldName
	const targetEntity = schema?.getRelationTarget(entityType, fieldName)
	const label = formatter(entityType, fieldName)
		?? (targetEntity ? formatter(targetEntity, targetEntity) : null)
		?? fieldName

	return <>{label}</>
}

/**
 * Renders a label for a has-many relation.
 * Resolves the relation's target entity name via SchemaRegistry for better labels.
 */
export function DataViewHasManyLabel({ field }: { field: RefWithMeta }): ReactElement {
	const { entityType } = useDataViewContext()
	const { schema } = useBindxContext()
	const formatter = useFieldLabelFormatter()

	const fieldName = field[FIELD_REF_META].fieldName
	const targetEntity = schema?.getRelationTarget(entityType, fieldName)
	const label = formatter(entityType, fieldName)
		?? (targetEntity ? formatter(targetEntity, targetEntity) : null)
		?? fieldName

	return <>{label}</>
}
