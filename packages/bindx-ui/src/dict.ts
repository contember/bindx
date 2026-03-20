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
	blockRepeater: {
		addBlock: 'Add block',
		close: 'Close',
		delete: 'Delete',
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
	boolean: {
		true: 'Yes',
		false: 'No',
	},
	persist: {
		save: 'Save',
	},
	select: {
		placeholder: 'Select…',
		search: 'Search…',
	},
	datagrid: {
		empty: 'No results.',
		filter: 'Filter',
		exclude: 'Exclude',
		filters: 'Filters',
		export: 'Export',
		layout: 'Layout',
		showTable: 'Table',
		showGrid: 'Grid',
		visibleFields: 'Visible fields',
		na: 'N/A',
		today: 'Today',
		textMatchMode: {
			contains: 'contains',
			startsWith: 'starts with',
			endsWith: 'ends with',
			equals: 'equals',
			notContains: 'not contains',
		} as Record<string, string>,
		textPlaceholder: 'Search...',
		textReset: 'Reset',
		numberFrom: 'From',
		numberTo: 'To',
		dateStart: 'Start',
		dateEnd: 'End',
		columnAsc: 'Asc',
		columnDesc: 'Desc',
		columnHide: 'Hide',
		paginationFirstPage: 'First page',
		paginationPreviousPage: 'Previous page',
		paginationNextPage: 'Next page',
		paginationLastPage: 'Last page',
		paginationRowsPerPage: 'Rows per page',
		pageInfo: 'Page ${page} of ${pagesCount}',
		pageInfoShort: 'Page ${page}',
		pageRowsCount: '${totalCount} rows',
	},
}

export const dictFormat = (value: string, replacements: Record<string, string>): string => {
	return value.replace(/\${([^}]+)}/g, (_, key: string) => replacements[key] || '')
}
