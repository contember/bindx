import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { BackendAdapter, MutationDataCollector, SchemaDefinition, UndoManagerConfig, UpdateMode } from '@contember/bindx'
import { SnapshotStore } from '@contember/bindx'
import { ActionDispatcher } from '@contember/bindx'
import { BatchPersister } from '@contember/bindx'
import { MutationCollector } from '@contember/bindx'
import { SchemaRegistry } from '@contember/bindx'
import { UndoManager } from '@contember/bindx'
import { QueryBatcher } from '../batching/QueryBatcher.js'

/**
 * Context value containing all bindx services
 */
export interface BindxContextValue {
	/** Backend adapter for data fetching/persistence */
	adapter: BackendAdapter
	/** Query batcher for combining multiple queries into single requests */
	batcher: QueryBatcher
	/** Immutable snapshot store */
	store: SnapshotStore
	/** Action dispatcher for mutations */
	dispatcher: ActionDispatcher
	/** Batch persister for multi-entity persistence */
	batchPersister: BatchPersister
	/** Schema registry (set by createBindx) */
	schema: SchemaRegistry | null
	/** Undo manager (if enabled) */
	undoManager: UndoManager | null
}

export const BindxContext = createContext<BindxContextValue | null>(null)

/**
 * Props for BindxProvider
 */
export interface BindxProviderProps {
	/** The backend adapter to use for data fetching/persistence */
	adapter: BackendAdapter
	/** Optional custom snapshot store (useful for testing) */
	store?: SnapshotStore
	/** Optional schema definition for mutation collection (enables relation persistence) */
	schema?: SchemaDefinition<Record<string, object>>
	/** Optional custom mutation collector (overrides default behavior) */
	mutationCollector?: MutationDataCollector
	/** Enable undo/redo functionality */
	enableUndo?: boolean
	/** Configuration for undo manager */
	undoConfig?: UndoManagerConfig
	/**
	 * Default update mode for persistence operations.
	 * - 'optimistic': Update UI immediately, revert on failure (default)
	 * - 'pessimistic': Wait for server confirmation before updating UI
	 */
	defaultUpdateMode?: UpdateMode
	children: ReactNode
}

/**
 * Provider component that supplies the bindx services
 * to all child components using bindx hooks.
 *
 * @example
 * ```tsx
 * const adapter = new MockAdapter(initialData)
 *
 * function App() {
 *   return (
 *     <BindxProvider adapter={adapter}>
 *       <ArticleEditor id="123" />
 *     </BindxProvider>
 *   )
 * }
 * ```
 */
export function BindxProvider({
	adapter,
	store: customStore,
	schema: schemaDefinition,
	mutationCollector: customMutationCollector,
	enableUndo = false,
	undoConfig,
	defaultUpdateMode,
	children,
}: BindxProviderProps) {
	// Create services - memoized to maintain stable references
	const services = useMemo(() => {
		const store = customStore ?? new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const batcher = new QueryBatcher(adapter)

		// Create undo manager if enabled
		const undoManager = enableUndo ? new UndoManager(store, undoConfig) : null
		if (undoManager) {
			dispatcher.addMiddleware(undoManager.createMiddleware())
		}

		// Create schema registry from definition if provided
		const schemaRegistry = schemaDefinition ? new SchemaRegistry(schemaDefinition) : null

		// Create mutation collector - use custom, or auto-create from schema
		// SchemaRegistry implements MutationSchemaProvider interface
		const mutationCollector =
			customMutationCollector ?? (schemaRegistry ? new MutationCollector(store, schemaRegistry) : undefined)

		const batchPersister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector,
			undoManager: undoManager ?? undefined,
			schema: schemaRegistry ?? undefined,
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
		}
	}, [adapter, customStore, schemaDefinition, customMutationCollector, enableUndo, undoConfig, defaultUpdateMode])

	return <BindxContext.Provider value={services}>{children}</BindxContext.Provider>
}

/**
 * Hook to access the backend adapter.
 * Must be used within a BindxProvider.
 */
export function useBackendAdapter(): BackendAdapter {
	const context = useContext(BindxContext)
	if (!context) {
		throw new Error('useBackendAdapter must be used within a BindxProvider')
	}
	return context.adapter
}

/**
 * Hook to access the snapshot store.
 * Must be used within a BindxProvider.
 */
export function useSnapshotStore(): SnapshotStore {
	const context = useContext(BindxContext)
	if (!context) {
		throw new Error('useSnapshotStore must be used within a BindxProvider')
	}
	return context.store
}

/**
 * Hook to access the action dispatcher.
 * Must be used within a BindxProvider.
 */
export function useDispatcher(): ActionDispatcher {
	const context = useContext(BindxContext)
	if (!context) {
		throw new Error('useDispatcher must be used within a BindxProvider')
	}
	return context.dispatcher
}

/**
 * Hook to access the batch persister.
 * Must be used within a BindxProvider.
 */
export function useBatchPersister(): BatchPersister {
	const context = useContext(BindxContext)
	if (!context) {
		throw new Error('useBatchPersister must be used within a BindxProvider')
	}
	return context.batchPersister
}

/**
 * Hook to access all bindx services.
 * Must be used within a BindxProvider.
 */
export function useBindxContext(): BindxContextValue {
	const context = useContext(BindxContext)
	if (!context) {
		throw new Error('useBindxContext must be used within a BindxProvider')
	}
	return context
}

/**
 * Hook to access the query batcher.
 * Must be used within a BindxProvider.
 */
export function useQueryBatcher(): QueryBatcher {
	const context = useContext(BindxContext)
	if (!context) {
		throw new Error('useQueryBatcher must be used within a BindxProvider')
	}
	return context.batcher
}

