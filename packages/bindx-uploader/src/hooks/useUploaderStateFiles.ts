import { useMemo } from 'react'
import type { UploaderFileState } from '../types.js'
import { useUploaderState } from '../contexts.js'

export type StateFilter = UploaderFileState['state'] | UploaderFileState['state'][]

/**
 * Filters uploader state by state type.
 * Returns an array of matching file states.
 */
export const useUploaderStateFiles = (stateFilter?: StateFilter): UploaderFileState[] => {
	const files = useUploaderState()

	return useMemo(() => {
		if (!stateFilter) {
			return files
		}

		const filterArray = Array.isArray(stateFilter) ? stateFilter : [stateFilter]
		return files.filter(file => filterArray.includes(file.state))
	}, [files, stateFilter])
}
