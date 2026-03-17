import { createContext, useContext, type ReactNode } from 'react'

const DataViewKeyContext = createContext<string | undefined>(undefined)

export interface DataViewKeyProviderProps {
	readonly value: string
	readonly children: ReactNode
}

export function DataViewKeyProvider({ value, children }: DataViewKeyProviderProps): ReactNode {
	return <DataViewKeyContext value={value}>{children}</DataViewKeyContext>
}

export function useDataViewKey(fallback = 'dataview'): string {
	return useContext(DataViewKeyContext) ?? fallback
}
