/**
 * SelectField — styled single-select input for has-one relations.
 *
 * `options` and `queryField` are optional:
 * - `options` is auto-derived from the field's relation target entity
 * - `queryField` is auto-derived from the children render function's field accesses
 *
 * Usage:
 * ```tsx
 * <Entity entity={schema.Article} by={{ id }}>
 *   {article => (
 *     <SelectField field={article.category}>
 *       {it => it.name.value}
 *     </SelectField>
 *   )}
 * </Entity>
 * ```
 */

import React, { type ReactNode, useMemo, useState } from 'react'
import type { EntityAccessor, HasOneRef, OrderDirection } from '@contember/bindx'
import { entityDef, isPlaceholderId, FIELD_REF_META } from '@contember/bindx'
import type { FieldRefBase } from '@contember/bindx'
import { HasOne, withCollector } from '@contember/bindx-react'
import { Select, SelectEachValue, SelectPlaceholder } from '@contember/bindx-dataview'
import { FormHasOneRelationScope } from '@contember/bindx-form'
import { FormContainer } from '../form/container.js'
import { Popover, PopoverTrigger } from '../ui/popover.js'
import { Button } from '../ui/button.js'
import { ChevronDownIcon, XIcon } from 'lucide-react'
import { DefaultSelectDataView } from './list.js'
import {
	SelectDefaultPlaceholderUI,
	SelectInputActionsUI,
	SelectInputUI,
	SelectInputWrapperUI,
	SelectPopoverContent,
} from './ui.js'

/** Extract the target entity type from a HasOneRef */
type RelationTarget<F> = F extends HasOneRef<infer TEntity, any> ? TEntity : object

/** Scalar field keys of an entity (for filter/sorting) */
type ScalarKeys<T> = { [K in keyof T]: T[K] extends (object | object[] | null) ? never : K }[keyof T] & string

export interface SelectFieldProps<F extends HasOneRef<any> = HasOneRef<object>> {
	/** Has-one relation field */
	field: F
	/** Per-item render function */
	children: (it: EntityAccessor<RelationTarget<F>>) => ReactNode
	/** Placeholder when nothing is selected */
	placeholder?: ReactNode
	/** Field(s) to search across. Auto-derived from children if omitted. */
	queryField?: FieldRefBase<unknown> | FieldRefBase<unknown>[] | string[]
	/** Initial sort order — keys are typed to the target entity's scalar fields */
	initialSorting?: Partial<Record<ScalarKeys<RelationTarget<F>>, OrderDirection>>
	/** Filter for the options list — typed to the target entity */
	filter?: Partial<Record<ScalarKeys<RelationTarget<F>>, unknown>>
	/** Field label */
	label?: ReactNode
	/** Field description */
	description?: ReactNode
	/** Whether this field is required */
	required?: boolean
}

export const SelectField = withCollector(function SelectField<F extends HasOneRef<any>>({
	field,
	children,
	placeholder,
	queryField,
	initialSorting,
	filter,
	label,
	description,
	required,
}: SelectFieldProps<F>): ReactNode {
	const [open, setOpen] = useState(false)

	const options = useMemo(() => {
		if (!field) return null
		const meta = field[FIELD_REF_META]
		if (meta?.entityType) return entityDef(meta.entityType)
		throw new Error('SelectField: cannot derive options entity from field.')
	}, [field])

	if (!field || !options) return null

	return (
		<FormHasOneRelationScope relation={field} required={required}>
			<FormContainer label={label} description={description} required={required}>
				<Select
				relation={field}
				options={options}
				onSelect={() => setOpen(false)}
			>
				<div className="flex gap-1 items-center">
					<Popover open={open} onOpenChange={setOpen}>
						<SelectInputWrapperUI>
							<PopoverTrigger asChild>
								<SelectInputUI>
									<SelectPlaceholder>
										{placeholder ?? <SelectDefaultPlaceholderUI />}
									</SelectPlaceholder>
									<SelectEachValue>
										{entity => children(entity)}
									</SelectEachValue>
									<SelectInputActionsUI>
										{!isPlaceholderId(field.$entity.id) && (
											<Button
												size="xs"
												variant="ghost"
												onClick={(e: React.MouseEvent) => {
													e.stopPropagation()
													field.$disconnect()
												}}
											>
												<XIcon className="w-4 h-4" />
											</Button>
										)}
										<ChevronDownIcon className="w-4 h-4" />
									</SelectInputActionsUI>
								</SelectInputUI>
							</PopoverTrigger>
						</SelectInputWrapperUI>
						<SelectPopoverContent>
							<DefaultSelectDataView
								queryField={queryField}
								initialSorting={initialSorting}
								filter={filter}
							>
								{children}
							</DefaultSelectDataView>
						</SelectPopoverContent>
					</Popover>
				</div>
			</Select>
			</FormContainer>
		</FormHasOneRelationScope>
	)
}, (props) => (
	<HasOne field={props.field}>
		{entity => props.children(entity)}
	</HasOne>
))
