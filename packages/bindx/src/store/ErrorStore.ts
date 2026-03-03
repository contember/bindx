import type { ErrorState, FieldError } from '../errors/types.js'
import { filterStickyErrors } from '../errors/types.js'

/**
 * Manages error state for fields, entities, and relations.
 *
 * Errors are keyed by composite strings:
 * - Field errors: "entityType:id:fieldName"
 * - Entity errors: "entityType:id"
 * - Relation errors: "entityType:id:relationName"
 */
export class ErrorStore {
	/** Field errors keyed by "entityType:id:fieldName" */
	private readonly fieldErrors = new Map<string, ErrorState>()

	/** Entity-level errors keyed by "entityType:id" */
	private readonly entityErrors = new Map<string, ErrorState>()

	/** Relation errors keyed by "entityType:id:relationName" */
	private readonly relationErrors = new Map<string, ErrorState>()

	// ==================== Field Errors ====================

	/**
	 * Gets field errors for a specific field.
	 */
	getFieldErrors(fieldKey: string): readonly FieldError[] {
		return this.fieldErrors.get(fieldKey)?.errors ?? []
	}

	/**
	 * Adds an error to a field.
	 */
	addFieldError(fieldKey: string, error: FieldError): void {
		const existing = this.fieldErrors.get(fieldKey)
		const errors = existing ? [...existing.errors, error] : [error]
		this.fieldErrors.set(fieldKey, { errors, version: (existing?.version ?? 0) + 1 })
	}

	/**
	 * Clears field errors, optionally filtering by source.
	 */
	clearFieldErrors(fieldKey: string, source?: 'client' | 'server'): void {
		const existing = this.fieldErrors.get(fieldKey)
		if (!existing) return

		if (source === undefined) {
			this.fieldErrors.delete(fieldKey)
		} else {
			const filtered = existing.errors.filter(e => e.source !== source)
			if (filtered.length === 0) {
				this.fieldErrors.delete(fieldKey)
			} else {
				this.fieldErrors.set(fieldKey, { errors: filtered, version: existing.version + 1 })
			}
		}
	}

	/**
	 * Clears non-sticky client errors for a field.
	 * Called when field value changes.
	 * Returns true if any errors were removed.
	 */
	clearNonStickyFieldErrors(fieldKey: string): boolean {
		const existing = this.fieldErrors.get(fieldKey)
		if (!existing) return false

		const filtered = filterStickyErrors(existing.errors)
		if (filtered.length === existing.errors.length) return false

		if (filtered.length === 0) {
			this.fieldErrors.delete(fieldKey)
		} else {
			this.fieldErrors.set(fieldKey, { errors: filtered, version: existing.version + 1 })
		}
		return true
	}

	// ==================== Entity Errors ====================

	/**
	 * Gets entity-level errors.
	 */
	getEntityErrors(entityKey: string): readonly FieldError[] {
		return this.entityErrors.get(entityKey)?.errors ?? []
	}

	/**
	 * Adds an entity-level error.
	 */
	addEntityError(entityKey: string, error: FieldError): void {
		const existing = this.entityErrors.get(entityKey)
		const errors = existing ? [...existing.errors, error] : [error]
		this.entityErrors.set(entityKey, { errors, version: (existing?.version ?? 0) + 1 })
	}

	/**
	 * Clears entity-level errors, optionally filtering by source.
	 */
	clearEntityErrors(entityKey: string, source?: 'client' | 'server'): void {
		const existing = this.entityErrors.get(entityKey)
		if (!existing) return

		if (source === undefined) {
			this.entityErrors.delete(entityKey)
		} else {
			const filtered = existing.errors.filter(e => e.source !== source)
			if (filtered.length === 0) {
				this.entityErrors.delete(entityKey)
			} else {
				this.entityErrors.set(entityKey, { errors: filtered, version: existing.version + 1 })
			}
		}
	}

	// ==================== Relation Errors ====================

	/**
	 * Gets relation errors.
	 */
	getRelationErrors(relationKey: string): readonly FieldError[] {
		return this.relationErrors.get(relationKey)?.errors ?? []
	}

	/**
	 * Adds a relation error.
	 */
	addRelationError(relationKey: string, error: FieldError): void {
		const existing = this.relationErrors.get(relationKey)
		const errors = existing ? [...existing.errors, error] : [error]
		this.relationErrors.set(relationKey, { errors, version: (existing?.version ?? 0) + 1 })
	}

	/**
	 * Clears relation errors, optionally filtering by source.
	 */
	clearRelationErrors(relationKey: string, source?: 'client' | 'server'): void {
		const existing = this.relationErrors.get(relationKey)
		if (!existing) return

		if (source === undefined) {
			this.relationErrors.delete(relationKey)
		} else {
			const filtered = existing.errors.filter(e => e.source !== source)
			if (filtered.length === 0) {
				this.relationErrors.delete(relationKey)
			} else {
				this.relationErrors.set(relationKey, { errors: filtered, version: existing.version + 1 })
			}
		}
	}

	// ==================== Bulk Operations ====================

	/**
	 * Clears all server errors for an entity (entity-level, fields, and relations).
	 * Called before persist to clear stale server errors.
	 */
	clearAllServerErrors(entityKey: string, keyPrefix: string): void {
		this.clearEntityErrors(entityKey, 'server')

		for (const key of this.fieldErrors.keys()) {
			if (key.startsWith(keyPrefix)) {
				this.clearFieldErrors(key, 'server')
			}
		}

		for (const key of this.relationErrors.keys()) {
			if (key.startsWith(keyPrefix)) {
				this.clearRelationErrors(key, 'server')
			}
		}
	}

	/**
	 * Clears all errors for an entity (entity-level, fields, and relations).
	 */
	clearAllErrors(entityKey: string, keyPrefix: string): void {
		this.entityErrors.delete(entityKey)

		for (const key of [...this.fieldErrors.keys()]) {
			if (key.startsWith(keyPrefix)) {
				this.fieldErrors.delete(key)
			}
		}

		for (const key of [...this.relationErrors.keys()]) {
			if (key.startsWith(keyPrefix)) {
				this.relationErrors.delete(key)
			}
		}
	}

	/**
	 * Checks if an entity has any client errors (entity-level, fields, or relations).
	 * Used to block persist when validation errors exist.
	 */
	hasClientErrors(entityKey: string, keyPrefix: string): boolean {
		const entityErrs = this.entityErrors.get(entityKey)
		if (entityErrs?.errors.some(e => e.source === 'client')) {
			return true
		}

		for (const [key, state] of this.fieldErrors) {
			if (key.startsWith(keyPrefix) && state.errors.some(e => e.source === 'client')) {
				return true
			}
		}

		for (const [key, state] of this.relationErrors) {
			if (key.startsWith(keyPrefix) && state.errors.some(e => e.source === 'client')) {
				return true
			}
		}

		return false
	}

	/**
	 * Checks if an entity has any errors at all.
	 */
	hasAnyErrors(entityKey: string, keyPrefix: string): boolean {
		const entityErrs = this.entityErrors.get(entityKey)
		if (entityErrs && entityErrs.errors.length > 0) {
			return true
		}

		for (const [key, state] of this.fieldErrors) {
			if (key.startsWith(keyPrefix) && state.errors.length > 0) {
				return true
			}
		}

		for (const [key, state] of this.relationErrors) {
			if (key.startsWith(keyPrefix) && state.errors.length > 0) {
				return true
			}
		}

		return false
	}

	/**
	 * Clears all error data.
	 */
	clear(): void {
		this.fieldErrors.clear()
		this.entityErrors.clear()
		this.relationErrors.clear()
	}
}
