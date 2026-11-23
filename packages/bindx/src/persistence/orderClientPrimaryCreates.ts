import type { TransactionMutation } from './types.js'

/**
 * Orders mutations so a row created with a client-chosen primary key exists before
 * anything connects to it (issue #169).
 *
 * The engine runs top-level mutations one after another and a has-many list element by
 * element, each element's whole subtree first. Within one row, has-one ops run before
 * the row is written and has-many ops after it. Elements of each list, and the
 * top-level mutations, are reordered stably so an element that connects to a key
 * follows the element that creates it. The result is then checked against that
 * execution order; has-one ops are assumed to run before their row, which is exact
 * for the owning side and earlier than reality for the inverse side.
 */
export function orderClientPrimaryCreates(
	mutations: readonly TransactionMutation[],
	clientKeys: ReadonlySet<string>,
): TransactionMutation[] {
	if (clientKeys.size === 0) return [...mutations]
	const ordered = sortByDependencies(
		mutations.map(mutation => mutation.data ? { ...mutation, data: orderNode(mutation.data, clientKeys) } : mutation),
		mutation => mutation.data ? collectKeys(mutation.data, clientKeys) : emptyKeys(),
	)
	if (!ordered) throw new ClientPrimaryOrderError('the top-level mutations create and connect each other\'s rows in a cycle')
	assertExecutionOrder(ordered, clientKeys)
	return ordered
}

export class ClientPrimaryOrderError extends Error {
	constructor(detail: string) {
		super(`Cannot order the creates of entities shared within one persist: ${detail}`)
		this.name = 'ClientPrimaryOrderError'
	}
}

interface SubtreeKeys {
	readonly created: Set<string>
	readonly connected: Set<string>
}

function emptyKeys(): SubtreeKeys {
	return { created: new Set(), connected: new Set() }
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The write data inside a relation op, or the connected key. */
function readOp(op: unknown): { readonly data?: Record<string, unknown>; readonly connectId?: string } {
	if (!isRecord(op)) return {}
	const create = op['create']
	if (isRecord(create)) return { data: create }
	const update = op['update']
	if (isRecord(update)) {
		const data = update['data']
		return { data: isRecord(update['by']) && isRecord(data) ? data : update }
	}
	const connect = op['connect']
	if (isRecord(connect) && typeof connect['id'] === 'string') return { connectId: connect['id'] }
	return {}
}

function orderNode(data: Record<string, unknown>, clientKeys: ReadonlySet<string>): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(data)) {
		if (Array.isArray(value)) {
			const elements = value.map(element => orderOp(element, clientKeys))
			const sorted = sortByDependencies(elements, element => collectOpKeys(element, clientKeys))
			if (!sorted) throw new ClientPrimaryOrderError(`the elements of "${key}" create and connect each other's rows in a cycle`)
			result[key] = sorted
		} else if (isRecord(value)) {
			result[key] = orderOp(value, clientKeys)
		} else {
			result[key] = value
		}
	}
	return result
}

function orderOp(op: unknown, clientKeys: ReadonlySet<string>): unknown {
	if (!isRecord(op)) return op
	const create = op['create']
	if (isRecord(create)) return { ...op, create: orderNode(create, clientKeys) }
	const update = op['update']
	if (isRecord(update)) {
		const data = update['data']
		return isRecord(update['by']) && isRecord(data)
			? { ...op, update: { ...update, data: orderNode(data, clientKeys) } }
			: { ...op, update: orderNode(update, clientKeys) }
	}
	return op
}

function collectOpKeys(op: unknown, clientKeys: ReadonlySet<string>): SubtreeKeys {
	const { data, connectId } = readOp(op)
	if (data) return collectKeys(data, clientKeys)
	const keys = emptyKeys()
	if (connectId !== undefined && clientKeys.has(connectId)) keys.connected.add(connectId)
	return keys
}

function collectKeys(data: Record<string, unknown>, clientKeys: ReadonlySet<string>): SubtreeKeys {
	const keys = emptyKeys()
	const id = data['id']
	if (typeof id === 'string' && clientKeys.has(id)) keys.created.add(id)
	for (const value of Object.values(data)) {
		const ops = Array.isArray(value) ? value : isRecord(value) ? [value] : []
		for (const op of ops) {
			const inner = collectOpKeys(op, clientKeys)
			for (const key of inner.created) keys.created.add(key)
			for (const key of inner.connected) keys.connected.add(key)
		}
	}
	return keys
}

/** Stable topological sort: an item that connects a key goes after the item creating it. Undefined on a cycle. */
function sortByDependencies<T>(items: readonly T[], keysOf: (item: T) => SubtreeKeys): T[] | undefined {
	const keys = items.map(keysOf)
	const creatorOf = new Map<string, number>()
	keys.forEach((entry, index) => entry.created.forEach(key => creatorOf.set(key, index)))
	const dependencies = keys.map((entry, index) => new Set(
		[...entry.connected]
			.map(key => creatorOf.get(key))
			.filter((creator): creator is number => creator !== undefined && creator !== index),
	))
	const placed = new Set<number>()
	const result: T[] = []
	while (result.length < items.length) {
		const next = items.findIndex((_, index) => !placed.has(index) && [...dependencies[index]!].every(dependency => placed.has(dependency)))
		if (next < 0) return undefined
		placed.add(next)
		result.push(items[next]!)
	}
	return result
}

function assertExecutionOrder(mutations: readonly TransactionMutation[], clientKeys: ReadonlySet<string>): void {
	const created = new Set<string>()
	const visitConnect = (id: string): void => {
		if (clientKeys.has(id) && !created.has(id)) {
			throw new ClientPrimaryOrderError(`a connect to ${id} would run before the row is created`)
		}
	}
	const visitOp = (op: unknown): void => {
		const { data, connectId } = readOp(op)
		if (data) visitWrite(data)
		else if (connectId !== undefined) visitConnect(connectId)
	}
	const visitWrite = (data: Record<string, unknown>): void => {
		for (const value of Object.values(data)) {
			if (isRecord(value)) visitOp(value)
		}
		const id = data['id']
		if (typeof id === 'string' && clientKeys.has(id)) created.add(id)
		for (const value of Object.values(data)) {
			if (Array.isArray(value)) value.forEach(visitOp)
		}
	}
	for (const mutation of mutations) {
		if (mutation.data) visitWrite(mutation.data)
	}
}
