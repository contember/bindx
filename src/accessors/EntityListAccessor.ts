import type { FragmentMeta } from '../fragment/types.js'
import type { BackendAdapter } from '../adapter/types.js'
import type { IdentityMap } from '../store/IdentityMap.js'
import type { EntityListAccessor, EntityListItem, AccessorFromShape } from './types.js'
import { EntityAccessorImpl } from './EntityAccessor.js'

let tempIdCounter = 0

/**
 * Generates a temporary ID for new entities
 */
function generateTempId(): string {
	return `__temp_${++tempIdCounter}`
}

/**
 * Implementation of EntityListItem
 */
class EntityListItemImpl<TData extends object> implements EntityListItem<TData> {
	constructor(
		public readonly key: string,
		private readonly _entity: EntityAccessorImpl<TData>,
		private readonly onRemove: () => void,
	) {}

	get entity() {
		return this._entity as unknown as import('./types.js').EntityAccessor<TData>
	}

	get fields(): AccessorFromShape<TData> {
		return this._entity.fields
	}

	remove(): void {
		this.onRemove()
	}
}

/**
 * Implementation of EntityListAccessor for has-many relations
 */
export class EntityListAccessorImpl<TData extends object> implements EntityListAccessor<TData> {
	private _items: EntityListItemImpl<TData>[] = []
	private _serverItems: Set<string> = new Set()
	private _removedKeys: Set<string> = new Set()
	private _serverOrder: string[] = []
	private _orderChanged: boolean = false

	constructor(
		private readonly entityType: string,
		private readonly itemMeta: FragmentMeta,
		private readonly adapter: BackendAdapter,
		private readonly identityMap: IdentityMap,
		initialData: TData[],
		private readonly onChange: () => void,
	) {
		this._items = initialData.map((data, index) => this.createItem(data, index))
		// Track which items came from server
		this._serverItems = new Set(this._items.map(item => item.key))
		this._serverOrder = this._items.map(item => item.key)
	}

	/**
	 * Creates a list item from data
	 */
	private createItem(data: TData, index: number): EntityListItemImpl<TData> {
		const id = this.extractId(data) ?? generateTempId()
		const key = id

		const entityAccessor = new EntityAccessorImpl<TData>(
			id,
			this.entityType,
			this.itemMeta,
			this.adapter,
			this.identityMap,
			data,
			this.onChange,
		)

		return new EntityListItemImpl<TData>(key, entityAccessor, () => this.removeByKey(key))
	}

	/**
	 * Extracts ID from data object
	 */
	private extractId(data: TData): string | undefined {
		if (data && typeof data === 'object' && 'id' in data) {
			const id = (data as Record<string, unknown>)['id']
			if (typeof id === 'string') return id
		}
		return undefined
	}

	/**
	 * Removes item by key
	 */
	private removeByKey(key: string): void {
		const index = this._items.findIndex(item => item.key === key)
		if (index === -1) return

		this._items.splice(index, 1)

		// Track if a server item was removed
		if (this._serverItems.has(key)) {
			this._removedKeys.add(key)
		}

		this.onChange()
	}

	get items(): EntityListItem<TData>[] {
		return this._items
	}

	get length(): number {
		return this._items.length
	}

	get isDirty(): boolean {
		// Dirty if any item was added, removed, modified, or reordered
		if (this._removedKeys.size > 0) return true
		if (this._orderChanged) return true

		for (const item of this._items) {
			// New item (not from server)
			if (!this._serverItems.has(item.key)) return true
			// Modified item
			if (item.entity.isDirty) return true
		}

		return false
	}

	add(data: Partial<TData>): void {
		const id = generateTempId()
		const fullData = { id, ...data } as TData

		const entityAccessor = new EntityAccessorImpl<TData>(
			id,
			this.entityType,
			this.itemMeta,
			this.adapter,
			this.identityMap,
			fullData,
			this.onChange,
		)

		const item = new EntityListItemImpl<TData>(id, entityAccessor, () => this.removeByKey(id))

		this._items.push(item)
		this.onChange()
	}

	remove(key: string): void {
		this.removeByKey(key)
	}

	move(fromIndex: number, toIndex: number): void {
		if (fromIndex < 0 || fromIndex >= this._items.length) return
		if (toIndex < 0 || toIndex >= this._items.length) return
		if (fromIndex === toIndex) return

		const [item] = this._items.splice(fromIndex, 1)
		if (item) {
			this._items.splice(toIndex, 0, item)
			this._orderChanged = this.hasOrderChanged()
			this.onChange()
		}
	}

	/**
	 * Checks if the current order differs from server order
	 */
	private hasOrderChanged(): boolean {
		const currentOrder = this._items.map(item => item.key)
		if (currentOrder.length !== this._serverOrder.length) return true
		for (let i = 0; i < currentOrder.length; i++) {
			if (currentOrder[i] !== this._serverOrder[i]) return true
		}
		return false
	}

	/**
	 * Collects all items' data for persistence
	 */
	collectData(): TData[] {
		return this._items.map(item => item.entity.data)
	}

	/**
	 * Gets list of removed item IDs
	 */
	getRemovedIds(): string[] {
		return Array.from(this._removedKeys)
	}

	/**
	 * Commits current state as server state
	 */
	commitChanges(): void {
		this._serverItems = new Set(this._items.map(item => item.key))
		this._serverOrder = this._items.map(item => item.key)
		this._removedKeys.clear()
		this._orderChanged = false
	}
}
