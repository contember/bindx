import React, { useState, type ReactNode } from 'react'
import type { EntityAccessor, AnyBrand } from '@contember/bindx'
import type { BlockRepeaterItemInfo } from '@contember/bindx-repeater'
import { Trash2Icon, XIcon } from 'lucide-react'
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
import { dict } from '../dict.js'
import {
	BlockRepeaterItemUI,
	BlockRepeaterItemContentUI,
	BlockRepeaterItemActionsUI,
} from '#bindx-ui/repeater/block-repeater-ui'
import type { BlockRenderDefinition } from '#bindx-ui/repeater/block-repeater'

interface BlockItemProps<TEntity, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string> {
	entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>
	info: BlockRepeaterItemInfo
	blocks: Record<TBlockNames, BlockRenderDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>
	showRemoveButton: boolean
}

export function BlockItem<TEntity, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string>({
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

export function BlockItemContent<TEntity, TSelected, TBrand extends AnyBrand, TEntityName extends string, TSchema extends Record<string, object>, TBlockNames extends string>({
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
