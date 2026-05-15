/**
 * DataGrid loader — displays loading states.
 */
import type { ReactElement, ReactNode } from 'react'
import { DataViewLoaderState } from '@contember/bindx-dataview'
import { Loader } from '#bindx-ui/ui/loader'

export interface DataGridLoaderProps {
	children: ReactNode
}

export const DataGridLoader = ({ children }: DataGridLoaderProps): ReactElement => (
	<>
		<DataViewLoaderState refreshing loaded>
			<div className="relative">
				<DataViewLoaderState refreshing>
					<Loader position="absolute" />
				</DataViewLoaderState>
				{children}
			</div>
		</DataViewLoaderState>
		<DataViewLoaderState initial>
			<Loader position="static" />
		</DataViewLoaderState>
		<DataViewLoaderState failed>
			<div>Failed to load data</div>
		</DataViewLoaderState>
	</>
)
