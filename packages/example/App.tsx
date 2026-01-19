import { BindxProvider, MockAdapter } from '@contember/bindx-react'
import { mockData } from './mockData.js'
import {
	ArticleEditor,
	ArticleView,
	AuthorListExample,
	TagListExample,
	ArticleWithAuthorSelectExample,
	LocationSelectExample,
	UndoDemo,
} from './components/index.js'

// Create mock adapter with sample data
const adapter = new MockAdapter(mockData, { debug: true, delay: 200 })

/**
 * Example application demonstrating bindx usage
 */
export function App() {
	return (
		<BindxProvider adapter={adapter} enableUndo={true}>
			<div className="app">
				<header>
					<h1>Bindx Demo</h1>
					<p>Examples of data binding patterns with fragments and entity lists</p>
				</header>

				<main>
					{/* Undo/Redo Demo */}
					<section>
						<h2>🔄 Undo/Redo Demo</h2>
						<p>Edit fields and use Undo/Redo. Changes are auto-grouped when typing rapidly.</p>
						<UndoDemo id="article-1" />
					</section>

					<hr />

					{/* Basic useEntity examples */}
					<section>
						<h2>1. Article Editor (useEntity with Fragment Composition)</h2>
						<p>Full article editor using reusable fragments for author, location, and tags.</p>
						<ArticleEditor id="article-1" />
					</section>

					<section>
						<h2>2. Article View (useEntity with Inline Fragment)</h2>
						<p>Simple read-only view using inline fragment definition.</p>
						<ArticleView id="article-2" />
					</section>

					<hr />

					{/* useEntityList examples */}
					<section>
						<h2>3. Author List (useEntityList)</h2>
						<p>Display all authors from the database using useEntityList.</p>
						<AuthorListExample />
					</section>

					<section>
						<h2>4. Tag List (useEntityList with Custom Rendering)</h2>
						<p>Tags displayed as colored badges.</p>
						<TagListExample />
					</section>

					<hr />

					{/* Combined examples */}
					<section>
						<h2>5. Article with Author Select</h2>
						<p>Combining useEntity for form data with useEntityList for select options.</p>
						<ArticleWithAuthorSelectExample id="article-1" />
					</section>

					<section>
						<h2>6. Location Picker</h2>
						<p>Standalone location select using useEntityList.</p>
						<LocationSelectExample />
					</section>
				</main>

				<footer>
					<p>Open browser console to see MockAdapter debug logs.</p>
				</footer>
			</div>
		</BindxProvider>
	)
}
