import { useCallback, useEffect, useRef } from 'react'

/**
 * Hook that manages preview URL creation and cleanup.
 * Returns a function that creates object URLs for file preview.
 */
export const useGetPreviewUrls = (): ((file: File) => string) => {
	const urlsRef = useRef<Set<string>>(new Set())

	// Cleanup URLs on unmount
	useEffect(() => {
		const urls = urlsRef.current
		return () => {
			for (const url of urls) {
				URL.revokeObjectURL(url)
			}
			urls.clear()
		}
	}, [])

	return useCallback((file: File): string => {
		const url = URL.createObjectURL(file)
		urlsRef.current.add(url)
		return url
	}, [])
}
