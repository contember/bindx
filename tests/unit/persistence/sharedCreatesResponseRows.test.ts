// Regression tests for https://github.com/contember/bindx/issues/169
/**
 * A list in a mutation response also holds rows that no create of that list made: a
 * connected row, a row connected by a client-chosen id, and a folded entity that joined
 * through its owner link. Pairing a create with its row must not count them, or a single
 * create whose value the server echoes normalized stays unresolved and is sent again.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import {
	ActionDispatcher,
	BatchPersister,
	ContemberSchemaMutationAdapter,
	MutationCollector,
	SnapshotStore,
	type BackendAdapter,
} from '@contember/bindx'
import { type AdapterCall, type Data, MiniEngine, createEngineAdapter, createdNamed, isData, schema } from './miniContemberEngine.js'

/** Echoes values the way a server normalizes them: a date gains a time, text is trimmed. */
function normalizeEcho(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normalizeEcho)
	if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+00:00` : value.trim()
	if (!isData(value)) return value
	const echoed: Data = {}
	for (const [key, item] of Object.entries(value)) echoed[key] = key === 'id' ? item : normalizeEcho(item)
	return echoed
}

function withNormalizedEcho(adapter: BackendAdapter): BackendAdapter {
	return {
		...adapter,
		persist: async (entityType, entityId, changes) => {
			const result = await adapter.persist(entityType, entityId, changes)
			if (!result.ok || !result.data) return result
			const data = normalizeEcho(result.data)
			return isData(data) ? { ...result, data } : result
		},
	}
}

describe('rows of a list response that no create of the list made', () => {
	let store: SnapshotStore
	let calls: AdapterCall[]

	beforeEach(() => {
		store = new SnapshotStore()
		calls = []
	})

	const setup = (customPrimary: readonly string[] = []): { engine: MiniEngine; persister: BatchPersister } => {
		const engine = new MiniEngine(new Set(customPrimary))
		const persister = new BatchPersister(withNormalizedEcho(createEngineAdapter(engine, calls, [])), store, new ActionDispatcher(store), {
			mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
		})
		for (const id of ['website-1', 'website-2']) {
			engine.seed('Website', id, { name: id })
			store.setEntityData('Website', id, { id, name: id }, true)
			store.setExistsOnServer('Website', id, true)
			store.getOrCreateHasMany('Website', id, 'sections', [])
		}
		for (const id of ['article-1', 'article-2']) {
			engine.seed('Article', id, { title: id })
			store.setEntityData('Article', id, { id, title: id }, true)
			store.setExistsOnServer('Article', id, true)
			store.getOrCreateHasMany('Article', id, 'tags', [])
			store.getOrCreateHasMany('Article', id, 'gallery', [])
		}
		return { engine, persister }
	}

	const connectOne = (entityType: string, entityId: string, fieldName: string, targetId: string): void => {
		store.getOrCreateRelation(entityType, entityId, fieldName, {
			currentId: targetId, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
	}

	const addSection = (values: Data, website = 'website-1', parent?: string): string => {
		const id = store.createEntity('Section', values)
		if (parent) connectOne('Section', id, 'parent', parent)
		store.addToHasMany('Website', website, 'sections', id)
		return id
	}

	/** A new section linked to its website only through its own has-one, outside the website's list. */
	const newSection = (values: Data, website: string, parent?: string): string => {
		const id = store.createEntity('Section', values)
		connectOne('Section', id, 'website', website)
		if (parent) connectOne('Section', id, 'parent', parent)
		return id
	}

	const sectionIdNamed = (engine: MiniEngine, name: string): string => {
		const row = [...engine.rows.values()].find(item => item.entity === 'Section' && item.values.get('name') === name)
		if (!row) throw new Error(`No section named ${name}`)
		return row.id
	}

	const persistAgain = async (persister: BatchPersister): Promise<AdapterCall[]> => {
		calls.length = 0
		await persister.persistAll()
		return [...calls]
	}

	test('should map a new section with a normalized date when its new parent joins the same list', async () => {
		const { engine, persister } = setup()
		const root = addSection({ name: 'Root' })
		const child = addSection({ name: 'Child', date: '2026-01-01' }, 'website-1', root)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', child)).not.toBeNull()
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'Child')).toBe(1)
		expect(createdNamed(engine, 'Root')).toBe(1)
	})

	// Websites persist in load order, which decides whether the parent's row is already in the list response.
	for (const [carrierWebsite, listWebsite] of [['website-1', 'website-2'], ['website-2', 'website-1']] as const) {
		test(`should map a new section with a normalized date when a parent created in ${carrierWebsite} joins the list of ${listWebsite}`, async () => {
			const { engine, persister } = setup()
			const root = addSection({ name: 'Root' }, listWebsite)
			addSection({ name: 'Child' }, carrierWebsite, root)
			addSection({ name: 'Other', date: '2026-01-01' }, listWebsite)

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(await persistAgain(persister)).toEqual([])
			expect(createdNamed(engine, 'Other')).toBe(1)
			expect(createdNamed(engine, 'Root')).toBe(1)
		})
	}

	test('should map a new section whose folded parent in the same list comes back normalized', async () => {
		const { engine, persister } = setup()
		const root = addSection({ name: 'Root', date: '2026-02-02' })
		addSection({ name: 'Child' }, 'website-1', root)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'Root')).toBe(1)
		expect(createdNamed(engine, 'Child')).toBe(1)
	})

	for (const [carrierWebsite, listWebsite] of [['website-1', 'website-2'], ['website-2', 'website-1']] as const) {
		test(`should create each section once when a parent from ${carrierWebsite} that comes back normalized joins the list of ${listWebsite}`, async () => {
			const { engine, persister } = setup()
			const root = addSection({ name: 'Root', date: '2026-02-02' }, listWebsite)
			addSection({ name: 'Child' }, carrierWebsite, root)
			addSection({ name: 'Other', date: '2026-01-01' }, listWebsite)

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(await persistAgain(persister)).toEqual([])
			expect(createdNamed(engine, 'Root')).toBe(1)
			expect(createdNamed(engine, 'Other')).toBe(1)
		})

		test(`should create each section once when a parent from ${carrierWebsite} equals a new sibling in the list of ${listWebsite}`, async () => {
			const { engine, persister } = setup()
			const root = addSection({ name: 'Same' }, listWebsite)
			addSection({ name: 'Child' }, carrierWebsite, root)
			addSection({ name: 'Same' }, listWebsite)

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(await persistAgain(persister)).toEqual([])
			expect(createdNamed(engine, 'Same')).toBe(2)
		})
	}

	test('should not let a parent whose carrier persists later claim the row of a sibling', async () => {
		const { engine, persister } = setup()
		const root = addSection({ name: 'Root' }, 'website-1')
		addSection({ name: 'Child' }, 'website-2', root)
		addSection({ name: 'Root ' }, 'website-1')

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'Root')).toBe(1)
		expect(createdNamed(engine, 'Root ')).toBe(1)
	})

	test('should map a new tag with a trimmed name next to a tag connected by a client id', async () => {
		const { engine, persister } = setup(['Tag'])
		const shared = store.createEntity('Tag', { name: 'Shared' })
		store.addToHasMany('Article', 'article-1', 'tags', shared)
		store.addToHasMany('Article', 'article-2', 'tags', shared)
		store.addToHasMany('Article', 'article-2', 'tags', store.createEntity('Tag', { name: 'Other ' }))

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'Other ')).toBe(1)
	})

	test('should map a new section with a normalized date next to a connected existing section', async () => {
		const { engine, persister } = setup()
		engine.seed('Section', 'existing-1', { name: 'Existing', website: 'website-2' })
		store.setEntityData('Section', 'existing-1', { id: 'existing-1', name: 'Existing' }, true)
		store.setExistsOnServer('Section', 'existing-1', true)
		store.connectExistingToHasMany('Website', 'website-1', 'sections', 'existing-1')
		const created = addSection({ name: 'New', date: '2026-01-01' })

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', created)).not.toBeNull()
		expect(await persistAgain(persister)).toEqual([])
	})

	// Root is created two has-ones below Leaf, in the same mutation, and its row is in the list too.
	test('should map a new section whose grandparent, created inside it, belongs to the same list', async () => {
		const { engine, persister } = setup()
		const root = store.createEntity('Section', { name: 'Root', date: '2026-02-02' })
		connectOne('Section', root, 'website', 'website-1')
		const mid = store.createEntity('Section', { name: 'Mid' })
		connectOne('Section', mid, 'website', 'website-2')
		connectOne('Section', mid, 'parent', root)
		const leaf = addSection({ name: 'Leaf' }, 'website-1', mid)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', leaf)).toBe(sectionIdNamed(engine, 'Leaf'))
		expect(store.getPersistedId('Section', mid)).toBe(sectionIdNamed(engine, 'Mid'))
		expect(store.getPersistedId('Section', root)).toBe(sectionIdNamed(engine, 'Root'))
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'Root')).toBe(1)
		expect(createdNamed(engine, 'Leaf')).toBe(1)
	})

	test('should map a new section whose folded grandparent joins the same list', async () => {
		const { engine, persister } = setup()
		const root = addSection({ name: 'Root', date: '2026-02-02' })
		const mid = store.createEntity('Section', { name: 'Mid' })
		connectOne('Section', mid, 'website', 'website-2')
		connectOne('Section', mid, 'parent', root)
		const leaf = addSection({ name: 'Leaf' }, 'website-1', mid)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', leaf)).toBe(sectionIdNamed(engine, 'Leaf'))
		expect(store.getPersistedId('Section', mid)).toBe(sectionIdNamed(engine, 'Mid'))
		expect(store.getPersistedId('Section', root)).toBe(sectionIdNamed(engine, 'Root'))
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'Root')).toBe(1)
		expect(createdNamed(engine, 'Leaf')).toBe(1)
	})

	test('should map a new section whose great-grandparent, created inside it, belongs to the same list', async () => {
		const { engine, persister } = setup()
		const root = store.createEntity('Section', { name: 'Root', date: '2026-02-02' })
		connectOne('Section', root, 'website', 'website-1')
		const upper = store.createEntity('Section', { name: 'Upper' })
		connectOne('Section', upper, 'website', 'website-2')
		connectOne('Section', upper, 'parent', root)
		const mid = store.createEntity('Section', { name: 'Mid' })
		connectOne('Section', mid, 'website', 'website-2')
		connectOne('Section', mid, 'parent', upper)
		const leaf = addSection({ name: 'Leaf' }, 'website-1', mid)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', leaf)).toBe(sectionIdNamed(engine, 'Leaf'))
		expect(store.getPersistedId('Section', mid)).toBe(sectionIdNamed(engine, 'Mid'))
		expect(store.getPersistedId('Section', upper)).toBe(sectionIdNamed(engine, 'Upper'))
		expect(store.getPersistedId('Section', root)).toBe(sectionIdNamed(engine, 'Root'))
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'Root')).toBe(1)
		expect(createdNamed(engine, 'Leaf')).toBe(1)
	})

	test('should map a new section with a normalized date whose grandparent, created inside it, belongs to the same list', async () => {
		const { engine, persister } = setup()
		const root = store.createEntity('Section', { name: 'Root' })
		connectOne('Section', root, 'website', 'website-1')
		const mid = store.createEntity('Section', { name: 'Mid' })
		connectOne('Section', mid, 'website', 'website-2')
		connectOne('Section', mid, 'parent', root)
		const leaf = addSection({ name: 'Leaf', date: '2026-02-02' }, 'website-1', mid)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', leaf)).toBe(sectionIdNamed(engine, 'Leaf'))
		expect(store.getPersistedId('Section', mid)).toBe(sectionIdNamed(engine, 'Mid'))
		expect(store.getPersistedId('Section', root)).toBe(sectionIdNamed(engine, 'Root'))
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'Root')).toBe(1)
		expect(createdNamed(engine, 'Leaf')).toBe(1)
	})

	// Two has-one sites keep Shared from folding, so the list creates it with a client id. Leaf1 connects
	// it below a nested create at the same depth as Leaf2's chain of nested creates.
	const addClientIdSectionConnectedAtDepth = (depth: number): string => {
		const shared = addSection({ name: 'Shared' })
		newSection({ name: 'Other' }, 'website-2', shared)
		let connecting = shared
		for (let level = 1; level < depth; level++) connecting = newSection({ name: `Mid${level}` }, 'website-2', connecting)
		addSection({ name: 'Leaf1' }, 'website-1', connecting)
		let creating = newSection({ name: 'Top' }, 'website-2')
		for (let level = 1; level < depth; level++) creating = newSection({ name: `Below${level}` }, 'website-2', creating)
		addSection({ name: 'Leaf2' }, 'website-1', creating)
		return shared
	}

	test('should map a client-id section that a sibling connects two has-ones deep', async () => {
		const { engine, persister } = setup(['Section'])
		const shared = addClientIdSectionConnectedAtDepth(2)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', shared)).toBe(sectionIdNamed(engine, 'Shared'))
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'Shared')).toBe(1)
	})

	// Known gap: the one-level exclusion follows Leaf2's `parent` through Leaf1's row and drops Shared's row.
	test.failing('should map a client-id section that a sibling connects one has-one deep', async () => {
		const { engine, persister } = setup(['Section'])
		const shared = addClientIdSectionConnectedAtDepth(1)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', shared)).toBe(sectionIdNamed(engine, 'Shared'))
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'Shared')).toBe(1)
	})

	const seedSection = (engine: MiniEngine, id: string, values: Data): void => {
		engine.seed('Section', id, values)
		store.setEntityData('Section', id, { id, name: values['name'] }, true)
		store.setExistsOnServer('Section', id, true)
	}

	/** Leaf's chain of nested creates, `depth` has-ones deep, outside the list. */
	const addSectionCreatingParents = (name: string, depth: number): string => {
		let parent = newSection({ name: `${name} parent 1` }, 'website-2')
		for (let level = 2; level <= depth; level++) parent = newSection({ name: `${name} parent ${level}` }, 'website-2', parent)
		return addSection({ name }, 'website-1', parent)
	}

	// New's `children` points a row of the list, or a section above one, at New, so that row's parents lead to New.
	// Known gap: the one-level exclusion follows Leaf's `parent` through the existing row and drops New's row.
	test.failing('should map a new section whose children connect an existing section of the same list', async () => {
		const { engine, persister } = setup()
		seedSection(engine, 'existing-1', { name: 'Existing', website: 'website-1' })
		store.connectExistingToHasMany('Website', 'website-1', 'sections', 'existing-1')
		const created = addSection({ name: 'New' })
		store.connectExistingToHasMany('Section', created, 'children', 'existing-1')
		addSectionCreatingParents('Leaf', 1)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', created)).toBe(sectionIdNamed(engine, 'New'))
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'New')).toBe(1)
	})

	test('should map a new section whose children connect the parent of an existing section of the same list', async () => {
		const { engine, persister } = setup()
		seedSection(engine, 'existing-parent', { name: 'Existing parent', website: 'website-2' })
		seedSection(engine, 'existing-1', { name: 'Existing', website: 'website-1', parent: 'existing-parent' })
		store.connectExistingToHasMany('Website', 'website-1', 'sections', 'existing-1')
		const created = addSection({ name: 'New' })
		store.connectExistingToHasMany('Section', created, 'children', 'existing-parent')
		addSectionCreatingParents('Leaf', 2)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', created)).toBe(sectionIdNamed(engine, 'New'))
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'New')).toBe(1)
	})

	test('should map a new section whose children create a client-id section a sibling connects', async () => {
		const { engine, persister } = setup(['Section'])
		const created = addSection({ name: 'New' })
		const shared = newSection({ name: 'Shared' }, 'website-2')
		store.addToHasMany('Section', created, 'children', shared)
		addSection({ name: 'Sibling' }, 'website-1', shared)
		addSectionCreatingParents('Leaf', 2)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', created)).toBe(sectionIdNamed(engine, 'New'))
		expect(store.getPersistedId('Section', shared)).toBe(sectionIdNamed(engine, 'Shared'))
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'New')).toBe(1)
		expect(createdNamed(engine, 'Shared')).toBe(1)
	})

	test('should map a new section whose children create a section of the same list two levels down', async () => {
		const { engine, persister } = setup()
		const created = addSection({ name: 'New' })
		const mid = newSection({ name: 'Mid' }, 'website-2')
		store.addToHasMany('Section', created, 'children', mid)
		const inner = newSection({ name: 'Inner' }, 'website-1')
		store.addToHasMany('Section', mid, 'children', inner)
		addSectionCreatingParents('Leaf', 2)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getPersistedId('Section', created)).toBe(sectionIdNamed(engine, 'New'))
		expect(await persistAgain(persister)).toEqual([])
		expect(createdNamed(engine, 'New')).toBe(1)
		expect(createdNamed(engine, 'Inner')).toBe(1)
	})
	/** X connects an existing row of the list as a child, so the known gap above excludes X's own row. */
	const addSectionLosingItsRow = (engine: MiniEngine): string => {
		seedSection(engine, 'existing-1', { name: 'Existing', website: 'website-1' })
		store.connectExistingToHasMany('Website', 'website-1', 'sections', 'existing-1')
		const parent = newSection({ name: 'X parent' }, 'website-2', newSection({ name: 'X grandparent' }, 'website-2'))
		const created = addSection({ name: 'X' }, 'website-1', parent)
		store.connectExistingToHasMany('Section', created, 'children', 'existing-1')
		return created
	}

	// Up is the only other free row with a grandparent, and Leaf B created it.
	test('should not map a new section that lost its row to a row a sibling created through a has-one', async () => {
		const { engine, persister } = setup()
		const created = addSectionLosingItsRow(engine)
		addSection({ name: 'Leaf A' }, 'website-1', newSection({ name: 'Mid A' }, 'website-2', newSection({ name: 'Root A' }, 'website-1')))
		const up = newSection({ name: 'Up' }, 'website-1', newSection({ name: 'Top' }, 'website-2', newSection({ name: 'Above top' }, 'website-2')))
		addSection({ name: 'Leaf B' }, 'website-1', newSection({ name: 'Mid B' }, 'website-2', up))

		await persister.persistAll()

		expect([null, sectionIdNamed(engine, 'X')]).toContain(store.getPersistedId('Section', created))
	})

	test('should not map a new section that lost its row to a row a sibling created through a has-many', async () => {
		const { engine, persister } = setup()
		const created = addSectionLosingItsRow(engine)
		// Kid B, a child Mid B creates, is the only other free row with a grandparent.
		for (const [name, hasParent] of [['B', true], ['C', false]] as const) {
			const mid = newSection({ name: `Mid ${name}` }, 'website-2', hasParent ? newSection({ name: 'Top' }, 'website-2') : undefined)
			store.addToHasMany('Section', mid, 'children', newSection({ name: `Kid ${name}` }, 'website-1'))
			addSection({ name: `Leaf ${name}` }, 'website-1', mid)
		}

		await persister.persistAll()

		expect([null, sectionIdNamed(engine, 'X')]).toContain(store.getPersistedId('Section', created))
	})

	test('should not map a new section that lost its row to a row the client never loaded', async () => {
		const { engine, persister } = setup()
		const created = addSectionLosingItsRow(engine)
		engine.seed('Section', 'unloaded-grandparent', { name: 'Unloaded grandparent', website: 'website-2' })
		engine.seed('Section', 'unloaded-parent', { name: 'Unloaded parent', website: 'website-2', parent: 'unloaded-grandparent' })
		engine.seed('Section', 'unloaded-1', { name: 'Unloaded', website: 'website-1', parent: 'unloaded-parent' })
		engine.seed('Section', 'unloaded-2', { name: 'Unloaded orphan', website: 'website-1' })

		await persister.persistAll()

		expect([null, sectionIdNamed(engine, 'X')]).toContain(store.getPersistedId('Section', created))
	})
})

describe('shared creates around a failed or refused mutation', () => {
	let store: SnapshotStore
	let calls: AdapterCall[]

	beforeEach(() => {
		store = new SnapshotStore()
		calls = []
	})

	const setup = (customPrimary: readonly string[] = []): { engine: MiniEngine; persister: BatchPersister } => {
		const engine = new MiniEngine(new Set(customPrimary))
		const persister = new BatchPersister(createEngineAdapter(engine, calls, []), store, new ActionDispatcher(store), {
			mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
		})
		for (const id of ['website-1', 'website-2']) {
			engine.seed('Website', id, { name: id })
			store.setEntityData('Website', id, { id, name: id }, true)
			store.setExistsOnServer('Website', id, true)
			store.getOrCreateHasMany('Website', id, 'sections', [])
		}
		for (const id of ['article-1', 'article-2']) {
			engine.seed('Article', id, { title: id })
			store.setEntityData('Article', id, { id, title: id }, true)
			store.setExistsOnServer('Article', id, true)
			store.getOrCreateHasMany('Article', id, 'tags', [])
			store.getOrCreateHasMany('Article', id, 'gallery', [])
		}
		return { engine, persister }
	}

	test('should commit a folded membership when the list owner\'s own mutation fails', async () => {
		const { engine, persister } = setup()
		store.setFieldValue('Website', 'website-1', ['name'], 'BAD')
		const root = store.createEntity('Section', { name: 'Root' })
		store.addToHasMany('Website', 'website-1', 'sections', root)
		const child = store.createEntity('Section', { name: 'Child' })
		store.getOrCreateRelation('Section', child, 'parent', {
			currentId: root, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
		store.addToHasMany('Website', 'website-2', 'sections', child)

		await persister.persistAll()
		store.setFieldValue('Website', 'website-1', ['name'], 'Fixed')
		calls.length = 0
		await persister.persistAll()

		expect(calls).toEqual([{ entityType: 'Website', data: { name: 'Fixed' } }])
		expect(createdNamed(engine, 'Root')).toBe(1)
	})

	test('should create a new image used as cover and in the gallery of one article once', async () => {
		const { engine, persister } = setup(['Image'])
		const image = store.createEntity('Image', { url: 'picture' })
		store.getOrCreateRelation('Article', 'article-1', 'cover', {
			currentId: image, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
		store.addToHasMany('Article', 'article-1', 'gallery', image)

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(createdNamed(engine, 'picture')).toBe(1)
		calls.length = 0
		await persister.persistAll()
		expect(calls).toEqual([])
	})

	test('should create a new image used in the gallery and as thumbnail of one article once', async () => {
		const { engine, persister } = setup(['Image'])
		const image = store.createEntity('Image', { url: 'picture' })
		store.addToHasMany('Article', 'article-1', 'gallery', image)
		store.getOrCreateRelation('Article', 'article-1', 'thumbnail', {
			currentId: image, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(createdNamed(engine, 'picture')).toBe(1)
	})

	test('should count the entity that cannot be created once as failed, not also as skipped', async () => {
		const { persister } = setup()
		const tag = store.createEntity('Tag', { name: 'Shared' })
		store.addToHasMany('Article', 'article-1', 'tags', tag)
		store.addToHasMany('Article', 'article-2', 'tags', tag)

		const result = await persister.persistAll()

		expect(calls).toEqual([])
		expect(result.failedCount + result.skippedCount).toBe(3)
	})
})
