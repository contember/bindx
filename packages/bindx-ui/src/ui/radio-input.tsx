import { uic } from '../utils/uic.js'

export const RadioInput = uic('input', {
	baseClass: `
		appearance-none bg-background rounded-full w-4 h-4 ring-1 ring-gray-400 hover:ring-gray-600 grid place-items-center
		before:rounded-full before:bg-gray-600 before:w-2 before:h-2 before:ring-2 before:ring-white before:content-[''] before:transform before:transition-all before:scale-0 checked:before:scale-100
	`,
	displayName: 'RadioInput',
})
