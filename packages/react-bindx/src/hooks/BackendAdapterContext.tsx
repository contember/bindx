import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { BackendAdapter, MutationDataCollector, SchemaDefinition, UndoManagerConfig } from '@contember/bindx'
import { SnapshotStore } from '@contember/bindx'
import { ActionDispatcher } from '@contember/bindx'
import { PersistenceManager } from '@contember/bindx'
import { MockMutationCollector } from '@contember/bindx'
import { SchemaRegistry } from '@contember/bindx'
import { UndoManager } from '@contember/bindx'

/**
 * Context value containing all bindx services
 */
export interface BindxContextValue {
	/** Backend adapter for data fetching/persistence */
	adapter: BackendAdapter
	/** Immutable snapshot store */
	store: SnapshotStore
	/** Action dispatcher for mutations */
	dispatcher: ActionDispatcher
	/** Persistence manager with concurrency control */
	persistence: PersistenceManager
	/** Schema registry (set by createBindx) */
	schema: SchemaRegistry | null
	/** Undo manager (if enabled) */
	undoManager: UndoManager | null
}

const BindxContext = createContext<BindxContextValue | null>(null)

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
	children,
}: BindxProviderProps) {
	// Create services - memoized to maintain stable references
	const services = useMemo(() => {
		const store = customStore ?? new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)

		// Create undo manager if enabled
		const undoManager = enableUndo ? new UndoManager(store, undoConfig) : null
		if (undoManager) {
			dispatcher.addMiddleware(undoManager.createMiddleware())
		}

		// Create schema registry from definition if provided
		const schemaRegistry = schemaDefinition ? new SchemaRegistry(schemaDefinition) : null

		// Create mutation collector - use custom, or auto-create from schema
		const mutationCollector =
			customMutationCollector ?? (schemaRegistry ? new MockMutationCollector(store, schemaRegistry) : undefined)

		const persistence = new PersistenceManager(adapter, store, dispatcher, {
			mutationCollector,
			undoManager: undoManager ?? undefined,
		})

		return {
			adapter,
			store,
			dispatcher,
			persistence,
			schema: schemaRegistry,
			undoManager,
		}
	}, [adapter, customStore, schemaDefinition, customMutationCollector, enableUndo, undoConfig])

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
 * Hook to access the persistence manager.
 * Must be used within a BindxProvider.
 */
export function usePersistence(): PersistenceManager {
	const context = useContext(BindxContext)
	if (!context) {
		throw new Error('usePersistence must be used within a BindxProvider')
	}
	return context.persistence
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

// Legacy export for backward compatibility during migration
export { SnapshotStore as IdentityMap } from '@contember/bindx'
export function useIdentityMap(): SnapshotStore {
	return useSnapshotStore()
}
