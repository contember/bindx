import { uic } from '../../utils/uic.js'

// Focusable so the filter affordance and its tooltip are reachable without a mouse.
export const DataGridTooltipLabel = uic('span', {
	defaultProps: { tabIndex: 0, 'aria-keyshortcuts': 'ArrowDown' },
	baseClass: 'cursor-pointer underline decoration-dashed decoration-transparent underline-offset-4 transition-colors hover:decoration-gray-400 focus-visible:decoration-gray-800 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring rounded-xs',
})
