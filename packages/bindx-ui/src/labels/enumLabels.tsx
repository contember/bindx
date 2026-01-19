import { createContext, useContext, type ReactNode } from 'react'

export type EnumOptionsFormatter = (enumName: string) => Record<string, ReactNode>

const defaultFormatter: EnumOptionsFormatter = () => {
	throw new Error('EnumOptionsFormatterProvider is not provided')
}

const EnumOptionsFormatterContext = createContext<EnumOptionsFormatter>(defaultFormatter)

export const useEnumOptionsFormatter = (): EnumOptionsFormatter => {
	return useContext(EnumOptionsFormatterContext)
}

export interface EnumOptionsFormatterProviderProps {
	readonly formatter: EnumOptionsFormatter
	readonly children: ReactNode
}

export const EnumOptionsFormatterProvider = ({ formatter, children }: EnumOptionsFormatterProviderProps): ReactNode => {
	return (
		<EnumOptionsFormatterContext.Provider value={formatter}>
			{children}
		</EnumOptionsFormatterContext.Provider>
	)
}
