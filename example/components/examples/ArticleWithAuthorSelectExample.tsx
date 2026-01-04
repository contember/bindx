import { useEntity, useEntityList } from '../../bindx.js'
import { TextInput } from '../inputs/index.js'

/**
 * Example: Article form with author select
 * Demonstrates combining useEntity for the main form with useEntityList for select options.
 *
 * With the new API, relations are accessed via data and edited via setValue on field handles.
 */
export function ArticleWithAuthorSelectExample({ id }: { id: string }) {
	// Load the article
	const article = useEntity('Article', { id }, e =>
		e
			.id()
			.title()
			.content()
			.author(a => a.id().name().email()),
	)

	// Load all authors for the select dropdown
	const authors = useEntityList('Author', {}, e => e.id().name().email())

	if (article.isLoading) {
		return <div>Loading article...</div>
	}

	if (article.isError) {
		return <div>Error: {article.error.message}</div>
	}

	const handleAuthorChange = (newAuthorId: string) => {
		if (newAuthorId === '') {
			// Disconnect the relation
			article.fields.author.disconnect()
		} else {
			// Connect to the selected author
			article.fields.author.connect(newAuthorId)
		}
	}

	const currentAuthorId = article.data.author?.id ?? ''

	return (
		<div className="article-with-select">
			<h3>Edit Article (with Author Select)</h3>

			<TextInput field={article.fields.title} label="Title" />
			<TextInput field={article.fields.content} label="Content" />

			<div className="field">
				<label>Author</label>
				{authors.isLoading ? (
					<select disabled>
						<option>Loading authors...</option>
					</select>
				) : authors.isError ? (
					<div>Error loading authors</div>
				) : (
					<select
						value={currentAuthorId}
						onChange={e => handleAuthorChange(e.target.value)}
					>
						<option value="">No author</option>
						{authors.items.map(item => (
							<option key={item.key} value={item.id}>
								{item.data.name} ({item.data.email})
							</option>
						))}
					</select>
				)}
			</div>

			<div className="current-author">
				{article.data.author ? (
					<p>
						<strong>Current author:</strong> {article.data.author.name} ({article.data.author.email})
					</p>
				) : (
					<p>
						<strong>Author:</strong> None
					</p>
				)}
				{article.isDirty && (
					<p className="warning">Changes will be applied on save</p>
				)}
			</div>

			<div className="actions">
				<button onClick={() => article.persist()} disabled={!article.isDirty || article.isPersisting}>
					{article.isPersisting ? 'Saving...' : 'Save'}
				</button>
				<button onClick={() => article.reset()} disabled={!article.isDirty}>
					Reset
				</button>
			</div>
		</div>
	)
}
