import React, { type ReactNode } from 'react'
import type { EntityAccessor, HasManyRef, AnyBrand } from '@contember/bindx'
import { HasMany, withCollector } from '@contember/bindx-react'
import {
	BlockRepeater as BlockRepeaterCore,
	type BlockDefinition,
	type BlockRepeaterItemInfo,
	type BlockRepeaterItems,
} from '@contember/bindx-repeater'
import {
	RepeaterWrapperUI,
	RepeaterEmptyUI,
} from '#bindx-ui/repeater/repeater-ui'
import { collectionItemInfo } from '#bindx-ui/repeater/repeater'
import { dict } from '../dict.js'
import { BlockItem } from '#bindx-ui/repeater/block-repeater-item'
import { SortableBlockList } from '#bindx-ui/repeater/block-repeater-sortable'
import { AddBlockButton } from '#bindx-ui/repeater/add-block-button'

/**
 * Block definition with render and optional form for dual-mode.
 *
 * - `render` always required — used as inline content (no form) or preview (with form)
 * - `form` optional — when present, render shows a clickable preview and form opens in a sheet
 */
export interface BlockRenderDefinition<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	label?: React.ReactNode
	render: (
		entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>,
		info: BlockRepeaterItemInfo,
	) => ReactNode
	form?: (
		entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>,
		info: BlockRepeaterItemInfo,
	) => ReactNode
}

export interface DefaultBlockRepeaterProps<
	TEntity extends object = object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
	TBlockNames extends string = string,
> {
	/** The has-many relation field */
	readonly field: HasManyRef<TEntity, TSelected, TBrand, TEntityName, TSchema>
	/** Name of the scalar field used to discriminate block types */
	readonly discriminationField: string
	/** Optional field name for sorting — enables drag-and-drop when set */
	readonly sortableBy?: string
	/** Section title */
	readonly title?: ReactNode
	/** Whether to show the remove button on each item */
	readonly showRemoveButton?: boolean
	/** Block definitions with render (and optional form) functions */
	readonly blocks: Record<TBlockNames, BlockRenderDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>
}

export const DefaultBlockRepeater = withCollector(function DefaultBlockRepeater<
	TEntity extends object,
	TSelected,
	TBrand extends AnyBrand,
	TEntityName extends string,
	TSchema extends Record<string, object>,
	TBlockNames extends string,
>({
	field,
	discriminationField,
	sortableBy,
	title,
	showRemoveButton = true,
	blocks,
}: DefaultBlockRepeaterProps<TEntity, TSelected, TBrand, TEntityName, TSchema, TBlockNames>): ReactNode {
	return (
		<BlockRepeaterCore
			field={field}
			discriminationField={discriminationField}
			sortableBy={sortableBy}
			blocks={blocks as Record<TBlockNames, BlockDefinition>}
		>
			{(items, methods) => (
				<RepeaterWrapperUI>
					{title && <h3 className="font-medium">{title}</h3>}

					{methods.isEmpty && (
						<RepeaterEmptyUI>{dict.repeater.empty}</RepeaterEmptyUI>
					)}

					{sortableBy ? (
						<SortableBlockList
							items={items}
							methods={methods}
							field={field as never}
							sortableBy={sortableBy}
							blocks={blocks as never}
							showRemoveButton={showRemoveButton}
						/>
					) : (
						<PlainBlockList
							items={items}
							blocks={blocks as never}
							showRemoveButton={showRemoveButton}
						/>
					)}

					<div className="flex gap-2">
						{methods.blockList.map(b => (
							<AddBlockButton key={b.name} onClick={() => methods.addItem(b.name)}>
								{b.label ?? b.name}
							</AddBlockButton>
						))}
					</div>
				</RepeaterWrapperUI>
			)}
		</BlockRepeaterCore>
	)
}, (props) => (
	<HasMany field={props.field}>
		{item => {
			const blockCollectionInfo: BlockRepeaterItemInfo = {
				...collectionItemInfo,
				blockType: null,
				block: undefined,
			}
			return (
				<>
					{Object.values<BlockRenderDefinition<object, unknown>>(props.blocks).map((blockDef, i) => {
						const info = { ...blockCollectionInfo, index: i }
						return (
							<React.Fragment key={i}>
								{blockDef.render(item as EntityAccessor<object, unknown>, info)}
								{blockDef.form?.(item as EntityAccessor<object, unknown>, info)}
							</React.Fragment>
						)
					})}
				</>
			)
		}}
	</HasMany>
))

interface PlainBlockListProps<TEntity, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string> {
	items: BlockRepeaterItems<TEntity, TSelected, TBrand, TEntityName, TSchema>
	blocks: Record<TBlockNames, BlockRenderDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>
	showRemoveButton: boolean
}

function PlainBlockList<TEntity, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string>({
	items,
	blocks,
	showRemoveButton,
}: PlainBlockListProps<TEntity, TSelected, TBrand, TEntityName, TSchema, TBlockNames>): ReactNode {
	return (
		<>
			{items.map((entity, info) => (
				<BlockItem
					key={entity.id}
					entity={entity}
					info={info}
					blocks={blocks}
					showRemoveButton={showRemoveButton}
				/>
			))}
		</>
	)
}
