import { createContext, useContext, useMemo, type ReactNode } from 'react'

/**
 * Extensible map of component names to their default props.
 * Users can extend this via declaration merging when they eject components:
 *
 * ```ts
 * declare module '@contember/bindx-ui' {
 *   interface BindxUIDefaultsMap {
 *     MyCustomInput: Partial<MyCustomInputProps>
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface BindxUIDefaultsMap {}

type DefaultsRecord = {
	[K in keyof BindxUIDefaultsMap]?: BindxUIDefaultsMap[K]
} & Record<string, Record<string, unknown>>

const BindxUIDefaultsContext = createContext<DefaultsRecord>({})

export interface BindxUIDefaultsProviderProps {
	defaults: DefaultsRecord
	children: ReactNode
}

export function BindxUIDefaultsProvider({ defaults, children }: BindxUIDefaultsProviderProps): ReactNode {
	const parent = useContext(BindxUIDefaultsContext)

	const merged = useMemo((): DefaultsRecord => {
		const result: DefaultsRecord = { ...parent }
		for (const key of Object.keys(defaults)) {
			result[key] = { ...parent[key], ...defaults[key] }
		}
		return result
	}, [parent, defaults])

	return <BindxUIDefaultsContext value={merged}>{children}</BindxUIDefaultsContext>
}

export function useComponentDefaults<T extends Record<string, unknown>>(componentName: string): Partial<T> {
	const defaults = useContext(BindxUIDefaultsContext)
	return (defaults[componentName] ?? {}) as Partial<T>
}
