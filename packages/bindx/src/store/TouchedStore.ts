import type { RekeyContext, Rekeyable } from './RekeyOrchestrator.js'

/**
 * Manages touched state for entity fields.
 *
 * A field is "touched" when the user has interacted with it.
 * Used for conditional error display (show errors only after user interaction).
 *
 * Keys are pre-computed composite strings (e.g., "entityType:id:fieldName").
 */
export class TouchedStore implements Rekeyable {
	/** Touched state keyed by "entityType:id:fieldName" */
	private readonly touchedFields = new Map<string, boolean>()

	isFieldTouched(key: string): boolean {
		return this.touchedFields.get(key) ?? false
	}

	/**
	 * Sets the touched state for a field.
	 * Returns true if the state actually changed.
	 */
	setFieldTouched(key: string, touched: boolean): boolean {
		const current = this.touchedFields.get(key) ?? false
		if (current === touched) return false
		this.touchedFields.set(key, touched)
		return true
	}

	/**
	 * Clears all touched state for an entity.
	 */
	clearForEntity(keyPrefix: string): void {
		for (const key of [...this.touchedFields.keys()]) {
			if (key.startsWith(keyPrefix)) {
				this.touchedFields.delete(key)
			}
		}
	}

	/**
	 * Rekeys all touched fields from oldKeyPrefix to newKeyPrefix.
	 */
	rekey(ctx: RekeyContext): void {
		const { oldKeyPrefix, newKeyPrefix } = ctx
		const toMove: [string, boolean][] = []
		for (const [key, value] of this.touchedFields) {
			if (key.startsWith(oldKeyPrefix)) {
				toMove.push([key, value])
			}
		}
		for (const [oldKey, value] of toMove) {
			this.touchedFields.delete(oldKey)
			this.touchedFields.set(newKeyPrefix + oldKey.slice(oldKeyPrefix.length), value)
		}
	}

	clear(): void {
		this.touchedFields.clear()
	}
}
