/**
 * Null filter control — shared across all filter types.
 */
import { type ReactElement, useCallback } from 'react'
import { useDataViewFilterName, useDataViewNullFilter } from '@contember/bindx-dataview'
import { DataGridFilterSelectItemUI } from '#bindx-ui/datagrid/ui'
import { dict } from '../../dict.js'

export const DataGridNullFilter = ({ name }: { name?: string }): ReactElement => {
	// eslint-disable-next-line react-hooks/rules-of-hooks
	name ??= useDataViewFilterName()
	const [nullFilter, setNullFilter] = useDataViewNullFilter(name)
	const toggleExcludeNull = useCallback(() => setNullFilter('toggleExclude'), [setNullFilter])
	const toggleIncludeNull = useCallback(() => setNullFilter('toggleInclude'), [setNullFilter])

	return (
		<DataGridFilterSelectItemUI
			onExclude={toggleExcludeNull}
			onInclude={toggleIncludeNull}
			isExcluded={nullFilter === 'exclude'}
			isIncluded={nullFilter === 'include'}
		>
			<span className="italic">{dict.datagrid.na}</span>
		</DataGridFilterSelectItemUI>
	)
}
