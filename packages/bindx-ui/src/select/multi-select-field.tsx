/**
 * MultiSelectField — styled multi-select input for has-many relations.
 *
 * Renders selected entities as chips with remove buttons, and a popover
 * with searchable option list.
 *
 * `options` is auto-derived from the field's relation target entity.
 *
 * Usage:
 * ```tsx
 * <Entity entity={schema.Article} by={{ id }}>
 *   {article => (
 *     <MultiSelectField field={article.tags}>
 *       {it => it.name.value}
 *     </MultiSelectField>
 *   )}
 * </Entity>
 * ```
 */

import React, { type ReactNode, useMemo } from 'react'
import type { EntityRef, HasManyRef, OrderDirection } from '@contember/bindx'
import { entityDef, FIELD_REF_META } from '@contember/bindx'
import type { FieldRef } from '@contember/bindx'
import { HasMany, withCollector } from '@contember/bindx-react'
import { MultiSelect, SelectEachValue, SelectPlaceholder } from '@contember/bindx-dataview'
import { FormHasManyRelationScope } from '@contember/bindx-form'
import { FormContainer } from '../form/container.js'
import { Popover, PopoverTrigger } from '../ui/popover.js'
import { ChevronDownIcon } from 'lucide-react'
import { DefaultSelectDataView } from './list.js'
import {
	MultiSelectItemContentUI,
	MultiSelectItemRemoveButtonUI,
	MultiSelectItemUI,
	MultiSelectItemWrapperUI,
	SelectDefaultPlaceholderUI,
	SelectInputActionsUI,
	SelectInputUI,
	SelectInputWrapperUI,
	SelectPopoverContent,
} from './ui.js'

/** Extract the target entity type from a HasManyRef */
type HasManyTarget<F> = F extends HasManyRef<infer TEntity> ? TEntity : object

/** Scalar field keys of an entity (for filter/sorting) */
type ScalarKeys<T> = { [K in keyof T]: T[K] extends (object | object[] | null) ? never : K }[keyof T] & string

export interface MultiSelectFieldProps<F extends HasManyRef<any> = HasManyRef<object>> {
	/** Has-many relation field */
	field: F
	/** Per-item render function */
	children: (it: EntityRef<HasManyTarget<F>>) => ReactNode
	/** Placeholder when nothing is selected */
	placeholder?: ReactNode
	/** Field(s) to search across. Auto-derived from children if omitted. */
	queryField?: FieldRef<unknown> | FieldRef<unknown>[] | string[]
	/** Initial sort order */
	initialSorting?: Partial<Record<ScalarKeys<HasManyTarget<F>>, OrderDirection>>
	/** Filter for the options list */
	filter?: Partial<Record<ScalarKeys<HasManyTarget<F>>, unknown>>
	/** Field label */
	label?: ReactNode
	/** Field description */
	description?: ReactNode
	/** Whether this field is required */
	required?: boolean
}

export const MultiSelectField = withCollector(function MultiSelectField<F extends HasManyRef<any>>({
	field,
	children,
	placeholder,
	queryField,
	initialSorting,
	filter,
	label,
	description,
	required,
}: MultiSelectFieldProps<F>): ReactNode {
	const options = useMemo(() => {
		if (!field) return null
		const meta = field[FIELD_REF_META]
		if (meta?.targetType) return entityDef(meta.targetType)
		if (meta?.entityType) return entityDef(meta.entityType)
		throw new Error('MultiSelectField: cannot derive options entity from field.')
	}, [field])

	if (!field || !options) return null

	return (
		<FormHasManyRelationScope relation={field} required={required}>
			<FormContainer label={label} description={description} required={required}>
				<MultiSelect
					relation={field}
					options={options}
				>
					<div className="flex gap-1 items-center">
						<Popover>
							<SelectInputWrapperUI>
								<PopoverTrigger asChild>
									<SelectInputUI>
										<SelectPlaceholder>
											{placeholder ?? <SelectDefaultPlaceholderUI />}
										</SelectPlaceholder>
										<MultiSelectItemWrapperUI>
											<SelectEachValue>
												{(entity) => (
													<MultiSelectItemUI>
														<MultiSelectItemContentUI>
															{children(entity as EntityRef<HasManyTarget<F>>)}
														</MultiSelectItemContentUI>
														<MultiSelectItemRemoveButtonUI
															onClick={(e: React.MouseEvent) => {
																e.stopPropagation()
																field.disconnect(entity.id)
															}}
														/>
													</MultiSelectItemUI>
												)}
											</SelectEachValue>
										</MultiSelectItemWrapperUI>
										<SelectInputActionsUI>
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
									{children as (it: EntityRef<object>) => ReactNode}
								</DefaultSelectDataView>
							</SelectPopoverContent>
						</Popover>
					</div>
				</MultiSelect>
			</FormContainer>
		</FormHasManyRelationScope>
	)
}, (props) => (
	<HasMany field={props.field}>
		{entity => props.children(entity)}
	</HasMany>
))
