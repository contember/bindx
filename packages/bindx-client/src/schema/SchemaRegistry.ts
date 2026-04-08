import type { ContemberSchema } from './ContemberSchema.js'
import type {
	EntitySchemaDef,
	FieldDef,
	HasManyRelationDef,
	HasOneRelationDef,
	RelationType,
	SchemaDefinition,
} from './types.js'

/**
 * Runtime registry for entity schemas.
 * Provides lookups for entity definitions, relation targets, and field types.
 */
export class SchemaRegistry<TModels extends Record<string, object> = Record<string, object>> {
	private readonly entityDefs: Map<string, EntitySchemaDef>

	constructor(definition: SchemaDefinition<TModels>) {
		this.entityDefs = new Map()

		for (const [entityName, entityDef] of Object.entries(definition.entities)) {
			this.entityDefs.set(entityName, normalizeEntityDef(entityDef as EntitySchemaDef))
		}
	}

	/**
	 * Creates a SchemaRegistry from a ContemberSchema (loaded from API or injected).
	 * This is the preferred way to create a SchemaRegistry at runtime.
	 */
	static fromContemberSchema(schema: ContemberSchema): SchemaRegistry {
		const entities: Record<string, EntitySchemaDef> = {}

		for (const entityName of schema.getEntityNames()) {
			const entity = schema.getEntity(entityName)
			if (!entity) continue

			const fields: Record<string, FieldDef> = {}

			for (const [fieldName, field] of entity.fields) {
				if (field.__typename === '_Column') {
					fields[fieldName] = { type: 'scalar', columnType: field.type }
				} else if (field.__typename === '_Relation') {
					const inverse = field.side === 'owning' ? field.inversedBy ?? undefined : field.ownedBy
					const isMany = field.type === 'OneHasMany' || field.type === 'ManyHasMany'
					if (isMany) {
						fields[fieldName] = {
							type: 'hasMany',
							target: field.targetEntity,
							inverse,
							relationKind: field.type === 'ManyHasMany' ? 'manyHasMany' : 'oneHasMany',
							nullable: field.nullable ?? undefined,
						}
					} else {
						fields[fieldName] = {
							type: 'hasOne',
							target: field.targetEntity,
							inverse,
							nullable: field.nullable ?? undefined,
						}
					}
				}
			}

			entities[entityName] = { fields }
		}

		return new SchemaRegistry({ entities } as SchemaDefinition<Record<string, object>>)
	}

	/**
	 * Gets the entity names defined in the schema
	 */
	getEntityNames(): string[] {
		return Array.from(this.entityDefs.keys())
	}

	/**
	 * Checks if an entity type exists in the schema
	 */
	hasEntity(entityType: string): boolean {
		return this.entityDefs.has(entityType)
	}

	/**
	 * Gets the schema definition for an entity type
	 */
	getEntityDef(entityType: string): EntitySchemaDef | undefined {
		return this.entityDefs.get(entityType)
	}

	/**
	 * Gets the field definition for a specific field on an entity
	 */
	getFieldDef(entityType: string, fieldName: string): FieldDef | undefined {
		const entityDef = this.entityDefs.get(entityType)
		if (!entityDef) return undefined
		return entityDef.fields[fieldName]
	}

	/**
	 * Gets the enum values for an enum field.
	 * Returns undefined if the field is not an enum or doesn't exist.
	 */
	getEnumValues(entityType: string, fieldName: string): readonly string[] | undefined {
		const fieldDef = this.getFieldDef(entityType, fieldName)
		if (!fieldDef || fieldDef.type !== 'enum') return undefined
		return fieldDef.values
	}

	/**
	 * Gets the enum name for an enum field.
	 * Returns undefined if the field is not an enum or doesn't exist.
	 */
	getEnumName(entityType: string, fieldName: string): string | undefined {
		const fieldDef = this.getFieldDef(entityType, fieldName)
		if (!fieldDef || fieldDef.type !== 'enum') return undefined
		return fieldDef.enumName
	}

	/**
	 * Gets the column type for a scalar field (e.g. 'String', 'Integer', 'Date').
	 * Returns undefined if the field is not a scalar or doesn't exist.
	 */
	getColumnType(entityType: string, fieldName: string): string | undefined {
		const fieldDef = this.getFieldDef(entityType, fieldName)
		if (!fieldDef || fieldDef.type !== 'scalar') return undefined
		return fieldDef.columnType
	}

	/**
	 * Gets the target entity type for a relation field.
	 * Returns undefined if the field is not a relation or doesn't exist.
	 */
	getRelationTarget(entityType: string, fieldName: string): string | undefined {
		const fieldDef = this.getFieldDef(entityType, fieldName)
		if (!fieldDef) return undefined

		if (fieldDef.type === 'hasOne' || fieldDef.type === 'hasMany') {
			return fieldDef.target
		}

		return undefined
	}

	/**
	 * Gets the relation type for a field (hasOne or hasMany).
	 * Returns undefined if the field is not a relation.
	 */
	getRelationType(entityType: string, fieldName: string): RelationType | undefined {
		const fieldDef = this.getFieldDef(entityType, fieldName)
		if (!fieldDef) return undefined

		if (fieldDef.type === 'hasOne' || fieldDef.type === 'hasMany') {
			return fieldDef.type
		}

		return undefined
	}

