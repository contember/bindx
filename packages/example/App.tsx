import { type ReactNode } from 'react'
import { ContemberBindxProvider } from '@contember/bindx-react'
import { GraphQlClient } from '@contember/graphql-client'
import { schemaNames } from './generated/names.js'
import {
	ArticleEditor,
	ArticleView,
	AuthorListExample,
	TagListExample,
	ArticleWithAuthorSelectExample,
	LocationSelectExample,
	UndoDemo,
	RichTextEditorExample,
	BlockEditorExample,
	SimpleBlockEditorExample,
	DataGridExample,
} from './components/index.js'

const client = new GraphQlClient({
	url: `${import.meta.env['VITE_CONTEMBER_API_URL']}/content/example/live`,
	apiToken: import.meta.env['VITE_CONTEMBER_API_TOKEN'],
})

function AppProvider({ children }: { children: ReactNode }) {
	return (
		<ContemberBindxProvider client={client} schema={schemaNames} undoManager={true} debug={true}>
			{children}
		</ContemberBindxProvider>
	)
}

/**
 * Example application demonstrating bindx usage
 */
export function App() {
	return (
		<AppProvider>
			<div className="app" data-testid="app">
				<header>
					<h1>Bindx Demo</h1>
					<p>Examples of data binding patterns with fragments and entity lists</p>
				</header>

				<main>
					<section data-testid="section-datagrid">
						<h2>DataGrid</h2>
						<p>Data grid with filtering, sorting, and pagination.</p>
						<DataGridExample />
					</section>

					<hr />

					<section data-testid="section-undo">
						<h2>Undo/Redo Demo</h2>
						<p>Edit fields and use Undo/Redo. Changes are auto-grouped when typing rapidly.</p>
						<UndoDemo id="00000000-0000-0000-0000-000000000e01" />
					</section>

					<hr />

					<section data-testid="section-rich-text">
						<h2>Rich Text Editor</h2>
						<p>Inline rich text editing with bold, italic, and underline formatting.</p>
						<RichTextEditorExample id="00000000-0000-0000-0000-000000000e01" />
					</section>

					<section data-testid="section-block-editor">
						<h2>Block Editor (with references)</h2>
						<p>Structured block editor with embedded image references. Click "Insert Image" to add a block.</p>
						<BlockEditorExample id="00000000-0000-0000-0000-000000000e01" />
					</section>

					<section data-testid="section-simple-block">
						<h2>Block Editor (simple)</h2>
						<p>Simple block editor without references — just rich text paragraphs.</p>
						<SimpleBlockEditorExample id="00000000-0000-0000-0000-000000000e02" />
					</section>

					<hr />

					<section data-testid="section-article-editor">
						<h2>1. Article Editor (useEntity with Fragment Composition)</h2>
						<p>Full article editor using reusable fragments for author, location, and tags.</p>
						<ArticleEditor id="00000000-0000-0000-0000-000000000e01" />
					</section>

					<section data-testid="section-article-view">
						<h2>2. Article View (useEntity with Inline Fragment)</h2>
						<p>Simple read-only view using inline fragment definition.</p>
						<ArticleView id="00000000-0000-0000-0000-000000000e02" />
					</section>

					<hr />

					<section data-testid="section-author-list">
						<h2>3. Author List (useEntityList)</h2>
						<p>Display all authors from the database using useEntityList.</p>
						<AuthorListExample />
					</section>

					<section data-testid="section-tag-list">
						<h2>4. Tag List (useEntityList with Custom Rendering)</h2>
						<p>Tags displayed as colored badges.</p>
						<TagListExample />
					</section>

					<hr />

					<section data-testid="section-author-select">
						<h2>5. Article with Author Select</h2>
						<p>Combining useEntity for form data with useEntityList for select options.</p>
						<ArticleWithAuthorSelectExample id="00000000-0000-0000-0000-000000000e01" />
					</section>

					<section data-testid="section-location">
						<h2>6. Location Picker</h2>
						<p>Standalone location select using useEntityList.</p>
						<LocationSelectExample />
					</section>
				</main>

				<footer>
					<p>Connected to Contember API.</p>
				</footer>
			</div>
		</AppProvider>
	)
}
