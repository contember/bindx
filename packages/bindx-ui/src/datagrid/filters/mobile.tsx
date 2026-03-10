/**
 * Mobile filter hiding — hides inactive filters on mobile screens.
 */
import { createContext, type ReactElement, type ReactNode, useContext } from 'react'
import { useDataViewFilter, useDataViewFilterName } from '@contember/bindx-dataview'

export const DataGridShowFiltersContext = createContext(true)

export const DataGridFilterMobileHiding = ({ name, children }: { name?: string; children: ReactNode }): ReactElement => {
	// eslint-disable-next-line react-hooks/rules-of-hooks
	name ??= useDataViewFilterName()
	const [, , { isEmpty }] = useDataViewFilter(name)
	const isActive = !isEmpty
	const alwaysShow = useContext(DataGridShowFiltersContext)

	return (
		<div key={name} className={alwaysShow || isActive ? 'contents' : 'hidden sm:contents'}>
			{children}
		</div>
	)
}
