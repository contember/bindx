// Regression tests for https://github.com/contember/bindx/issues/169
/**
 * A temp entity referenced from more than one place in one persist is created once.
 *
 * The adapter runs every mutation against a small in-memory engine with the rules the
 * Contember engine applies: has-one ops of a row run before the row is written and
 * has-many ops after it, a `connect` must find an existing row, a not-null owning
 * relation must be set, and a create may carry its own `id` only when the entity
 * allows a custom primary key. The response echoes the node selection the mutation
 * asked for, the way a real API does.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import {
	ActionDispatcher,
	BatchPersister,
	ContemberSchemaMutationAdapter,
	MutationCollector,
	SnapshotStore,
	type BackendAdapter,
	type SchemaNames,
} from '@contember/bindx'
import { buildNodeSelectionFromMutationData } from '@contember/bindx-client'
import { GraphQlField, type GraphQlSelectionSet } from '@contember/graphql-builder'

const schema: SchemaNames = {
	entities: {
		Website: {
			name: 'Website',
			scalars: ['id', 'name'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
				sections: { type: 'many', entity: 'Section', relationKind: 'oneHasMany', inverse: 'website' },
			},
		},
		Section: {
			name: 'Section',
			scalars: ['id', 'name'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
				website: { type: 'one', entity: 'Website', nullable: false, inverse: 'sections' },
				parent: { type: 'one', entity: 'Section', nullable: true },
			},
		},
		Article: {
			name: 'Article',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				tags: { type: 'many', entity: 'Tag', relationKind: 'manyHasMany' },
				cover: { type: 'one', entity: 'Image', nullable: true },
				thumbnail: { type: 'one', entity: 'Image', nullable: true },
			},
		},
		Tag: {
			name: 'Tag',
			scalars: ['id', 'name'],
			fields: { id: { type: 'column' }, name: { type: 'column' } },
		},
		Image: {
			name: 'Image',
			scalars: ['id', 'url'],
			fields: { id: { type: 'column' }, url: { type: 'column' } },
		},
	},
	enums: {},
}

type FieldDef = SchemaNames['entities'][string]['fields'][string]
type Data = Record<string, unknown>

interface Row {
	readonly entity: string
	readonly id: string
	readonly values: Map<string, unknown>
}

interface NodeSelection {
	readonly name: string
	readonly children?: readonly NodeSelection[]
}

const readSelection = (selectionSet: GraphQlSelectionSet): NodeSelection[] =>
	selectionSet
		.filter(item => item instanceof GraphQlField)
		.map(field => ({ name: field.name, children: field.selectionSet ? readSelection(field.selectionSet) : undefined }))

const isData = (value: unknown): value is Data => typeof value === 'object' && value !== null && !Array.isArray(value)

class MiniEngine {
	readonly rows = new Map<string, Row>()
	readonly junctions = new Set<string>()
	readonly sentCreates: { entity: string; data: Data }[] = []
	private nextId = 0

	constructor(readonly customPrimary: ReadonlySet<string>) {}

	seed(entity: string, id: string, values: Data): void {
		this.rows.set(id, { entity, id, values: new Map(Object.entries(values)) })
	}

	write(entity: string, data: Data, existingId?: string): Row {
		const fields = schema.entities[entity]!.fields
		let row: Row
		if (existingId) {
			row = this.rows.get(existingId)!
		} else {
			const clientId = data['id']
			if (typeof clientId === 'string' && !this.customPrimary.has(entity)) throw new Error(`${entity}.id: field not allowed`)
			row = { entity, id: typeof clientId === 'string' ? clientId : `server-${++this.nextId}`, values: new Map() }
			this.sentCreates.push({ entity, data })
		}
		for (const [key, value] of Object.entries(data)) {
			const def = fields[key]
			if (def?.type === 'one' && isData(value)) row.values.set(key, this.resolveOne(def, value))
		}
		for (const [key, value] of Object.entries(data)) {
			if (fields[key]?.type === 'column' && key !== 'id') row.values.set(key, value)
		}
		if (!existingId) this.rows.set(row.id, row)
		for (const [key, value] of Object.entries(data)) {
			const def = fields[key]
			if (def?.type === 'many' && Array.isArray(value)) value.forEach(op => this.applyMany(row, key, def, op))
		}
		for (const [key, def] of Object.entries(fields)) {
			if (def.type === 'one' && def.nullable === false && row.values.get(key) === undefined) {
				throw new Error(`${entity}.${key}: Field is required`)
			}
		}
		return row
	}

	private requireRow(id: unknown): string {
		if (typeof id !== 'string' || !this.rows.has(id)) throw new Error(`connect: row ${String(id)} does not exist`)
		return id
	}

	private resolveOne(def: Extract<FieldDef, { type: 'one' }>, op: Data): string {
		const create = op['create']
		if (isData(create)) return this.write(def.entity, create).id
		const connect = op['connect']
		if (isData(connect)) return this.requireRow(connect['id'])
		throw new Error('unsupported has-one op')
	}

	private applyMany(owner: Row, field: string, def: Extract<FieldDef, { type: 'many' }>, op: unknown): void {
		if (!isData(op)) return
		const create = op['create']
		const connect = op['connect']
		if (def.relationKind === 'oneHasMany' && def.inverse) {
			if (isData(create)) this.write(def.entity, { ...create, [def.inverse]: { connect: { id: owner.id } } })
			else if (isData(connect)) this.rows.get(this.requireRow(connect['id']))!.values.set(def.inverse, owner.id)
			return
		}
		const targetId = isData(create) ? this.write(def.entity, create).id : isData(connect) ? this.requireRow(connect['id']) : undefined
		if (targetId) this.junctions.add(`${owner.id}:${field}:${targetId}`)
	}

	node(row: Row, selection: readonly NodeSelection[]): Data {
		const fields = schema.entities[row.entity]!.fields
		const node: Data = { id: row.id }
		for (const field of selection) {
			const def = fields[field.name]
			if (!def || field.name === 'id') continue
			if (def.type === 'column') node[field.name] = row.values.get(field.name) ?? null
			else if (def.type === 'one') {
				const targetId = row.values.get(field.name)
				const target = typeof targetId === 'string' ? this.rows.get(targetId) : undefined
				node[field.name] = target ? this.node(target, field.children ?? []) : null
			} else {
				node[field.name] = [...this.rows.values()]
					.filter(target => target.entity === def.entity && (def.inverse && def.relationKind === 'oneHasMany'
						? target.values.get(def.inverse) === row.id
						: this.junctions.has(`${row.id}:${field.name}:${target.id}`)))
					.map(target => this.node(target, field.children ?? []))
			}
		}
		return node
	}
}

interface AdapterCall {
	readonly entityType: string
	readonly data: Data
}

function createEngineAdapter(engine: MiniEngine, calls: AdapterCall[], customPrimaryChecks: string[]): BackendAdapter {
	const run = (entityType: string, data: Data, existingId?: string) => {
		calls.push({ entityType, data })
		try {
			const row = engine.write(entityType, data, existingId)
			return Promise.resolve({ ok: true, data: engine.node(row, readSelection(buildNodeSelectionFromMutationData(data))) })
		} catch (error) {
			return Promise.resolve({ ok: false, errorMessage: error instanceof Error ? error.message : String(error) })
		}
	}
	return {
		query: () => Promise.resolve([]),
		persist: (entityType, entityId, changes) => run(entityType, changes, entityId),
		create: (entityType, data) => run(entityType, data),
		delete: () => Promise.resolve({ ok: true }),
		isCustomPrimaryAllowed: entityType => {
			customPrimaryChecks.push(entityType)
			return Promise.resolve(engine.customPrimary.has(entityType))
		},
	}
}

const createdNamed = (engine: MiniEngine, name: string): number =>
	engine.sentCreates.filter(create => create.data['name'] === name || create.data['url'] === name).length

describe('a temp entity referenced from several places in one persist', () => {
	let store: SnapshotStore
	let calls: AdapterCall[]
	let customPrimaryChecks: string[]

	const setup = (customPrimary: readonly string[]): { engine: MiniEngine; persister: BatchPersister; dispatcher: ActionDispatcher } => {
		const engine = new MiniEngine(new Set(customPrimary))
		const dispatcher = new ActionDispatcher(store)
		const persister = new BatchPersister(createEngineAdapter(engine, calls, customPrimaryChecks), store, dispatcher, {
			mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
		})
		for (const id of ['website-1', 'website-2']) {
			engine.seed('Website', id, { name: id })
			store.setEntityData('Website', id, { id, name: id }, true)
			store.setExistsOnServer('Website', id, true)
			store.getOrCreateHasMany('Website', id, 'sections', [])
		}
		return { engine, persister, dispatcher }
	}

	const addSection = (name: string, parent?: string, website = 'website-1'): string => {
		const id = store.createEntity('Section', { name })
		if (parent) {
			store.getOrCreateRelation('Section', id, 'parent', {
				currentId: parent, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
			})
		}
		store.addToHasMany('Website', website, 'sections', id)
		return id
	}

	const persistAgain = async (persister: BatchPersister): Promise<void> => {
		calls.length = 0
		const second = await persister.persistAll()
		expect(second.success).toBe(true)
		expect(calls).toEqual([])
	}

	const setParent = (child: string, parent: string): void => {
		store.getOrCreateRelation('Section', child, 'parent', {
			currentId: parent, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
	}

	const sectionRow = (engine: MiniEngine, name: string) => [...engine.rows.values()].find(row => row.entity === 'Section' && row.values.get('name') === name)

	beforeEach(() => {
		store = new SnapshotStore()
		calls = []
		customPrimaryChecks = []
	})

	describe('folded into its single has-one, joining the list through its owning relation', () => {
		test('should create the parent section once, without a client id', async () => {
			const { engine, persister } = setup([])
			const root = addSection('Root')
			addSection('Child', root)

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(createdNamed(engine, 'Root')).toBe(1)
			expect(engine.sentCreates.some(create => 'id' in create.data)).toBe(false)
			expect(customPrimaryChecks).toEqual([])
			const rootRow = sectionRow(engine, 'Root')
			expect(sectionRow(engine, 'Child')?.values.get('parent')).toBe(rootRow?.id)
			expect(rootRow?.values.get('website')).toBe('website-1')
		})

		test('should create it once when the child was added to the list first', async () => {
			const { engine, persister } = setup([])
			const child = addSection('Child')
			const root = addSection('Root')
			setParent(child, root)

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(createdNamed(engine, 'Root')).toBe(1)
			expect(sectionRow(engine, 'Child')?.values.get('parent')).toBe(sectionRow(engine, 'Root')?.id)
		})

		test('should map both ids when the two sections carry the same values', async () => {
			const { engine, persister } = setup([])
			const root = addSection('Same')
			const child = addSection('Same', root)

			const result = await persister.persistAll()

			// The response lists both new rows in website.sections; only the child's row has the parent set.
			expect(result.success).toBe(true)
			const childRow = engine.rows.get(store.getPersistedId('Section', child) ?? '')
			expect(childRow?.values.get('parent')).toBe(store.getPersistedId('Section', root))
		})

		test('should leave nothing to save afterwards', async () => {
			const { persister } = setup([])
			const root = addSection('Root')
			addSection('Child', root)
			await persister.persistAll()
			calls.length = 0

			const second = await persister.persistAll()

			expect(second.success).toBe(true)
			expect(calls).toEqual([])
			expect(store.getHasMany('Website', 'website-1', 'sections')?.plannedAdditions.size).toBe(0)
		})

		test('should leave nothing to save when the parent joins a list of another website', async () => {
			const { engine, persister } = setup([])
			const root = addSection('Root')
			addSection('Child', root, 'website-2')

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(createdNamed(engine, 'Root')).toBe(1)
			expect(sectionRow(engine, 'Root')?.values.get('website')).toBe('website-1')
			expect(sectionRow(engine, 'Child')?.values.get('website')).toBe('website-2')
			await persistAgain(persister)
		})

		test('should leave nothing to save when that website is renamed in the same persist', async () => {
			const { persister } = setup([])
			store.setFieldValue('Website', 'website-1', ['name'], 'Renamed')
			const root = addSection('Root')
			addSection('Child', root, 'website-2')

			expect((await persister.persistAll()).success).toBe(true)
			await persistAgain(persister)
		})

		test('should create the parent through its list when an interceptor vetoes the child', async () => {
			const { engine, persister, dispatcher } = setup([])
			const root = addSection('Root')
			const child = addSection('Child', root)
			dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Section', child, () => ({ action: 'cancel' }))

			const result = await persister.persist('Website', 'website-1')

			expect(result.success).toBe(true)
			expect(createdNamed(engine, 'Root')).toBe(1)
			expect(createdNamed(engine, 'Child')).toBe(0)
			expect(sectionRow(engine, 'Root')?.values.get('website')).toBe('website-1')
			expect(store.getPersistedId('Section', root)).toBe(sectionRow(engine, 'Root')?.id ?? null)
		})
	})

	describe('referenced by two has-ones, with a client-chosen primary key', () => {
		test('should create the parent once and connect both sub-sections to it', async () => {
			const { engine, persister } = setup(['Section'])
			const root = addSection('Root')
			addSection('A', root)
			addSection('B', root)

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(createdNamed(engine, 'Root')).toBe(1)
			const rootRow = sectionRow(engine, 'Root')
			expect(sectionRow(engine, 'A')?.values.get('parent')).toBe(rootRow?.id)
			expect(sectionRow(engine, 'B')?.values.get('parent')).toBe(rootRow?.id)
			expect(rootRow?.values.get('website')).toBe('website-1')
			expect(store.getPersistedId('Section', root)).toBe(rootRow?.id ?? null)
		})

		test('should order the creates when the sub-sections were added before the parent', async () => {
			const { engine, persister } = setup(['Section'])
			const a = addSection('A')
			const b = addSection('B')
			const root = addSection('Root')
			setParent(a, root)
			setParent(b, root)

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(createdNamed(engine, 'Root')).toBe(1)
			expect(sectionRow(engine, 'A')?.values.get('parent')).toBe(sectionRow(engine, 'Root')?.id)
		})

		test('should leave nothing to save afterwards', async () => {
			const { persister } = setup(['Section'])
			const root = addSection('Root')
			addSection('A', root)
			addSection('B', root)
			await persister.persistAll()
			calls.length = 0

			const second = await persister.persistAll()

			expect(second.success).toBe(true)
			expect(calls).toEqual([])
		})

		test('should leave nothing to save when the sub-sections are in another website', async () => {
			const { engine, persister } = setup(['Section'])
			const root = addSection('Root')
			addSection('A', root, 'website-2')
			addSection('B', root, 'website-2')

			expect((await persister.persistAll()).success).toBe(true)
			expect(createdNamed(engine, 'Root')).toBe(1)
			expect(sectionRow(engine, 'A')?.values.get('parent')).toBe(sectionRow(engine, 'Root')?.id)
			await persistAgain(persister)
		})

		test('should send nothing and report why when the backend does not allow a client id', async () => {
			const { persister } = setup([])
			const root = addSection('Root')
			addSection('A', root)
			addSection('B', root)

			const result = await persister.persistAll()

			expect(result.success).toBe(false)
			expect(calls).toEqual([])
			expect(customPrimaryChecks).toEqual(['Section'])
			expect(result.results.map(entry => entry.entityId)).toEqual([root])
			expect(result.results[0]?.error?.message).toContain('customPrimary')
		})
	})

	describe('content matching of nested creates', () => {
		test('should map ids of new sections whose connected parent the role cannot read', async () => {
			const engine = new MiniEngine(new Set())
			const base = createEngineAdapter(engine, calls, customPrimaryChecks)
			const hideParents = (data: Data | undefined): Data | undefined => (data && Array.isArray(data['sections'])
				? { ...data, sections: data['sections'].map((item: unknown) => (isData(item) ? { ...item, parent: null } : item)) }
				: data)
			const adapter: BackendAdapter = {
				...base,
				persist: async (entityType, entityId, changes) => {
					const result = await base.persist(entityType, entityId, changes)
					return result.ok ? { ...result, data: hideParents(result.data) } : result
				},
			}
			const persister = new BatchPersister(adapter, store, new ActionDispatcher(store), {
				mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
			})
			engine.seed('Website', 'website-1', { name: 'Site' })
			store.setEntityData('Website', 'website-1', { id: 'website-1', name: 'Site' }, true)
			store.setExistsOnServer('Website', 'website-1', true)
			store.getOrCreateHasMany('Website', 'website-1', 'sections', [])
			for (const id of ['hidden-1', 'hidden-2']) {
				engine.seed('Section', id, { name: id, website: 'website-1' })
				store.setEntityData('Section', id, { id, name: id }, true)
				store.setExistsOnServer('Section', id, true)
			}
			const a = addSection('A', 'hidden-1')
			const b = addSection('B', 'hidden-2')

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(store.getPersistedId('Section', a)).toBe(sectionRow(engine, 'A')?.id ?? null)
			expect(store.getPersistedId('Section', b)).toBe(sectionRow(engine, 'B')?.id ?? null)
		})
	})

	describe('when asking the backend about a client id fails', () => {
		test('should send nothing and return a failed result', async () => {
			const engine = new MiniEngine(new Set(['Section']))
			engine.seed('Website', 'website-1', { name: 'Site' })
			store.setEntityData('Website', 'website-1', { id: 'website-1', name: 'Site' }, true)
			store.setExistsOnServer('Website', 'website-1', true)
			store.getOrCreateHasMany('Website', 'website-1', 'sections', [])
			const adapter: BackendAdapter = {
				...createEngineAdapter(engine, calls, customPrimaryChecks),
				isCustomPrimaryAllowed: () => Promise.reject(new Error('introspection unavailable')),
			}
			const persister = new BatchPersister(adapter, store, new ActionDispatcher(store), {
				mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
			})
			const root = addSection('Root')
			addSection('A', root)
			addSection('B', root)

			const result = await persister.persistAll()

			expect(result.success).toBe(false)
			expect(calls).toEqual([])
			expect(result.results[0]?.error?.message).toContain('introspection unavailable')
		})
	})

	describe('without a one-has-many it could join through', () => {
		test('should create a tag added to two articles once and connect the second', async () => {
			const engine = new MiniEngine(new Set(['Tag']))
			const persister = new BatchPersister(createEngineAdapter(engine, calls, customPrimaryChecks), store, new ActionDispatcher(store), {
				mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
			})
			for (const id of ['article-1', 'article-2']) {
				engine.seed('Article', id, { title: id })
				store.setEntityData('Article', id, { id, title: id }, true)
				store.setExistsOnServer('Article', id, true)
				store.getOrCreateHasMany('Article', id, 'tags', [])
			}
			const tag = store.createEntity('Tag', { name: 'New' })
			store.addToHasMany('Article', 'article-2', 'tags', tag)
			store.addToHasMany('Article', 'article-1', 'tags', tag)

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(createdNamed(engine, 'New')).toBe(1)
			const tagId = store.getPersistedId('Tag', tag)
			expect(engine.junctions.has(`article-1:tags:${tagId}`)).toBe(true)
			expect(engine.junctions.has(`article-2:tags:${tagId}`)).toBe(true)
			await persistAgain(persister)
		})

		test('should create an image used as both cover and thumbnail once', async () => {
			const engine = new MiniEngine(new Set(['Image']))
			const persister = new BatchPersister(createEngineAdapter(engine, calls, customPrimaryChecks), store, new ActionDispatcher(store), {
				mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
			})
			engine.seed('Article', 'article-1', { title: 'A' })
			store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'A' }, true)
			store.setExistsOnServer('Article', 'article-1', true)
			const image = store.createEntity('Image', { url: 'pic.png' })
			for (const field of ['cover', 'thumbnail']) {
				store.getOrCreateRelation('Article', 'article-1', field, {
					currentId: image, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
				})
			}

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(createdNamed(engine, 'pic.png')).toBe(1)
			const article = engine.rows.get('article-1')
			expect(article?.values.get('cover')).toBe(article?.values.get('thumbnail'))
		})
	})
})
