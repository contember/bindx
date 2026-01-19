/**
 * Moves an element from one position to another in an array.
 * Returns a new array with the element moved.
 *
 * @param array - The source array
 * @param from - The index to move from
 * @param to - The index to move to
 * @returns A new array with the element moved
 */
export function arrayMove<T>(array: T[], from: number, to: number): T[] {
	const newArray = array.slice()
	newArray.splice(to, 0, newArray.splice(from, 1)[0]!)
	return newArray
}
