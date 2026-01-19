/**
 * Check if a file type matches an accept specification.
 * Ported from react-dropzone's attr-accept utility.
 *
 * @param file - File or object with type and name properties
 * @param accept - Accept specification (MIME type, extension, or wildcard)
 */
export function attrAccept(
	file: { type?: string; name?: string },
	accept?: string | string[] | Record<string, string[]>,
): boolean {
	if (!accept) {
		return true
	}

	const acceptArray = normalizeAccept(accept)

	if (acceptArray.length === 0) {
		return true
	}

	const mimeType = (file.type || '').toLowerCase()
	const baseMimeType = mimeType.replace(/\/.*$/, '')
	const fileName = file.name || ''
	const dotIndex = fileName.lastIndexOf('.')
	const extension = dotIndex >= 0 ? fileName.toLowerCase().slice(dotIndex + 1) : ''

	return acceptArray.some(type => {
		const normalizedType = type.trim().toLowerCase()

		// Extension match (e.g., ".png")
		if (normalizedType.startsWith('.')) {
			return extension === normalizedType.slice(1)
		}

		// Wildcard MIME type (e.g., "image/*")
		if (normalizedType.endsWith('/*')) {
			return baseMimeType === normalizedType.replace(/\/\*$/, '')
		}

		// Exact MIME type match
		return mimeType === normalizedType
	})
}

/**
 * Normalize accept specification to an array of strings.
 */
function normalizeAccept(accept: string | string[] | Record<string, string[]>): string[] {
	if (typeof accept === 'string') {
		return accept.split(',').map(s => s.trim())
	}

	if (Array.isArray(accept)) {
		return accept
	}

	// Record<mimeType, extensions[]>
	const result: string[] = []
	for (const mimeType in accept) {
		result.push(mimeType)
		const extensions = accept[mimeType]
		if (extensions) {
			result.push(...extensions)
		}
	}
	return result
}

/**
 * Convert accept record to a flat string for input accept attribute.
 */
export function acceptToString(accept?: Record<string, string[]>): string | undefined {
	if (!accept) {
		return undefined
	}

	const result: string[] = []
	for (const mimeType in accept) {
		result.push(mimeType)
		const extensions = accept[mimeType]
		if (extensions) {
			result.push(...extensions)
		}
	}
	return result.join(',')
}
