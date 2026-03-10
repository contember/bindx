/**
 * DataGrid column visibility controls.
 */
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { Fragment, type ReactElement } from 'react'
import { type DataViewElementData, DataViewVisibilityTrigger, useDataViewElements } from '@contember/bindx-dataview'
import { dict } from '../dict.js'

export interface DataGridToolbarVisibleElementsProps {
	elements?: DataViewElementData[]
}

export const DataGridToolbarVisibleElements = ({ elements }: DataGridToolbarVisibleElementsProps): ReactElement | null => {
	const globalElements = useDataViewElements()
	const resolvedElements = elements ?? globalElements

	if (resolvedElements.length === 0) {
		return null
	}

	return (
		<div>
			<p className="text-gray-400 text-xs font-semibold mb-1">{dict.datagrid.visibleFields}</p>
			<div className="flex flex-col bg-gray-50 p-2 border border-gray-200 rounded-sm shadow-inner">
				<div className="max-h-48 overflow-y-auto">
					<div className="flex flex-col">
						<DataGridToolbarVisibleElementsList elements={resolvedElements} />
					</div>
				</div>
			</div>
		</div>
	)
}

const DataGridToolbarVisibleElementsList = ({ elements }: { elements: readonly DataViewElementData[] }): ReactElement => {
	return (
		<>
			{elements.map(element => {
				if (!element.name) return null
				return (
					<Fragment key={element.name}>
						<DataViewVisibilityTrigger name={element.name} value={it => !(it ?? true)}>
							<button className="gap-2 group text-gray-400 data-[current=true]:text-black text-left inline-flex items-center p-0.5 text-sm rounded-sm hover:bg-background">
								<EyeIcon className="w-3 h-3 hidden group-data-[current=true]:block" />
								<EyeOffIcon className="w-3 h-3 block group-data-[current=true]:hidden" />
								<span>{element.label}</span>
							</button>
						</DataViewVisibilityTrigger>
					</Fragment>
				)
			})}
		</>
	)
}
