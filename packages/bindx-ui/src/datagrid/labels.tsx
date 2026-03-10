/**
 * Label components for DataGrid columns — resolve field/relation labels
 * using entity type from DataView context + field label formatter.
 */
import type { ReactElement } from 'react'
import { useDataViewContext } from '@contember/bindx-dataview'
import { useBindxContext } from '@contember/bindx-react'
import { useFieldLabelFormatter } from '../labels/index.js'

/**
 * Renders a label for a scalar field using the field label formatter.
 * Resolves entity type from DataView context.
 */
export function DataViewFieldLabel({ field }: { field: string }): ReactElement {
	const { entityType } = useDataViewContext()
	const formatter = useFieldLabelFormatter()
	return <>{formatter(entityType, field) ?? field}</>
}

/**
 * Renders a label for a has-one relation.
 * Resolves the relation's target entity name via SchemaRegistry for better labels.
 */
export function DataViewHasOneLabel({ field }: { field: string }): ReactElement {
	const { entityType } = useDataViewContext()
	const { schema } = useBindxContext()
	const formatter = useFieldLabelFormatter()

	const targetEntity = schema?.getRelationTarget(entityType, field)
	const label = formatter(entityType, field)
		?? (targetEntity ? formatter(targetEntity, targetEntity) : null)
		?? field

	return <>{label}</>
}

/**
 * Renders a label for a has-many relation.
 * Resolves the relation's target entity name via SchemaRegistry for better labels.
 */
export function DataViewHasManyLabel({ field }: { field: string }): ReactElement {
	const { entityType } = useDataViewContext()
	const { schema } = useBindxContext()
	const formatter = useFieldLabelFormatter()

	const targetEntity = schema?.getRelationTarget(entityType, field)
	const label = formatter(entityType, field)
		?? (targetEntity ? formatter(targetEntity, targetEntity) : null)
		?? field

	return <>{label}</>
}
