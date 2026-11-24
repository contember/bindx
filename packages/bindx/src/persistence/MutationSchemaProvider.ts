/**
 * Interface for schema providers used by MutationCollector.
 * Abstracts schema access to allow different schema implementations
 * (SchemaRegistry, Contember SchemaNames) to be used interchangeably.
 */
export interface MutationSchemaProvider {
	/**
	 * Gets all scalar (non-relation) field names for an entity.
	 */
	getScalarFields(entityType: string): readonly string[]

	/**
	 * Gets all relation field names for an entity.
	 */
	getRelationFields(entityType: string): readonly string[]

	/**
	 * Gets the relation type for a field.
	 * Returns undefined if the field is not a relation.
	 */
	getRelationType(entityType: string, fieldName: string): 'hasOne' | 'hasMany' | undefined

	/**
	 * Gets the target entity type for a relation field.
	 * Returns undefined if the field is not a relation.
	 */
	getRelationTarget(entityType: string, fieldName: string): string | undefined

	/**
	 * Gets the field on the target entity that is the other side of a relation.
	 * Returns undefined for a unidirectional relation or a non-relation field.
	 */
	getInverseField(entityType: string, fieldName: string): string | undefined

	/**
	 * Checks if an entity type exists in the schema.
	 */
	hasEntity(entityType: string): boolean
}
