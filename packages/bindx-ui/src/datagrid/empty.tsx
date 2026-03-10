/**
 * DataGrid empty state.
 */
import type { ReactElement } from 'react'
import { dict } from '../dict.js'

export const DataGridNoResults = (): ReactElement => (
	<div className="p-4 text-lg rounded-md border border-gray-200">
		{dict.datagrid.empty}
	</div>
)
