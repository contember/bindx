import { memo, useMemo, type ReactNode } from 'react'
import { GraphQlClient } from '@contember/graphql-client'
import { ContentClient, ContentQueryBuilder, type SchemaNames } from '@contember/client-content'
import { ContemberAdapter, SnapshotStore, ActionDispatcher, BatchPersister, MutationCollector } from '@contember/bindx'
import { BindxContext, type BindxContextValue } from './BackendAdapterContext.js'
import { QueryBatcher } from '../batching/QueryBatcher.js'

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
}

/**
 * Provider component that combines Contember authentication with bindx data binding.
 *
 * @example
 * ```tsx
 * import { ContemberBindxProvider } from '@contember/react-bindx'
 * import { schema } from './generated/schema'
 *
 * function App() {
 *   return (
 *     <ContemberBindxProvider
 *       apiBaseUrl="https://api.example.com"
 *       project="my-project"
 *       stage="live"
 *       schema={schema}
 *     >
 *       <ArticleEditor id="123" />
 *     </ContemberBindxProvider>
 *   )
 * }
 * ```
 */
export const ContemberBindxProvider = memo(function ContemberBindxProvider({
	schema,
	store: customStore,
	children,
	client: graphQlClient,
}: ContemberBindxProviderProps) {

	// Create GraphQL client and adapter
	const bindxValue = useMemo((): BindxContextValue => {

		const adapter = new ContemberAdapter(new ContentClient(graphQlClient), new ContentQueryBuilder(schema))
		const batcher = new QueryBatcher(adapter)

		const store = customStore ?? new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)

		// Create mutation collector for proper nested operations
		const mutationCollector = new MutationCollector(store, schema)

		const batchPersister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector,
		})

		return {
			adapter,
			batcher,
			store,
			dispatcher,
			batchPersister,
			schema: null,
			undoManager: null, // TODO: Add enableUndo support to ContemberBindxProvider
		}
	}, [schema, customStore])

	return (
		<BindxContext.Provider value={bindxValue}>
			{children}
		</BindxContext.Provider>
	)
})
