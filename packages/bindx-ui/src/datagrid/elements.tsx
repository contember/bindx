/**
 * DataGrid column visibility controls.
 */
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { Fragment, type ReactElement, type ReactNode } from 'react'
import { type DataViewElementData, DataViewVisibilityTrigger, useDataViewContext, useDataViewElements } from '@contember/bindx-dataview'
import { useFieldLabelFormatter } from '#bindx-ui/labels/index'
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
			<p className="text-xs font-medium text-gray-500 mb-1.5">{dict.datagrid.visibleFields}</p>
			<div className="max-h-48 overflow-y-auto flex flex-col -ml-1">
				<DataGridToolbarVisibleElementsList elements={resolvedElements} />
			</div>
		</div>
	)
}

function ResolvedElementLabel({ element }: { element: DataViewElementData }): ReactNode {
	const { entityType } = useDataViewContext()
	const formatter = useFieldLabelFormatter()
	if (element.label != null) return element.label
	return formatter(entityType, element.name) ?? element.name
}

const DataGridToolbarVisibleElementsList = ({ elements }: { elements: readonly DataViewElementData[] }): ReactElement => {
	return (
		<>
			{elements.map(element => {
				if (!element.name) return null
				return (
					<Fragment key={element.name}>
						<DataViewVisibilityTrigger name={element.name} value={it => !(it ?? true)}>
							<button className="group flex items-center gap-2 w-full text-left py-0.5 text-xs transition-colors text-gray-400 data-[current=true]:text-gray-700 hover:text-gray-600">
								<EyeIcon className="h-3 w-3 shrink-0 hidden group-data-[current=true]:block" />
								<EyeOffIcon className="h-3 w-3 shrink-0 block group-data-[current=true]:hidden" />
								<span><ResolvedElementLabel element={element} /></span>
							</button>
						</DataViewVisibilityTrigger>
					</Fragment>
				)
			})}
		</>
	)
}
