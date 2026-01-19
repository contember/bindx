import type { UploaderErrorOptions } from './types.js'

export class UploaderError extends Error {
	public constructor(public readonly options: UploaderErrorOptions) {
		super(`File upload failed: ${options.type}`)
	}
}
