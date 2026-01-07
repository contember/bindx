import { createContext, memo, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { GraphQlClient } from '@contember/graphql-client'
import type { SchemaNames } from '@contember/client-content'
import { ContemberAdapter, SnapshotStore, ActionDispatcher, PersistenceManager, MutationCollector } from '@contember/bindx'
import type { BindxContextValue } from './BackendAdapterContext.js'

/**
 * Props for ContemberBindxProvider
 */
export interface ContemberBindxProviderProps {
	/** Contember API base URL (e.g., 'https://api.example.com') */
	apiBaseUrl: string
	/** Project slug */
	project: string
	/** Stage slug (defaults to 'live') */
	stage?: string
	/** Session token for authentication */
	sessionToken?: string
	/** Contember schema names for query building */
	schema: SchemaNames
	/** Optional custom snapshot store (useful for testing) */
	store?: SnapshotStore
	/** Children */
	children: ReactNode
}

/**
 * Contember-specific context value
 */
export interface ContemberContextValue {
	apiBaseUrl: string
	project: string
	stage: string
	sessionToken: string | undefined
	setSessionToken: (token: string | undefined) => void
}

const ContemberContext = createContext<ContemberContextValue | null>(null)
const BindxContext = createContext<BindxContextValue | null>(null)

const SESSION_TOKEN_KEY = 'contember_session_token'

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
	apiBaseUrl,
	project,
	stage = 'live',
	sessionToken: propsSessionToken,
	schema,
	store: customStore,
	children,
}: ContemberBindxProviderProps) {
	// Manage session token with localStorage persistence
	const [localStorageToken, setLocalStorageTokenState] = useState(() => {
		if (typeof window === 'undefined') return undefined
		return localStorage.getItem(SESSION_TOKEN_KEY) ?? undefined
	})

	const setSessionToken = useCallback((token: string | undefined) => {
		if (typeof window !== 'undefined') {
			if (token !== undefined) {
				localStorage.setItem(SESSION_TOKEN_KEY, token)
			} else {
				localStorage.removeItem(SESSION_TOKEN_KEY)
			}
		}
		setLocalStorageTokenState(token)
	}, [])

	// Effective session token (props take precedence over localStorage)
	const sessionToken = propsSessionToken ?? localStorageToken

	// Create Contember context value
	const contemberValue = useMemo((): ContemberContextValue => ({
		apiBaseUrl,
		project,
		stage,
		sessionToken,
		setSessionToken,
	}), [apiBaseUrl, project, stage, sessionToken, setSessionToken])

	// Create GraphQL client and adapter
	const bindxValue = useMemo((): BindxContextValue => {
		const contentApiUrl = `${apiBaseUrl}/content/${project}/${stage}`

		const graphQlClient = new GraphQlClient({
			url: contentApiUrl,
			apiToken: sessionToken,
		})

		const adapter = new ContemberAdapter({
			client: graphQlClient,
			schema,
		})

		const store = customStore ?? new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)

		// Create mutation collector for proper nested operations
		const mutationCollector = new MutationCollector(store, schema)

		const persistence = new PersistenceManager(adapter, store, dispatcher, {
			mutationCollector,
		})

		return {
			adapter,
			store,
			dispatcher,
			persistence,
			schema: null,
			undoManager: null, // TODO: Add enableUndo support to ContemberBindxProvider
		}
	}, [apiBaseUrl, project, stage, sessionToken, schema, customStore])

	return (
		<ContemberContext.Provider value={contemberValue}>
			<BindxContext.Provider value={bindxValue}>
				{children}
			</BindxContext.Provider>
		</ContemberContext.Provider>
	)
})

/**
 * Hook to access Contember configuration and authentication.
 */
export function useContember(): ContemberContextValue {
	const context = useContext(ContemberContext)
	if (!context) {
		throw new Error('useContember must be used within a ContemberBindxProvider')
	}
	return context
}

/**
 * Hook to access bindx services from ContemberBindxProvider.
 */
export function useContemberBindxContext(): BindxContextValue {
	const context = useContext(BindxContext)
	if (!context) {
		throw new Error('useContemberBindxContext must be used within a ContemberBindxProvider')
	}
	return context
}

/**
 * Hook to access current session token.
 */
export function useContemberSessionToken(): string | undefined {
	return useContember().sessionToken
}

/**
 * Hook to set session token.
 */
export function useSetContemberSessionToken(): (token: string | undefined) => void {
	return useContember().setSessionToken
}

/**
 * Hook to access API base URL.
 */
export function useContemberApiBaseUrl(): string {
	return useContember().apiBaseUrl
}

/**
 * Hook to access current project slug.
 */
export function useContemberProject(): string {
	return useContember().project
}

/**
 * Hook to access current stage slug.
 */
export function useContemberStage(): string {
	return useContember().stage
}
