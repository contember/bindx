import { parentKeyFromRelationKey } from './relationKey.js'

export class RelationOwnerIndex {
	private readonly keysByOwner = new Map<string, Set<string>>()

	add(key: string): void {
		const owner = parentKeyFromRelationKey(key)
		let keys = this.keysByOwner.get(owner)
		if (!keys) {
			keys = new Set()
			this.keysByOwner.set(owner, keys)
		}
		keys.add(key)
	}

	delete(key: string): void {
		const owner = parentKeyFromRelationKey(key)
		const keys = this.keysByOwner.get(owner)
		if (!keys) return
		keys.delete(key)
		if (keys.size === 0) this.keysByOwner.delete(owner)
	}

	get(owner: string): Iterable<string> {
		return this.keysByOwner.get(owner) ?? []
	}

	clear(): void {
		this.keysByOwner.clear()
	}
}
