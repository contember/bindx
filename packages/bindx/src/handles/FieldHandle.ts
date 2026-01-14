import { EntityRelatedHandle } from './BaseHandle.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import { addFieldError, clearFieldErrors, setField } from '../core/actions.js'
import { FIELD_REF_META, type FieldRef, type FieldRefMeta, type InputProps, type Unsubscribe } from './types.js'
import { deepEqual } from '../utils/deepEqual.js'
import { createClientError, type ErrorInput, type FieldError } from '../errors/types.js'
import type {
	FieldChangedEvent,
	FieldChangingEvent,
	EventListener,
	Interceptor,
} from '../events/types.js'

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
			entityType: this.entityType,
			entityId: this.entityId,
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
	 * Also clears non-sticky client errors.
	 */
	setValue(value: T | null): void {
		this.assertNotDisposed()
		// Clear non-sticky errors when value changes
		this.store.clearNonStickyFieldErrors(this.entityType, this.entityId, this.fieldName)
		this.dispatcher.dispatch(
			setField(this.entityType, this.entityId, this.fieldPath, value),
		)
	}

	/**
	 * Gets the list of errors on this field.
	 */
	get errors(): readonly FieldError[] {
		return this.store.getFieldErrors(this.entityType, this.entityId, this.fieldName)
	}

	/**
	 * Checks if this field has any errors.
	 */
	get hasError(): boolean {
		return this.errors.length > 0
	}

	/**
	 * Adds a client-side error to this field.
	 */
	addError(error: ErrorInput): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			addFieldError(this.entityType, this.entityId, this.fieldName, createClientError(error)),
		)
	}

	/**
	 * Clears all errors from this field.
	 */
	clearErrors(): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			clearFieldErrors(this.entityType, this.entityId, this.fieldName),
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

	// ==================== Event Subscriptions ====================

	/**
	 * Subscribe to field value changes.
	 * The listener is called after the value has changed.
	 */
	onChange(listener: EventListener<FieldChangedEvent>): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.onField(
			'field:changed',
			this.entityType,
			this.entityId,
			this.fieldName,
			listener,
		)
	}

	/**
	 * Intercept field value changes.
	 * The interceptor can cancel or modify the change.
	 */
	onChanging(interceptor: Interceptor<FieldChangingEvent>): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.interceptField(
			'field:changing',
			this.entityType,
			this.entityId,
			this.fieldName,
			interceptor,
		)
	}

	// ==================== $ Prefixed Aliases ====================

	/** Alias for value */
	get $value(): T | null { return this.value }
	/** Alias for serverValue */
	get $serverValue(): T | null { return this.serverValue }
	/** Alias for isDirty */
	get $isDirty(): boolean { return this.isDirty }
	/** Alias for inputProps */
	get $inputProps(): InputProps<T> { return this.inputProps }
	/** Alias for errors */
	get $errors(): readonly FieldError[] { return this.errors }
	/** Alias for hasError */
	get $hasError(): boolean { return this.hasError }
	/** Alias for setValue */
	$setValue(value: T | null): void { this.setValue(value) }
	/** Alias for addError */
	$addError(error: ErrorInput): void { this.addError(error) }
	/** Alias for clearErrors */
	$clearErrors(): void { this.clearErrors() }
	/** Alias for onChange */
	$onChange(listener: EventListener<FieldChangedEvent>): Unsubscribe { return this.onChange(listener) }
	/** Alias for onChanging */
	$onChanging(interceptor: Interceptor<FieldChangingEvent>): Unsubscribe { return this.onChanging(interceptor) }
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

