import { useCallback } from 'react'

export interface HighlightEvent {
	element: HTMLElement
}

export const useOnHighlight = (): ((event: HighlightEvent) => void) => {
	return useCallback((event: HighlightEvent) => {
		const scrollArea = event.element.closest('[data-radix-scroll-area-viewport]')
		if (scrollArea) {
			const scrollTo = event.element.offsetTop - scrollArea.clientHeight / 2 + event.element.clientHeight / 2
			scrollArea.scrollTo({
				top: scrollTo,
				behavior: 'smooth',
			})
		}
	}, [])
}
