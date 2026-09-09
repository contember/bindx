/**
 * Type-level predicates that discriminate entity field shapes.
 */

/**
 * True when T is a plain object (an entity); false for Date, Function, arrays and primitives.
 *
 * Collapses to `boolean` for a union mixing objects and non-objects (a JSON column), so
 * `extends true` rejects it — a bare `T extends object` would distribute and match its object members.
 */
export type IsPlainObject<T> =
	T extends Date ? false
	: T extends Function ? false
	: T extends readonly unknown[] ? false
	: T extends object ? true
	: false
