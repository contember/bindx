import type { ReactNode } from 'react'
import type { EntityRef, HasManyRef, AnyBrand } from '@contember/bindx'
import { HasMany, withCollector } from '@contember/bindx-react'
import { Repeater, type RepeaterItemInfo } from '@contember/bindx-repeater'
import { PlusCircleIcon, Trash2Icon } from 'lucide-react'
import { Button } from '../ui/button.js'
import { uic } from '../utils/uic.js'
import { dict } from '../dict.js'

// ============================================================================
// UI Components
// ============================================================================

const RepeaterWrapperUI = uic('div', {
	baseClass: 'flex flex-col gap-2 relative bg-background mb-4',
})

const RepeaterItemUI = uic('div', {
	baseClass: 'rounded-sm border border-gray-200 bg-gray-50 p-4 relative group/repeater-item',
})

const RepeaterEmptyUI = uic('div', {
	baseClass: 'italic text-sm text-gray-600',
})

const RepeaterItemActionsUI = uic('div', {
	baseClass: 'absolute top-1 right-2 flex gap-2',
})

// ============================================================================
// DefaultRepeater
// ============================================================================

export interface DefaultRepeaterProps<
	TEntity extends object = object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	/** The has-many relation field */
	readonly field: HasManyRef<TEntity, TSelected, TBrand, TEntityName, TSchema>
	/** Optional field name for sorting */
	readonly sortableBy?: string
	/** Section title */
	readonly title?: ReactNode
	/** Label for the add button */
	readonly addButtonLabel?: ReactNode
	/** Where to show the add button */
	readonly addButtonPosition?: 'none' | 'after' | 'before' | 'around'
	/** Whether to show the remove button on each item */
	readonly showRemoveButton?: boolean
	/** Per-item render function */
	readonly children: (
		entity: EntityRef<TEntity, TSelected, TBrand, TEntityName, TSchema>,
		info: RepeaterItemInfo,
	) => ReactNode
}

/**
 * A styled repeater with add/remove buttons and empty state.
 *
 * @example
 * ```tsx
 * <DefaultRepeater field={entity.items} addButtonLabel="Add item">
 *   {(item, { remove }) => (
 *     <InputField field={item.name} />
 *   )}
 * </DefaultRepeater>
 * ```
 */
export const DefaultRepeater = withCollector(function DefaultRepeater<
	TEntity extends object,
	TSelected,
	TBrand extends AnyBrand,
	TEntityName extends string,
	TSchema extends Record<string, object>,
>({
	field,
	sortableBy,
	title,
	addButtonLabel,
	addButtonPosition = 'after',
	showRemoveButton = true,
	children,
}: DefaultRepeaterProps<TEntity, TSelected, TBrand, TEntityName, TSchema>): ReactNode {
	return (
		<Repeater field={field} sortableBy={sortableBy}>
			{(items, { addItem, isEmpty }) => (
				<RepeaterWrapperUI>
					{title && <h3 className="font-medium">{title}</h3>}

					{(addButtonPosition === 'before' || addButtonPosition === 'around') && (
						<AddButton onClick={() => addItem('first')}>{addButtonLabel}</AddButton>
					)}

					{isEmpty && (
						<RepeaterEmptyUI>{dict.repeater.empty}</RepeaterEmptyUI>
					)}

					{items.map((entity, info) => (
						<RepeaterItemUI key={entity.id}>
							{showRemoveButton && (
								<RepeaterItemActionsUI>
									<Button variant="link" size="sm" className="gap-1 px-0 group/button" onClick={info.remove}>
										<Trash2Icon className="group-hover/button:text-red-600" size={16} />
									</Button>
								</RepeaterItemActionsUI>
							)}
							{children(entity, info)}
						</RepeaterItemUI>
					))}

					{(addButtonPosition === 'after' || addButtonPosition === 'around') && (
						<AddButton onClick={() => addItem()}>{addButtonLabel}</AddButton>
					)}
				</RepeaterWrapperUI>
			)}
		</Repeater>
	)
}, (props) => (
	<HasMany field={props.field}>
		{item => props.children(item, collectionItemInfo)}
	</HasMany>
))

function AddButton({ children, onClick }: { children?: ReactNode; onClick: () => void }): ReactNode {
	return (
		<div>
			<Button variant="link" size="sm" className="gap-1 px-0" onClick={onClick}>
				<PlusCircleIcon size={16} />
				<span>{children ?? dict.repeater.addItem}</span>
			</Button>
		</div>
	)
}

// ============================================================================
// Exports for customization
// ============================================================================

/** Mock item info for use in staticRender during selection collection. */
export const collectionItemInfo: RepeaterItemInfo = Object.freeze({
	index: 0,
	isFirst: true,
	isLast: true,
	remove: () => {},
	moveUp: () => {},
	moveDown: () => {},
})

export {
	RepeaterWrapperUI,
	RepeaterItemUI,
	RepeaterEmptyUI,
	RepeaterItemActionsUI,
}
