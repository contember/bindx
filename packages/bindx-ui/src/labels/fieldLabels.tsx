import { createContext, useContext, type ReactNode } from 'react'

export type FieldLabelFormatter = (entityName: string, fieldName: string) => ReactNode | null

const FieldLabelFormatterContext = createContext<FieldLabelFormatter>(() => null)

export const useFieldLabelFormatter = (): FieldLabelFormatter => {
	return useContext(FieldLabelFormatterContext)
}

export interface FieldLabelFormatterProviderProps {
	readonly formatter: FieldLabelFormatter
	readonly children: ReactNode
}

export const FieldLabelFormatterProvider = ({ formatter, children }: FieldLabelFormatterProviderProps): ReactNode => {
	return (
		<FieldLabelFormatterContext.Provider value={formatter}>
			{children}
		</FieldLabelFormatterContext.Provider>
	)
}
