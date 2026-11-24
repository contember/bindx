/**
 * A small in-memory engine for persistence tests, with the rules the Contember engine
 * applies: has-one ops of a row run before the row is written and has-many ops after
 * it, a `connect` must find an existing row, a not-null owning relation must be set,
 * a create may carry its own `id` only when the entity allows a custom primary key,
 * and a failed mutation leaves nothing behind. A value `BAD` is rejected. The response
 * echoes the node selection the mutation asked for, the way a real API does.
 */
import type { BackendAdapter, SchemaNames } from '@contember/bindx'
import { buildNodeSelectionFromMutationData } from '@contember/bindx-client'
import { GraphQlField, type GraphQlSelectionSet } from '@contember/graphql-builder'

export const schema: SchemaNames = {
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
			scalars: ['id', 'name', 'date'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
				date: { type: 'column' },
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
				gallery: { type: 'many', entity: 'Image', relationKind: 'manyHasMany' },
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
export type Data = Record<string, unknown>

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

export const isData = (value: unknown): value is Data => typeof value === 'object' && value !== null && !Array.isArray(value)

export class MiniEngine {
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
		if (Object.values(data).includes('BAD')) throw new Error(`${entity}: BAD value`)
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

export interface AdapterCall {
	readonly entityType: string
	readonly data: Data
}

export function createEngineAdapter(engine: MiniEngine, calls: AdapterCall[], customPrimaryChecks: string[]): BackendAdapter {
	const run = (entityType: string, data: Data, existingId?: string) => {
		calls.push({ entityType, data })
		const savedRows = new Map([...engine.rows].map(([id, row]) => [id, { ...row, values: new Map(row.values) }]))
		const savedJunctions = new Set(engine.junctions)
		const savedCreates = engine.sentCreates.length
		try {
			const row = engine.write(entityType, data, existingId)
			return Promise.resolve({ ok: true, data: engine.node(row, readSelection(buildNodeSelectionFromMutationData(data))) })
		} catch (error) {
			// A failed mutation is a rolled-back transaction: nothing it wrote stays.
			engine.rows.clear()
			for (const [id, row] of savedRows) engine.rows.set(id, row)
			engine.junctions.clear()
			for (const junction of savedJunctions) engine.junctions.add(junction)
			engine.sentCreates.length = savedCreates
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

export const createdNamed = (engine: MiniEngine, name: string): number =>
	engine.sentCreates.filter(create => create.data['name'] === name || create.data['url'] === name).length