	/**
	 * Checks if a field is a relation (hasOne or hasMany)
	 */
	isRelation(entityType: string, fieldName: string): boolean {
		return this.getRelationType(entityType, fieldName) !== undefined
	}

	/**
	 * Checks if a field is a has-one relation
	 */
	isHasOne(entityType: string, fieldName: string): boolean {
		return this.getRelationType(entityType, fieldName) === 'hasOne'
	}

	/**
	 * Checks if a field is a has-many relation
	 */
	isHasMany(entityType: string, fieldName: string): boolean {
		return this.getRelationType(entityType, fieldName) === 'hasMany'
	}

	/**
	 * Checks if a field is a scalar (non-relation) field
	 */
	isScalar(entityType: string, fieldName: string): boolean {
		const fieldDef = this.getFieldDef(entityType, fieldName)
		return fieldDef?.type === 'scalar'
	}

	/**
	 * Gets the has-many relation kind ('oneHasMany' or 'manyHasMany').
	 * Returns undefined if the field is not a has-many relation or kind is not set.
	 */
	getHasManyRelationKind(entityType: string, fieldName: string): HasManyRelationDef['relationKind'] {
		const fieldDef = this.getFieldDef(entityType, fieldName)
		if (!fieldDef || fieldDef.type !== 'hasMany') return undefined
		return fieldDef.relationKind
	}

	/**
	 * Gets whether a relation's FK is nullable.
	 * Returns undefined if the field is not a relation or nullable is not set.
	 */
	getRelationNullable(entityType: string, fieldName: string): boolean | undefined {
		const fieldDef = this.getFieldDef(entityType, fieldName)
		if (!fieldDef) return undefined
		if (fieldDef.type === 'hasOne' || fieldDef.type === 'hasMany') {
			return fieldDef.nullable
		}
		return undefined
	}

	/**
	 * Gets the inverse field name for a relation.
	 * Returns undefined if no inverse is defined.
	 */
	getInverseField(entityType: string, fieldName: string): string | undefined {
		const fieldDef = this.getFieldDef(entityType, fieldName)
		if (!fieldDef) return undefined
		if (fieldDef.type === 'scalar') return undefined

		return (fieldDef as HasOneRelationDef | HasManyRelationDef).inverse
	}

	/**
	 * Gets all scalar field names for an entity
	 */
	getScalarFields(entityType: string): string[] {
		const entityDef = this.entityDefs.get(entityType)
		if (!entityDef) return []

		return Object.entries(entityDef.fields)
			.filter(([_, def]) => def.type === 'scalar')
			.map(([name]) => name)
	}

	/**
	 * Gets all relation field names for an entity
	 */
	getRelationFields(entityType: string): string[] {
		const entityDef = this.entityDefs.get(entityType)
		if (!entityDef) return []

		return Object.entries(entityDef.fields)
			.filter(([_, def]) => def.type === 'hasOne' || def.type === 'hasMany')
			.map(([name]) => name)
	}

	/**
	 * Gets all field names for an entity
	 */
	getAllFields(entityType: string): string[] {
		const entityDef = this.entityDefs.get(entityType)
		if (!entityDef) return []

		return Object.keys(entityDef.fields)
	}

	/**
	 * Validates that all relation targets exist in the schema.
	 * Throws an error if any target is missing.
	 */
	validate(): void {
		for (const [entityName, entityDef] of this.entityDefs) {
			for (const [fieldName, fieldDef] of Object.entries(entityDef.fields)) {
				if (fieldDef.type === 'hasOne' || fieldDef.type === 'hasMany') {
					if (!this.entityDefs.has(fieldDef.target)) {
						throw new Error(
							`Invalid schema: Entity "${entityName}" field "${fieldName}" references ` +
								`unknown entity "${fieldDef.target}"`,
						)
					}
				}
			}
		}
	}
}

/** Raw field format from Contember SchemaNames (column/one/many with entity). */
interface RawContemberFieldDef {
	readonly type: string
	readonly entity?: string
	readonly target?: string
	readonly inverse?: string
	readonly columnType?: string
	readonly enumName?: string
}

/**
 * Normalizes field definitions from Contember SchemaNames format
 * (column/one/many with entity) to bindx FieldDef format (scalar/hasOne/hasMany with target).
 */
function normalizeEntityDef(entityDef: EntitySchemaDef): EntitySchemaDef {
	const fields: Record<string, FieldDef> = {}
	let needsNormalization = false

	for (const [fieldName, fieldDef] of Object.entries(entityDef.fields)) {
		const raw = fieldDef as RawContemberFieldDef

		if (raw.type === 'column') {
			fields[fieldName] = { type: 'scalar', columnType: raw.columnType }
			needsNormalization = true
		} else if (raw.type === 'one') {
			fields[fieldName] = {
				type: 'hasOne',
				target: (raw.entity ?? raw.target)!,
				inverse: raw.inverse,
			}
			needsNormalization = true
		} else if (raw.type === 'many') {
			fields[fieldName] = {
				type: 'hasMany',
				target: (raw.entity ?? raw.target)!,
				inverse: raw.inverse,
			}
			needsNormalization = true
		} else {
			fields[fieldName] = fieldDef
		}
	}

	return needsNormalization ? { fields } : entityDef
}
