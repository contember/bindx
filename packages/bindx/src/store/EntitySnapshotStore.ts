import {
	createEntitySnapshot,
	type EntitySnapshot,
} from './snapshots.js'

/**
 * Manages entity snapshots — core CRUD for immutable entity data.
 *
 * Entity snapshots are keyed by composite strings (e.g., "entityType:id").
 * All snapshots are immutable (frozen) objects. Mutations create new snapshot instances.
 *
 * Follows the same sub-store pattern as ErrorStore, RelationStore, etc.
 * SnapshotStore delegates entity snapshot operations here.
 */
export class EntitySnapshotStore {
	private readonly snapshots = new Map<string, EntitySnapshot>()

	get(key: string): EntitySnapshot | undefined {
		return this.snapshots.get(key)
	}

	has(key: string): boolean {
		return this.snapshots.has(key)
	}

	/**
	 * Sets entity data, merging with existing data if present.
	 * Returns the new snapshot. Does NOT handle notification or meta updates.
	 */
	setData<T extends object>(
		key: string,
		id: string,
		entityType: string,
		data: T,
		isServerData: boolean,
	): EntitySnapshot<T> {
		const existing = this.snapshots.get(key)

		const mergedData = existing?.data
			? { ...existing.data, ...data } as T
			: data

		const serverData = isServerData
			? (existing?.serverData ? { ...existing.serverData, ...data } as T : data)
			: (existing?.serverData as T) ?? mergedData

		const newSnapshot = createEntitySnapshot(
			id,
			entityType,
			mergedData,
			serverData,
			(existing?.version ?? 0) + 1,
		)

		this.snapshots.set(key, newSnapshot)
		return newSnapshot
	}

	/**
	 * Updates specific fields on an existing entity snapshot.
	 * Returns the new snapshot, or undefined if entity doesn't exist.
	 */
	updateFields<T extends object>(
		key: string,
		updates: Partial<T>,
	): EntitySnapshot<T> | undefined {
		const existing = this.snapshots.get(key)
		if (!existing) return undefined

		const newData = { ...existing.data, ...updates } as T
		const newSnapshot = createEntitySnapshot(
			existing.id,
			existing.entityType,
			newData,
			existing.serverData as T,
			existing.version + 1,
		)

		this.snapshots.set(key, newSnapshot)
		return newSnapshot
	}

	/**
	 * Sets a nested field value on an existing entity snapshot.
	 * Returns true if the snapshot was updated, false if entity doesn't exist.
	 */
	setFieldValue(key: string, fieldPath: string[], value: unknown): boolean {
		const existing = this.snapshots.get(key)
		if (!existing) return false

		const newData = setNestedValue({ ...existing.data }, fieldPath, value)
		const newSnapshot = createEntitySnapshot(
			existing.id,
			existing.entityType,
			newData,
			existing.serverData,
			existing.version + 1,
		)

		this.snapshots.set(key, newSnapshot)
		return true
	}

	/**
	 * Commits current data as server data (serverData = data).
	 */
	commit(key: string): void {
		const existing = this.snapshots.get(key)
		if (!existing) return

		const newSnapshot = createEntitySnapshot(
			existing.id,
			existing.entityType,
			existing.data,
			existing.data,
			existing.version + 1,
		)

		this.snapshots.set(key, newSnapshot)
	}

	/**
	 * Resets data to server data (data = serverData).
	 */
	reset(key: string): void {
		const existing = this.snapshots.get(key)
		if (!existing) return

		const newSnapshot = createEntitySnapshot(
			existing.id,
			existing.entityType,
			existing.serverData,
			existing.serverData,
			existing.version + 1,
		)

		this.snapshots.set(key, newSnapshot)
	}

	/**
	 * Removes an entity snapshot.
	 */
	remove(key: string): void {
		this.snapshots.delete(key)
	}

	/**
	 * Bumps the version of an entity snapshot without changing data.
	 * Used by SubscriptionManager when child entities change.
	 */
	bumpVersion(key: string): void {
		const existing = this.snapshots.get(key)
		if (!existing) return

		const newSnapshot = createEntitySnapshot(
			existing.id,
			existing.entityType,
			existing.data,
			existing.serverData,
			existing.version + 1,
		)

		this.snapshots.set(key, newSnapshot)
	}

	/**
	 * Commits specific fields by copying their current values to server data.
	 */
	commitFields(key: string, fieldNames: string[]): void {
		const existing = this.snapshots.get(key)
		if (!existing) return

		const data = existing.data as Record<string, unknown>
		const serverData = existing.serverData as Record<string, unknown>

		const newServerData = { ...serverData }
		for (const fieldName of fieldNames) {
			if (fieldName in data) {
				newServerData[fieldName] = data[fieldName]
			}
		}

		const newSnapshot = createEntitySnapshot(
			existing.id,
			existing.entityType,
			data,
			newServerData,
			existing.version + 1,
		)

		this.snapshots.set(key, newSnapshot)
	}

	/**
	 * Exports snapshots for the given keys.
	 */
	exportSnapshots(keys: string[]): Map<string, EntitySnapshot> {
		const result = new Map<string, EntitySnapshot>()
		for (const key of keys) {
			const snapshot = this.snapshots.get(key)
			if (snapshot) {
				result.set(key, snapshot)
			}
		}
		return result
	}

	/**
	 * Imports snapshots, overwriting any existing entries.
	 * Returns the set of keys that were imported.
	 */
	importSnapshots(snapshots: Map<string, EntitySnapshot>): Set<string> {
		const keys = new Set<string>()
		for (const [key, snapshot] of snapshots) {
			this.snapshots.set(key, snapshot)
			keys.add(key)
		}
		return keys
	}

	keys(): IterableIterator<string> {
		return this.snapshots.keys()
	}

	clear(): void {
		this.snapshots.clear()
	}
}

/**
 * Sets a nested value in an object, returning a new object.
 */
function setNestedValue<T extends Record<string, unknown>>(
	obj: T,
	path: string[],
	value: unknown,
): T {
	if (path.length === 0) return obj

	const result = { ...obj }
	let current: Record<string, unknown> = result

	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i]!
		const nextValue = current[key]

		if (typeof nextValue === 'object' && nextValue !== null) {
			current[key] = { ...nextValue as Record<string, unknown> }
		} else {
			current[key] = {}
		}

		current = current[key] as Record<string, unknown>
	}

	const lastKey = path[path.length - 1]!
	current[lastKey] = value

	return result
}
