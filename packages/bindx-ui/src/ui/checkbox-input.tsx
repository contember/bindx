import { uic } from '../utils/uic.js'

export const CheckboxInput = uic('input', {
	baseClass: 'w-4 h-4',
	defaultProps: {
		type: 'checkbox',
	},
	displayName: 'CheckboxInput',
})
