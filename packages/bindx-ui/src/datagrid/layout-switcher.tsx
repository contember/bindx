/**
 * DataGrid layout switcher.
 */
import type { ReactElement } from 'react'
import { DataViewLayoutTrigger, useDataViewSelectionState } from '@contember/bindx-dataview'
import { Button } from '../ui/button.js'
import { uic } from '../utils/uic.js'
import { dict } from '../dict.js'

const LayoutSwitchButton = uic(Button, {
	baseClass: 'data-[active]:text-blue-600 data-[active]:bg-gray-50 data-[active]:shadow-inner gap-2 flex-1',
	defaultProps: {
		variant: 'outline',
		size: 'sm',
	},
})

export const DataGridLayoutSwitcher = (): ReactElement => {
	const { layouts } = useDataViewSelectionState()

	return (
		<div>
			<p className="text-gray-400 text-xs font-semibold mb-1">{dict.datagrid.layout}</p>
			<div className="flex gap-1">
				{layouts.map(it => (
					<DataViewLayoutTrigger name={it.name} key={it.name}>
						<LayoutSwitchButton>
							{it.label}
						</LayoutSwitchButton>
					</DataViewLayoutTrigger>
				))}
			</div>
		</div>
	)
}
