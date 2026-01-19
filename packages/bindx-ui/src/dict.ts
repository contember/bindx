export const dict = {
	errors: {
		required: 'This field is required',
		unique: 'This value is already taken',
		unknown: 'An unknown error has occurred',
	},
	input: {
		noValue: 'No value',
	},
	repeater: {
		empty: 'No items.',
		addItem: 'Add item',
	},
	uploader: {
		uploadErrors: {
			httpError: 'HTTP error',
			aborted: 'Upload aborted',
			networkError: 'Network error',
			timeout: 'Upload timeout',
			fileRejected: 'File rejected',
		},
		unknownError: 'Unknown error',
		browseFiles: 'Browse',
		dropFiles: 'Drop files here',
		or: 'or',
		done: 'Done',
	},
}

export const dictFormat = (value: string, replacements: Record<string, string>): string => {
	return value.replace(/\${([^}]+)}/g, (_, key: string) => replacements[key] || '')
}
