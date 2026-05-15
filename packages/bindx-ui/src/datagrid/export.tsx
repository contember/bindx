/**
 * DataGrid export button.
 */
import type { ReactElement } from 'react'
import { DataViewExportTrigger } from '@contember/bindx-dataview'
import { DownloadIcon } from 'lucide-react'
import { Button } from '#bindx-ui/ui/button'
import { dict } from '../dict.js'

export const DataGridAutoExport = (): ReactElement => {
	return (
		<DataViewExportTrigger>
			<Button variant="outline" size="sm" className="gap-2">
				<DownloadIcon className="w-4 h-4" />
				{dict.datagrid.export}
			</Button>
		</DataViewExportTrigger>
	)
}
