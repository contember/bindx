/**
 * Contember-specific utilities for bindx
 *
 * @packageDocumentation
 */

// Re-export unified MutationCollector from persistence
export { MutationCollector, type EntityMutationResult } from '../persistence/MutationCollector.js'
export { ContemberSchemaMutationAdapter, type SchemaNames } from '../persistence/ContemberSchemaMutationAdapter.js'
export type { MutationSchemaProvider } from '../persistence/MutationSchemaProvider.js'
