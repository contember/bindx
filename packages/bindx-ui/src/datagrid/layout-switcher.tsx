/**
 * DataGrid layout switcher.
 */
import type { ReactElement } from 'react'
import { DataViewLayoutTrigger, useDataViewSelectionState } from '@contember/bindx-dataview'
import { dict } from '../dict.js'

export const DataGridLayoutSwitcher = (): ReactElement => {
	const { layouts } = useDataViewSelectionState()

	return (
		<div>
			<p className="text-xs font-medium text-gray-500 mb-1.5">{dict.datagrid.layout}</p>
			<div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
				{layouts.map(it => (
					<DataViewLayoutTrigger name={it.name} key={it.name}>
						<button className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors data-[active]:bg-gray-100 data-[active]:text-gray-900 data-[active]:font-medium">
							{it.label}
						</button>
					</DataViewLayoutTrigger>
				))}
			</div>
		</div>
	)
}
