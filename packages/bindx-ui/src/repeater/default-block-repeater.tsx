import { useState, type ReactNode } from 'react'
import type { EntityAccessor, HasManyRef, AnyBrand } from '@contember/bindx'
import { HasMany, withCollector, useHasMany } from '@contember/bindx-react'
import {
	BlockRepeater,
	type BlockDefinition,
	type BlockRepeaterItemInfo,
	type BlockRepeaterItems,
	type BlockRepeaterMethods,
	sortEntities,
	repairEntitiesOrder,
} from '@contember/bindx-repeater'
import {
	DndContext,
	closestCenter,
	MouseSensor,
	TouchSensor,
	KeyboardSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
	DragOverlay,
} from '@dnd-kit/core'
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon, PlusCircleIcon, Trash2Icon, XIcon } from 'lucide-react'
import { Button } from '#bindx-ui/ui/button'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetBody,
	SheetTitle,
	SheetFooter,
	SheetClose,
} from '#bindx-ui/ui/sheet'
import {
	RepeaterWrapperUI,
	RepeaterEmptyUI,
	collectionItemInfo,
} from '#bindx-ui/repeater/default-repeater'
import { dict } from '../dict.js'
import { uic } from '../utils/uic.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Block definition with render and optional form for dual-mode.
 *
 * - `render` always required — used as inline content (no form) or preview (with form)
 * - `form` optional — when present, render shows a clickable preview and form opens in a sheet
 */
export interface BlockRenderDefinition<
	TEntity extends object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	label?: ReactNode
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

// ============================================================================
// UI Components
// ============================================================================

const BlockRepeaterItemUI = uic('div', {
	baseClass: 'rounded-lg border border-gray-200 bg-white relative group/repeater-item shadow-sm',
})

const BlockRepeaterItemContentUI = uic('div', {
	baseClass: 'p-4',
})

const BlockRepeaterItemActionsUI = uic('div', {
	baseClass: 'absolute top-2 right-2 flex gap-1 opacity-0 group-hover/repeater-item:opacity-100 transition-opacity',
})

// ============================================================================
// DefaultBlockRepeater
// ============================================================================

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
		<BlockRepeater
			field={field}
			discriminationField={discriminationField}
			sortableBy={sortableBy}
			blocks={blocks as unknown as Record<TBlockNames, BlockDefinition<object, object>>}
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
							field={field}
							sortableBy={sortableBy}
							blocks={blocks}
							showRemoveButton={showRemoveButton}
						/>
					) : (
						<PlainBlockList
							items={items}
							blocks={blocks}
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
		</BlockRepeater>
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
					{Object.values<BlockRenderDefinition<object>>(props.blocks).map((blockDef, i) => {
						const info = { ...blockCollectionInfo, index: i }
						return (
							<React.Fragment key={i}>
								{blockDef.render(item as EntityAccessor<object, object>, info)}
								{blockDef.form?.(item as EntityAccessor<object, object>, info)}
							</React.Fragment>
						)
					})}
				</>
			)
		}}
	</HasMany>
))

// ============================================================================
// Non-sortable list (no DnD)
// ============================================================================

import React from 'react'

interface PlainBlockListProps<TEntity extends object, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string> {
	items: BlockRepeaterItems<TEntity, TSelected, TBrand, TEntityName, TSchema>
	blocks: Record<TBlockNames, BlockRenderDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>
	showRemoveButton: boolean
}

function PlainBlockList<TEntity extends object, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string>({
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

// ============================================================================
// Sortable list (DnD)
// ============================================================================

interface SortableBlockListProps<TEntity extends object, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string> {
	items: BlockRepeaterItems<TEntity, TSelected, TBrand, TEntityName, TSchema>
	methods: BlockRepeaterMethods<TBlockNames>
	field: HasManyRef<TEntity, TSelected, TBrand, TEntityName, TSchema>
	sortableBy: string
	blocks: Record<TBlockNames, BlockRenderDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>
	showRemoveButton: boolean
}

function SortableBlockList<TEntity extends object, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string>({
	items,
	field,
	sortableBy,
	blocks,
	showRemoveButton,
}: SortableBlockListProps<TEntity, TSelected, TBrand, TEntityName, TSchema, TBlockNames>): ReactNode {
	const fieldAccessor = useHasMany(field)
	const [activeId, setActiveId] = useState<string | null>(null)

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
		useSensor(KeyboardSensor),
	)

	// Collect entity IDs for SortableContext
	const entityIds: string[] = []
	items.map((entity) => {
		entityIds.push(entity.id)
		return null
	})

	const handleDragEnd = (event: DragEndEvent): void => {
		setActiveId(null)
		const { active, over } = event
		if (!over || active.id === over.id) return

		const sorted = sortEntities(fieldAccessor.items, sortableBy) as EntityAccessor<TEntity, TSelected>[]
		const oldIndex = sorted.findIndex(e => e.id === active.id)
		const newIndex = sorted.findIndex(e => e.id === over.id)
		if (oldIndex === -1 || newIndex === -1) return

		// Reorder: remove from old, insert at new
		const moved = [...sorted]
		const [item] = moved.splice(oldIndex, 1)
		moved.splice(newIndex, 0, item!)
		repairEntitiesOrder(moved, sortableBy)
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={(e: { active: { id: string | number } }) => setActiveId(String(e.active.id))}
			onDragEnd={handleDragEnd}
			onDragCancel={() => setActiveId(null)}
		>
			<SortableContext items={entityIds} strategy={verticalListSortingStrategy}>
				{items.map((entity, info) => (
					<SortableBlockItem
						key={entity.id}
						entity={entity}
						info={info}
						blocks={blocks}
						showRemoveButton={showRemoveButton}
					/>
				))}
			</SortableContext>
			<DragOverlay>
				{activeId && items.map((entity, info) => {
					if (entity.id !== activeId) return null
					return (
						<BlockRepeaterItemUI key={entity.id} className="shadow-lg opacity-90">
							<BlockItemContent entity={entity} info={info} blocks={blocks} showRemoveButton={false} />
						</BlockRepeaterItemUI>
					)
				})}
			</DragOverlay>
		</DndContext>
	)
}

// ============================================================================
// Sortable item wrapper
// ============================================================================

interface SortableBlockItemProps<TEntity extends object, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string> {
	entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>
	info: BlockRepeaterItemInfo
	blocks: Record<TBlockNames, BlockRenderDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>
	showRemoveButton: boolean
}

function SortableBlockItem<TEntity extends object, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string>({
	entity,
	info,
	blocks,
	showRemoveButton,
}: SortableBlockItemProps<TEntity, TSelected, TBrand, TEntityName, TSchema, TBlockNames>): ReactNode {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: entity.id })

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.4 : undefined,
	}

	return (
		<BlockRepeaterItemUI ref={setNodeRef} style={style} {...attributes}>
			<div className="flex">
				<button
					ref={setActivatorNodeRef}
					{...listeners}
					className="flex items-center px-2 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none border-r border-gray-100"
					tabIndex={-1}
				>
					<GripVerticalIcon size={16} />
				</button>
				<div className="flex-1 min-w-0">
					<BlockItemContent entity={entity} info={info} blocks={blocks} showRemoveButton={showRemoveButton} />
				</div>
			</div>
		</BlockRepeaterItemUI>
	)
}

