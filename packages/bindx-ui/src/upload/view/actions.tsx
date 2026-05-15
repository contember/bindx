import { type ReactNode, type MouseEvent } from 'react'
import { EditIcon, InfoIcon, TrashIcon } from 'lucide-react'
import { Button } from '#bindx-ui/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '#bindx-ui/ui/popover'

export interface FileActionsProps {
	metadata?: ReactNode
	onRemove?: () => void
	onEdit?: () => void
	editContent?: ReactNode
	actions?: ReactNode
}

export const FileActions = ({
	metadata,
	onRemove,
	onEdit,
	editContent,
	actions,
}: FileActionsProps): ReactNode => {
	return (
		<div className="absolute -top-2 -right-1 p-0.5 bg-gray-200 border border-gray-300 rounded-sm shadow-sm flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
			{actions}
			{editContent && (
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="xs"
							className="p-0.5 h-5 w-5"
							onClick={(e: MouseEvent) => e.stopPropagation()}
						>
							<EditIcon className="h-4 w-4" />
						</Button>
					</PopoverTrigger>
					<PopoverContent>
						{editContent}
					</PopoverContent>
				</Popover>
			)}
			{onEdit && !editContent && (
				<Button
					variant="ghost"
					size="xs"
					className="p-0.5 h-5 w-5"
					onClick={(e: MouseEvent) => {
						e.stopPropagation()
						onEdit()
					}}
				>
					<EditIcon className="h-4 w-4" />
				</Button>
			)}
			{metadata && (
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="xs"
							className="p-0.5 h-5 w-5"
							onClick={(e: MouseEvent) => e.stopPropagation()}
						>
							<InfoIcon className="h-4 w-4" />
						</Button>
					</PopoverTrigger>
					<PopoverContent>
						<div className="text-sm">
							{metadata}
						</div>
					</PopoverContent>
				</Popover>
			)}
			{onRemove && (
				<Button
					variant="ghost"
					size="xs"
					className="p-0.5 h-5 w-5 text-red-500"
					onClick={(e: MouseEvent) => {
						e.stopPropagation()
						onRemove()
					}}
				>
					<TrashIcon className="h-4 w-4" />
				</Button>
			)}
		</div>
	)
}
