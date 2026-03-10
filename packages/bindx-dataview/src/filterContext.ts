/**
 * Filter name context — provides the current filter name to descendant components.
 *
 * Used by DataViewTextFilter, DataViewBooleanFilter, etc. to scope
 * trigger components so they don't need an explicit `name` prop.
 */

import { createContext, useContext } from 'react'

const DataViewFilterNameContext = createContext<string | null>(null)

export function useDataViewFilterName(): string {
	const name = useContext(DataViewFilterNameContext)
	if (name === null) {
		throw new Error(
			'useDataViewFilterName: no filter name in context. ' +
			'Wrap this component in a DataViewTextFilter, DataViewBooleanFilter, DataViewFilterScope, etc.',
		)
	}
	return name
}

export function useOptionalDataViewFilterName(): string | null {
	return useContext(DataViewFilterNameContext)
}

export const DataViewFilterNameProvider = DataViewFilterNameContext.Provider
