/**
 * Types matching the Contember API schema introspection format.
 * These types are compatible with binding-common's Schema.
 */

export type SchemaColumnType = 'Bool' | 'Date' | 'DateTime' | 'Double' | 'Enum' | 'Integer' | 'String' | 'Uuid' | 'Json' | string

export interface SchemaColumn {
	__typename: '_Column'
	name: string
	nullable: boolean
	type: SchemaColumnType
	enumName: string | null
	defaultValue: string | number | boolean | null
}

export interface SchemaRelationOrderBy {
	path: string[]
	direction: 'asc' | 'desc'
}

interface BaseRelation {
	__typename: '_Relation'
	name: string
	nullable: boolean | null
	onDelete: 'restrict' | 'cascade' | 'setNull' | null
	orderBy: SchemaRelationOrderBy[] | null
	orphanRemoval: boolean | null
	targetEntity: string
	type: 'OneHasOne' | 'OneHasMany' | 'ManyHasOne' | 'ManyHasMany'
}

export interface OwningRelation extends BaseRelation {
	side: 'owning'
	inversedBy: string | null
	ownedBy?: never
}

export interface InverseRelation extends BaseRelation {
	side: 'inverse'
	ownedBy: string
	inversedBy?: never
}

export type SchemaRelation = OwningRelation | InverseRelation

export type SchemaField = SchemaColumn | SchemaRelation

export interface SchemaEntity {
	name: string
	customPrimaryAllowed: boolean
	fields: Map<string, SchemaField>
	unique: { fields: Set<string> }[]
}

export interface SchemaEnum {
	name: string
	values: string[]
}

/**
 * Processed schema store with Maps for efficient lookup.
 * This is the format used internally after loading from API.
 */
export interface ContemberSchemaStore {
	entities: Map<string, SchemaEntity>
	enums: Map<string, Set<string>>
}

/**
 * Raw schema format as returned by the Contember API.
 */
export interface RawContemberSchema {
	enums: { name: string; values: string[] }[]
	entities: {
		name: string
		customPrimaryAllowed: boolean
		fields: (SchemaColumn | (Omit<SchemaRelation, 'side'> & { side: 'owning' | 'inverse'; ownedBy?: string; inversedBy?: string | null }))[]
		unique: { fields: string[] }[]
	}[]
}

/**
 * Schema class compatible with binding-common's Schema.
 * Can be used directly or created from API response.
 */
export class ContemberSchema {
	constructor(private readonly store: ContemberSchemaStore) {}

	getEntity(entityName: string): SchemaEntity | undefined {
		return this.store.entities.get(entityName)
	}

	getEntityNames(): string[] {
		return Array.from(this.store.entities.keys())
	}

	getEntityField(entityName: string, fieldName: string): SchemaField | undefined {
		return this.store.entities.get(entityName)?.fields.get(fieldName)
	}

	getEnumValues(enumName: string): string[] | undefined {
		const values = this.store.enums.get(enumName)
		return values ? Array.from(values) : undefined
	}

	/**
	 * Creates a ContemberSchema from raw API response.
	 */
	static fromRaw(raw: RawContemberSchema): ContemberSchema {
		const enums = new Map<string, Set<string>>()
		for (const { name, values } of raw.enums) {
			enums.set(name, new Set(values))
		}

		const entities = new Map<string, SchemaEntity>()
		for (const entity of raw.entities) {
			const fields = new Map<string, SchemaField>()
			for (const field of entity.fields) {
				fields.set(field.name, field as SchemaField)
			}
			entities.set(entity.name, {
				name: entity.name,
				customPrimaryAllowed: entity.customPrimaryAllowed,
				fields,
				unique: entity.unique.map(u => ({ fields: new Set(u.fields) })),
			})
		}

		return new ContemberSchema({ entities, enums })
	}
}
