import { EntityRelatedHandle } from './BaseHandle.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import { setField } from '../core/actions.js'
import { FIELD_REF_META, type FieldRef, type FieldRefMeta } from '../jsx/types.js'
import type { InputProps } from './types.js'

/**
 * FieldHandle provides stable access to a scalar field.
 *
 * Key characteristics:
 * - Stable identity (same instance across renders)
 * - Reads data from SnapshotStore snapshots
 * - Dispatches actions for mutations
 * - Provides inputProps for form integration
 * - Implements FieldRef interface for JSX compatibility
 */
export class FieldHandle<T = unknown> extends EntityRelatedHandle implements FieldRef<T> {
	constructor(
		entityType: string,
		entityId: string,
		private readonly fieldPath: string[],
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
	) {
		super(entityType, entityId, store, dispatcher)
	}

	/**
	 * JSX field reference metadata for collection phase.
	 * Implements FieldRef interface.
	 */
	get [FIELD_REF_META](): FieldRefMeta {
		return {
			path: this.fieldPath,
			fieldName: this.fieldName,
			isArray: false,
			isRelation: false,
		}
	}

	/**
	 * Gets the current field value.
	 */
	get value(): T | null {
		const data = this.getEntityData()
		if (!data) return null
		return getNestedValue(data, this.fieldPath) as T | null
	}

	/**
	 * Gets the server value (for dirty tracking).
	 */
	get serverValue(): T | null {
		const serverData = this.getServerData()
		if (!serverData) return null
		return getNestedValue(serverData, this.fieldPath) as T | null
	}

	/**
	 * Checks if the field has been modified.
	 */
	get isDirty(): boolean {
		return !deepEqual(this.value, this.serverValue)
	}

	/**
	 * Sets the field value.
	 */
	setValue(value: T | null): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			setField(this.entityType, this.entityId, this.fieldPath, value),
		)
	}

	/**
	 * Gets input binding props for form integration.
	 *
	 * @example
	 * ```tsx
	 * <input {...field.inputProps} />
	 * // or with custom handler
	 * <input
	 *   value={field.inputProps.value ?? ''}
	 *   onChange={e => field.inputProps.onChange(e.target.value)}
	 * />
	 * ```
	 */
	get inputProps(): InputProps<T> {
		const setValue = (value: T | null) => this.setValue(value)
		return {
			value: this.value,
			setValue,
			onChange: setValue,
		}
	}

	/**
	 * Gets the field path.
	 */
	get path(): readonly string[] {
		return this.fieldPath
	}

	/**
	 * Gets the field name (last segment of path).
	 */
	get fieldName(): string {
		return this.fieldPath[this.fieldPath.length - 1] ?? ''
	}

	/**
	 * Creates a nested field handle for a subfield.
	 */
	nested<K extends keyof NonNullable<T>>(
		key: K,
	): FieldHandle<NonNullable<T>[K]> {
		return new FieldHandle<NonNullable<T>[K]>(
			this.entityType,
			this.entityId,
			[...this.fieldPath, key as string],
			this.store,
			this.dispatcher,
		)
	}
}

// ==================== Helper Functions ====================

/**
 * Gets a nested value from an object using a path array.
 */
function getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
	let current: unknown = obj

	for (const key of path) {
		if (current === null || current === undefined || typeof current !== 'object') {
			return undefined
		}
		current = (current as Record<string, unknown>)[key]
	}

	return current
}

/**
 * Deep equality check for values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (a === null || b === null) return false
	if (typeof a !== 'object' || typeof b !== 'object') return false

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false
		for (let i = 0; i < a.length; i++) {
			if (!deepEqual(a[i], b[i])) return false
		}
		return true
	}

	if (Array.isArray(a) || Array.isArray(b)) return false

	const keysA = Object.keys(a as object)
	const keysB = Object.keys(b as object)

	if (keysA.length !== keysB.length) return false

	for (const key of keysA) {
		if (!keysB.includes(key)) return false
		if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
			return false
		}
	}

	return true
}
