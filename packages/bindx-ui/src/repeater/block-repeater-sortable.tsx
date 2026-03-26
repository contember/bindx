import { useState, type ReactNode } from 'react'
import type { EntityAccessor, HasManyAccessor, AnyBrand } from '@contember/bindx'
import type {
	BlockRepeaterItemInfo,
	BlockRepeaterItems,
	BlockRepeaterMethods,
} from '@contember/bindx-repeater'
import { sortEntities, repairEntitiesOrder } from '@contember/bindx-repeater'
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
import { GripVerticalIcon } from 'lucide-react'
import { BlockRepeaterItemUI } from '#bindx-ui/repeater/block-repeater-ui'
import { BlockItemContent } from '#bindx-ui/repeater/block-repeater-item'
import type { BlockRenderDefinition } from '#bindx-ui/repeater/block-repeater'

interface SortableBlockListProps<TEntity, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string> {
	items: BlockRepeaterItems<TEntity, TSelected, TBrand, TEntityName, TSchema>
	methods: BlockRepeaterMethods<TBlockNames>
	field: HasManyAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>
	sortableBy: string
	blocks: Record<TBlockNames, BlockRenderDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>
	showRemoveButton: boolean
}

export function SortableBlockList<TEntity extends object, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string>({
	items,
	field,
	sortableBy,
	blocks,
	showRemoveButton,
}: SortableBlockListProps<TEntity, TSelected, TBrand, TEntityName, TSchema, TBlockNames>): ReactNode {
	const [activeId, setActiveId] = useState<string | null>(null)

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
		useSensor(KeyboardSensor),
	)

	const entityIds: string[] = []
	items.map((entity) => {
		entityIds.push(entity.id)
		return null
	})

	const handleDragEnd = (event: DragEndEvent): void => {
		setActiveId(null)
		const { active, over } = event
		if (!over || active.id === over.id) return

		const sorted = sortEntities(field.items, sortableBy) as EntityAccessor<TEntity, TSelected>[]
		const oldIndex = sorted.findIndex(e => e.id === active.id)
		const newIndex = sorted.findIndex(e => e.id === over.id)
		if (oldIndex === -1 || newIndex === -1) return

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

interface SortableBlockItemProps<TEntity, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string> {
	entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>
	info: BlockRepeaterItemInfo
	blocks: Record<TBlockNames, BlockRenderDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>
	showRemoveButton: boolean
}

export function SortableBlockItem<TEntity, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string>({
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
