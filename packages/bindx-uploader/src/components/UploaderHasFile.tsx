import type { ReactNode } from 'react'
import { useUploaderState } from '../contexts.js'
import type { StateFilter } from '../hooks/useUploaderStateFiles.js'

export interface UploaderHasFileProps {
	children: ReactNode
	/** Fallback when no files match */
	fallback?: ReactNode
	/** Filter by specific state(s) */
	state?: StateFilter
}

/**
 * Conditionally renders children if there are files in the upload state.
 */
export function UploaderHasFile({
	children,
	fallback,
	state: stateFilter,
}: UploaderHasFileProps): ReactNode {
	const files = useUploaderState()

	const hasFiles = stateFilter
		? files.some(file => {
				const filterArray = Array.isArray(stateFilter) ? stateFilter : [stateFilter]
				return filterArray.includes(file.state)
			})
		: files.length > 0

	if (!hasFiles) {
		return fallback ?? null
	}

	return children
}
