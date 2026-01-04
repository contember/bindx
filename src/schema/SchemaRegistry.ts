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
			this.entityDefs.set(entityName, entityDef as EntitySchemaDef)
		}
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
