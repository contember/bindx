/**
 * Null filter control — shared across all filter types.
 */
import { type ReactElement, useCallback } from 'react'
import { useDataViewNullFilter, useOptionalDataViewFilterName } from '@contember/bindx-dataview'
import { DataGridFilterSelectItemUI } from '#bindx-ui/datagrid/ui'
import { dict } from '../../dict.js'

export const DataGridNullFilter = ({ name }: { name?: string }): ReactElement => {
	const contextName = useOptionalDataViewFilterName()
	name ??= contextName ?? undefined
	if (name === undefined) throw new Error('DataGridNullFilter requires a name prop or filter scope context')
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
