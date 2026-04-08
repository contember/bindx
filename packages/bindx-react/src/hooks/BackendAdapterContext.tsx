import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { BackendAdapter, MutationDataCollector, SchemaDefinition, UndoManagerConfig, UpdateMode } from '@contember/bindx'
import { SnapshotStore } from '@contember/bindx'
import { ActionDispatcher } from '@contember/bindx'
import { BatchPersister } from '@contember/bindx'
import { MutationCollector } from '@contember/bindx'
import { SchemaRegistry } from '@contember/bindx'
import { UndoManager } from '@contember/bindx'
import { NotificationStore } from '@contember/bindx'
import { QueryBatcher } from '../batching/QueryBatcher.js'

/**
 * Minimal GraphQL client interface exposed through bindx context.
 * Avoids coupling to concrete GraphQlClient class across package boundaries.
 */
export interface BindxGraphQlClient {
	execute<T = unknown>(query: string, options?: { variables?: Record<string, unknown> }): Promise<T>
}

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
	/** Schema registry for entity metadata */
	schema: SchemaRegistry
	/** Undo manager (if enabled) */
	undoManager: UndoManager | null
	/** GraphQL client (available when using ContemberBindxProvider) */
	graphQlClient: BindxGraphQlClient | null
	/** Notification store for user-facing feedback (toasts) */
	notificationStore: NotificationStore
	/** Whether debug logging is enabled */
	debug: boolean
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
	/** Schema definition for entity metadata and mutation collection */
	schema: SchemaDefinition<Record<string, object>>
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
	/** Enable debug logging (e.g., selection collection output) */
	debug?: boolean
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
 *     <BindxProvider adapter={adapter} schema={testSchema}>
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
	debug = false,
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

		// Create schema registry from definition
		const schemaRegistry = new SchemaRegistry(schemaDefinition)

		// Create mutation collector - use custom, or auto-create from schema
		// SchemaRegistry implements MutationSchemaProvider interface
		const mutationCollector =
			customMutationCollector ?? new MutationCollector(store, schemaRegistry)

		const batchPersister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector,
			undoManager: undoManager ?? undefined,
			schema: schemaRegistry,
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
			graphQlClient: null,
			notificationStore: new NotificationStore(),
			debug,
		}
	}, [adapter, customStore, schemaDefinition, customMutationCollector, enableUndo, undoConfig, defaultUpdateMode, debug])

	return <BindxContext.Provider value={services}>{children}</BindxContext.Provider>
}

/**
 * Hook to access the schema registry.
 * Must be used within a BindxProvider or ContemberBindxProvider.
 */
export function useSchemaRegistry(): SchemaRegistry {
	const context = useContext(BindxContext)
	if (!context) {
		throw new Error('useSchemaRegistry must be used within a BindxProvider')
	}
	return context.schema
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

/**
 * Hook to access the notification store.
 * Must be used within a BindxProvider.
 */
export function useNotificationStore(): NotificationStore {
	const context = useContext(BindxContext)
	if (!context) {
		throw new Error('useNotificationStore must be used within a BindxProvider')
	}
	return context.notificationStore
}
