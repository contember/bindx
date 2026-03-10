import { memo, useMemo, type ReactNode } from 'react'
import { GraphQlClient } from '@contember/graphql-client'
import { ContentClient, ContentQueryBuilder, type SchemaNames } from '@contember/client-content'
import { ContemberAdapter, SnapshotStore, ActionDispatcher, BatchPersister, MutationCollector, ContemberSchemaMutationAdapter, UndoManager, SchemaRegistry, type SchemaDefinition, type UndoManagerConfig, type UpdateMode } from '@contember/bindx'
import { BindxContext, type BindxContextValue } from './BackendAdapterContext.js'
import { QueryBatcher } from '../batching/QueryBatcher.js'

/**
 * Converts SchemaNames (Contember format) to SchemaDefinition (bindx format)
 * so that a SchemaRegistry can be created for standalone hooks.
 */
function schemaNamesToDef(schemaNames: SchemaNames): SchemaDefinition<Record<string, object>> {
	const entities: Record<string, { fields: Record<string, { type: 'scalar' } | { type: 'hasOne'; target: string } | { type: 'hasMany'; target: string }> }> = {}
	for (const [entityName, entity] of Object.entries(schemaNames.entities)) {
		const fields: Record<string, { type: 'scalar' } | { type: 'hasOne'; target: string } | { type: 'hasMany'; target: string }> = {}
		for (const [fieldName, fieldDef] of Object.entries(entity.fields)) {
			if (fieldDef.type === 'column') {
				fields[fieldName] = { type: 'scalar' }
			} else if (fieldDef.type === 'one') {
				fields[fieldName] = { type: 'hasOne', target: fieldDef.entity }
			} else if (fieldDef.type === 'many') {
				fields[fieldName] = { type: 'hasMany', target: fieldDef.entity }
			}
		}
		entities[entityName] = { fields }
	}
	return { entities }
}

/**
 * Props for ContemberBindxProvider
 */
export interface ContemberBindxProviderProps {
	/** Contember schema names for query building */
	schema: SchemaNames
	/** Optional custom snapshot store (useful for testing) */
	store?: SnapshotStore
	/** Children */
	children: ReactNode

	client: GraphQlClient

	/** Enable undo/redo functionality. Pass true to auto-create an UndoManager, or pass an UndoManager instance. */
	undoManager?: UndoManager | boolean
	/** Configuration for auto-created undo manager (only used when undoManager={true}) */
	undoConfig?: UndoManagerConfig
	/**
	 * Default update mode for persistence operations.
	 * - 'optimistic': Update UI immediately, revert on failure (default)
	 * - 'pessimistic': Wait for server confirmation before updating UI
	 */
	defaultUpdateMode?: UpdateMode
	/** Enable debug logging (e.g., selection collection output) */
	debug?: boolean
}

/**
 * Provider component that combines Contember authentication with bindx data binding.
 *
 * @example
 * ```tsx
 * import { ContemberBindxProvider, useUndo } from '@contember/bindx-react'
 * import { schema } from './generated/schema'
 *
 * function App() {
 *   return (
 *     <ContemberBindxProvider
 *       client={graphQlClient}
 *       schema={schema}
 *       undoManager={true}
 *     >
 *       <ArticleEditor id="123" />
 *     </ContemberBindxProvider>
 *   )
 * }
 *
 * // Access undo/redo in child components
 * function UndoControls() {
 *   const { canUndo, canRedo, undo, redo } = useUndo()
 *   return (
 *     <div>
 *       <button onClick={undo} disabled={!canUndo}>Undo</button>
 *       <button onClick={redo} disabled={!canRedo}>Redo</button>
 *     </div>
 *   )
 * }
 * ```
 */
export const ContemberBindxProvider = memo(function ContemberBindxProvider({
	schema,
	store: customStore,
	children,
	client: graphQlClient,
	undoManager: undoManagerProp,
	undoConfig,
	defaultUpdateMode,
	debug = false,
}: ContemberBindxProviderProps) {

	// Create GraphQL client and adapter
	const bindxValue = useMemo((): BindxContextValue => {

		const adapter = new ContemberAdapter(new ContentClient(graphQlClient), new ContentQueryBuilder(schema))
		const batcher = new QueryBatcher(adapter)

		const store = customStore ?? new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)

		// Create undo manager if enabled
		const undoManager = undoManagerProp === true
			? new UndoManager(store, undoConfig)
			: undoManagerProp instanceof UndoManager
				? undoManagerProp
				: null
		if (undoManager) {
			dispatcher.addMiddleware(undoManager.createMiddleware())
		}

		// Create schema registry from SchemaNames for standalone hooks
		const schemaRegistry = new SchemaRegistry(schemaNamesToDef(schema))

		// Create mutation collector for proper nested operations
		// Use ContemberSchemaMutationAdapter to wrap SchemaNames
		const schemaAdapter = new ContemberSchemaMutationAdapter(schema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)

		const batchPersister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector,
			undoManager: undoManager ?? undefined,
			defaultUpdateMode,
		})

		return {
			adapter,
			batcher,
			store,
			dispatcher,
			batchPersister,
			schema: schemaRegistry,
			undoManager,
			debug,
		}
	}, [schema, customStore, undoManagerProp, undoConfig, defaultUpdateMode, debug])

	return (
		<BindxContext.Provider value={bindxValue}>
			{children}
		</BindxContext.Provider>
	)
})
