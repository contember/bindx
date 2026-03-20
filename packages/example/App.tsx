import { type ReactNode } from 'react'
import { ContemberBindxProvider } from '@contember/bindx-react'
import { GraphQlClient } from '@contember/graphql-client'
import { UploaderClientContext, S3UploadClient, createContentApiS3Signer } from '@contember/bindx-uploader'
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
	HasManyDataGridExample,
	HeadlessBlockRepeaterExample,
	StyledBlockRepeaterExample,
	DualModeBlockRepeaterExample,
} from './components/index.js'

const client = new GraphQlClient({
	url: `${import.meta.env['VITE_CONTEMBER_API_URL']}/content/example/live`,
	apiToken: import.meta.env['VITE_CONTEMBER_API_TOKEN'],
})

const s3Client = new S3UploadClient({
	// Cast needed: root and bindx-uploader may resolve @contember/graphql-client separately
	signUrl: createContentApiS3Signer(client as unknown as Parameters<typeof createContentApiS3Signer>[0]),
})

function AppProvider({ children }: { children: ReactNode }) {
	return (
		<ContemberBindxProvider client={client} schema={schemaNames} undoManager={true} debug={true}>
			<UploaderClientContext value={s3Client}>
				{children}
			</UploaderClientContext>
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
						<p>Structured block editor with image, quote, embed, and callout blocks. Selection auto-collected from JSX via staticRender.</p>
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

					<hr />

					<section data-testid="section-block-repeater">
						<h2>7. Block Repeater</h2>
						<p>Repeater with type discrimination — each block renders differently based on its type.</p>
						<HeadlessBlockRepeaterExample id="00000000-0000-0000-0000-000000000e01" />
						<hr className="my-4" />
						<StyledBlockRepeaterExample id="00000000-0000-0000-0000-000000000e01" />
						<hr className="my-4" />
						<DualModeBlockRepeaterExample id="00000000-0000-0000-0000-000000000e01" />
					</section>

					<hr />

					<section data-testid="section-hasmany-datagrid">
						<h2>8. HasMany DataGrid</h2>
						<p>Data grid for a has-many relation field (Author → Articles).</p>
						<HasManyDataGridExample id="00000000-0000-0000-0000-000000000a01" />
					</section>
				</main>

				<footer>
					<p>Connected to Contember API.</p>
				</footer>
			</div>
		</AppProvider>
	)
}
