/**
 * DataGrid tiles layout.
 */
import type { ReactElement, ReactNode } from 'react'
import { DataViewLayout, DataViewEachRow, type DataViewItem } from '@contember/bindx-dataview'
import { LayoutGridIcon } from 'lucide-react'
import { cn } from '../utils/cn.js'
import { dict } from '../dict.js'

export interface DataGridTilesProps {
	children: (item: DataViewItem, index: number) => ReactNode
	className?: string
}

export const DataGridTiles = ({ children, className }: DataGridTilesProps): ReactElement => {
	return (
		<DataViewLayout
			name="grid"
			label={<>
				<LayoutGridIcon className="w-3 h-3" />
				<span>{dict.datagrid.showGrid}</span>
			</>}
		>
			<div className={cn('grid grid-cols-2 md:grid-cols-4 gap-4', className)}>
				<DataViewEachRow>
					{children}
				</DataViewEachRow>
			</div>
		</DataViewLayout>
	)
}
