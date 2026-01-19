import { Fragment, type ReactNode } from 'react'
import type { UploaderFileState } from '../types.js'
import { UploaderFileStateContext, useUploaderState } from '../contexts.js'
import type { StateFilter } from '../hooks/useUploaderStateFiles.js'

export interface UploaderEachFileProps {
	children: ReactNode
	/** Filter by specific state(s) */
	state?: StateFilter
	/** Fallback when no files match */
	fallback?: ReactNode
}

/**
 * Iterates over files in the upload state, providing file state context to children.
 */
export function UploaderEachFile({
	children,
	state: stateFilter,
	fallback,
}: UploaderEachFileProps): ReactNode {
	const files = useUploaderState()

	const filteredFiles = stateFilter
		? files.filter(file => {
				const filterArray = Array.isArray(stateFilter) ? stateFilter : [stateFilter]
				return filterArray.includes(file.state)
			})
		: files

	if (filteredFiles.length === 0 && fallback !== undefined) {
		return fallback
	}

	return (
		<>
			{filteredFiles.map(file => (
				<Fragment key={file.file.id}>
					<UploaderFileStateContext.Provider value={file}>
						{children}
					</UploaderFileStateContext.Provider>
				</Fragment>
			))}
		</>
	)
}
