/**
 * Converts a boolean to a data attribute value.
 * Returns '' (present) for true, undefined (absent) for false.
 */
export function dataAttribute(value: boolean): '' | undefined {
	return value ? '' : undefined
}