// ============================================================================
// Block item (plain, no sortable wrapper)
// ============================================================================

interface BlockItemProps<TEntity extends object, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string> {
	entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>
	info: BlockRepeaterItemInfo
	blocks: Record<TBlockNames, BlockRenderDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>
	showRemoveButton: boolean
}

function BlockItem<TEntity extends object, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string>({
	entity,
	info,
	blocks,
	showRemoveButton,
}: BlockItemProps<TEntity, TSelected, TBrand, TEntityName, TSchema, TBlockNames>): ReactNode {
	return (
		<BlockRepeaterItemUI key={entity.id}>
			<BlockItemContent entity={entity} info={info} blocks={blocks} showRemoveButton={showRemoveButton} />
		</BlockRepeaterItemUI>
	)
}

// ============================================================================
// Block item content with dual-mode (render/form)
// ============================================================================

function BlockItemContent<TEntity extends object, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string>({
	entity,
	info,
	blocks,
	showRemoveButton,
}: BlockItemProps<TEntity, TSelected, TBrand, TEntityName, TSchema, TBlockNames>): ReactNode {
	const [editOpen, setEditOpen] = useState(entity.$isNew)

	const blockDef = info.blockType !== null
		? (blocks as Record<string, BlockRenderDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>)[info.blockType]
		: undefined

	if (!blockDef) return null

	const hasForm = blockDef.form !== undefined

	// Dual mode: render is preview, form opens in sheet
	if (hasForm) {
		return (
			<>
				<div
					className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg"
					onClick={() => setEditOpen(true)}
				>
					{showRemoveButton && (
						<BlockRepeaterItemActionsUI>
							<Button
								variant="outline"
								size="icon"
								className="h-7 w-7 text-gray-400 hover:text-red-600 hover:border-red-200 bg-white"
								onClick={(e: React.MouseEvent) => { e.stopPropagation(); info.remove() }}
							>
								<Trash2Icon size={14} />
							</Button>
						</BlockRepeaterItemActionsUI>
					)}
					{blockDef.render(entity, info)}
				</div>
				<Sheet open={editOpen} onOpenChange={setEditOpen} modal={false}>
					<SheetContent onFocusOutside={(e: Event) => e.preventDefault()}>
						<SheetHeader>
							<SheetTitle>{info.block?.label ?? info.blockType}</SheetTitle>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									className="gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-200"
									onClick={() => { info.remove(); setEditOpen(false) }}
								>
									<Trash2Icon size={16} />
									{dict.blockRepeater.delete}
								</Button>
								<SheetClose asChild>
									<Button variant="outline" size="sm">
										<XIcon size={16} />
									</Button>
								</SheetClose>
							</div>
						</SheetHeader>
						<SheetBody>
							{blockDef.form!(entity, info)}
						</SheetBody>
						<SheetFooter>
							<SheetClose asChild>
								<Button variant="outline">{dict.blockRepeater.close}</Button>
							</SheetClose>
						</SheetFooter>
					</SheetContent>
				</Sheet>
			</>
		)
	}

	// Inline mode: render is the full content
	return (
		<BlockRepeaterItemContentUI>
			{showRemoveButton && (
				<BlockRepeaterItemActionsUI>
					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7 text-gray-400 hover:text-red-600 hover:border-red-200 bg-white"
						onClick={info.remove}
					>
						<Trash2Icon size={14} />
					</Button>
				</BlockRepeaterItemActionsUI>
			)}
			{blockDef.render(entity, info)}
		</BlockRepeaterItemContentUI>
	)
}

// ============================================================================
// Add block button
// ============================================================================

function AddBlockButton({ children, onClick }: { children?: ReactNode; onClick: () => void }): ReactNode {
	return (
		<Button variant="link" size="sm" className="gap-1 px-0" onClick={onClick}>
			<PlusCircleIcon size={16} />
			<span>{children ?? dict.blockRepeater.addBlock}</span>
		</Button>
	)
}
