import { type ReactNode, useState, useEffect } from 'react'
import { ContemberBindxProvider } from '@contember/bindx-react'
import { GraphQlClient } from '@contember/graphql-client'
import { UploaderClientContext, S3UploadClient, createContentApiS3Signer } from '@contember/bindx-uploader'
import { schemaNames } from './generated/names.js'
import { DataGridPage } from './pages/datagrid.js'
import { HasManyDataGridPage } from './pages/hasmany-datagrid.js'
import { ArticleViewPage } from './pages/article-view.js'
import { EntityListsPage } from './pages/entity-lists.js'
import { ArticleEditorPage } from './pages/article-editor.js'
import { AuthorSelectPage } from './pages/author-select.js'
import { LocationPickerPage } from './pages/location-picker.js'
import { EditorsPage } from './pages/editors.js'
import { BlockRepeaterPage } from './pages/block-repeater.js'
import { UndoPage } from './pages/undo.js'
import { JsxShowcaseFullPage } from './pages/jsx-showcase.js'
import { ComponentsPage } from './pages/components.js'

const client = new GraphQlClient({
	url: `${import.meta.env['VITE_CONTEMBER_API_URL']}/content/example/live`,
	apiToken: import.meta.env['VITE_CONTEMBER_API_TOKEN'],
})

const s3Client = new S3UploadClient({
	signUrl: createContentApiS3Signer(client),
})

function AppProvider({ children }: { children: ReactNode }): ReactNode {
	return (
		<ContemberBindxProvider client={client} schema={schemaNames} undoManager={true} debug={true}>
			<UploaderClientContext value={s3Client}>
				{children}
			</UploaderClientContext>
		</ContemberBindxProvider>
	)
}

// ============================================================================
// Pages
// ============================================================================

const pages: Record<string, { title: string; description: string; content: ReactNode }> = {
	'jsx-showcase': {
		title: 'JSX Showcase',
		description: 'Entity, Field, HasMany, HasOne, If, Show — all JSX components in action.',
		content: <JsxShowcaseFullPage authorId="00000000-0000-0000-0000-000000000a01" articleId="00000000-0000-0000-0000-000000000e01" />,
	},
	components: {
		title: 'createComponent Patterns',
		description: 'Reusable fragment components with createComponent, explicit vs implicit selection, mergeFragments.',
		content: <ComponentsPage authorId="00000000-0000-0000-0000-000000000a01" articleId="00000000-0000-0000-0000-000000000e01" />,
	},
	datagrid: {
		title: 'DataGrid',
		description: 'Data grid with filtering, sorting, and pagination.',
		content: <DataGridPage />,
	},
	'article-editor': {
		title: 'Article Editor',
		description: 'Full article editor with Entity JSX, SelectField, MultiSelectField, and persistence.',
		content: <ArticleEditorPage id="00000000-0000-0000-0000-000000000e01" />,
	},
	'article-view': {
		title: 'Article View',
		description: 'Simple read-only view using Entity JSX with implicit selection.',
		content: <ArticleViewPage id="00000000-0000-0000-0000-000000000e02" />,
	},
	'entity-lists': {
		title: 'Entity Lists',
		description: 'Display entities using EntityList JSX component.',
		content: <EntityListsPage articleId="00000000-0000-0000-0000-000000000e02" />,
	},
	'author-select': {
		title: 'Article with Author Select',
		description: 'Entity JSX with SelectField for relation editing.',
		content: <AuthorSelectPage id="00000000-0000-0000-0000-000000000e01" />,
	},
	'location-picker': {
		title: 'Location Picker',
		description: 'EntityList with local state for selection.',
		content: <LocationPickerPage />,
	},
	editors: {
		title: 'Rich Text & Block Editors',
		description: 'Rich text editing with formatting and structured block editors.',
		content: <EditorsPage id1="00000000-0000-0000-0000-000000000e01" id2="00000000-0000-0000-0000-000000000e02" />,
	},
	undo: {
		title: 'Undo/Redo Demo',
		description: 'Edit fields and use Undo/Redo. Changes are auto-grouped when typing rapidly.',
		content: <UndoPage id="00000000-0000-0000-0000-000000000e01" />,
	},
	'block-repeater': {
		title: 'Block Repeater',
		description: 'Repeater with type discrimination — each block renders differently based on its type.',
		content: <BlockRepeaterPage id="00000000-0000-0000-0000-000000000e01" />,
	},
	'hasmany-datagrid': {
		title: 'HasMany DataGrid',
		description: 'Data grid for a has-many relation field (Author → Articles).',
		content: <HasManyDataGridPage id="00000000-0000-0000-0000-000000000a01" />,
	},
}

// ============================================================================
// Router
// ============================================================================

function useHashRoute(): string {
	const [hash, setHash] = useState(() => window.location.hash.slice(1) || '')
	useEffect(() => {
		const handler = (): void => setHash(window.location.hash.slice(1) || '')
		window.addEventListener('hashchange', handler)
		return () => window.removeEventListener('hashchange', handler)
	}, [])
	return hash
}

/**
 * Example application demonstrating bindx usage
 */
export function App(): ReactNode {
	const route = useHashRoute()
	const page = pages[route]

	return (
		<AppProvider>
			<div className="app" data-testid="app">
				<header>
					<h1><a href="#" className="no-underline text-inherit">Bindx Demo</a></h1>
					<p>Examples of data binding patterns with JSX components and createComponent</p>
				</header>

				{page ? (
					<main>
						<nav className="mb-4">
							<a href="#" className="text-sm text-gray-500 hover:text-gray-700">← Back to index</a>
						</nav>
						<section data-testid={`section-${route}`}>
							<h2>{page.title}</h2>
							<p>{page.description}</p>
							{page.content}
						</section>
					</main>
				) : (
					<main>
						<nav className="flex flex-col gap-1">
							{Object.entries(pages).map(([key, { title, description }]) => (
								<a
									key={key}
									href={`#${key}`}
									className="block p-3 rounded-lg border hover:bg-gray-50 transition-colors no-underline"
									data-testid={`nav-${key}`}
								>
									<div className="font-medium">{title}</div>
									<div className="text-sm text-gray-500">{description}</div>
								</a>
							))}
						</nav>
					</main>
				)}

				<footer>
					<p>Connected to Contember API.</p>
				</footer>
			</div>
		</AppProvider>
	)
}
