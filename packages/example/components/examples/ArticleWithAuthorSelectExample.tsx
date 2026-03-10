import { useEntity, useEntityList } from '@contember/bindx-react'
import { schema } from '../../generated/index.js'
import { TextInput } from '../inputs/index.js'

/**
 * Example: Article form with author select
 * Demonstrates combining useEntity for the main form with useEntityList for select options.
 *
 * With the new API, relations are accessed via data and edited via setValue on field handles.
 */
export function ArticleWithAuthorSelectExample({ id }: { id: string }) {
	// Load the article
	const article = useEntity(schema.Article, { by: { id } }, e =>
		e
			.id()
			.title()
			.content()
			.author(a => a.id().name().email()),
	)

	// Load all authors for the select dropdown
	const authors = useEntityList(schema.Author, {}, e => e.id().name().email())

	if (article.isLoading) {
		return <div>Loading article...</div>
	}

	if (article.isError) {
		return <div>Error: {article.error.message}</div>
	}

	const handleAuthorChange = (newAuthorId: string) => {
		if (newAuthorId === '') {
			// Disconnect the relation
			article.fields.author.$disconnect()
		} else {
			// Connect to the selected author
			article.fields.author.$connect(newAuthorId)
		}
	}

	// Use fields.author.$id for reactive value (tracks local changes)
	const currentAuthorId = article.fields.author.$id ?? ''
	// Get author entity for display (reactive to connect/disconnect)
	const authorEntity = article.fields.author.$entity

	return (
		<div className="article-with-select" data-testid="article-with-author-select">
			<h3>Edit Article (with Author Select)</h3>

			<TextInput field={article.fields.title} label="Title" testId="author-select-title-input" />
			<TextInput field={article.fields.content} label="Content" testId="author-select-content-input" />

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
						data-testid="author-select-dropdown"
					>
						<option value="">No author</option>
						{authors.items.map(item => (
							<option key={item.id} value={item.id}>
								{item.$data?.name} ({item.$data?.email})
							</option>
						))}
					</select>
				)}
			</div>

			<div className="current-author" data-testid="current-author-display">
				{currentAuthorId ? (
					<p>
						<strong>Current author:</strong> {authorEntity.$fields.name.value} ({authorEntity.$fields.email.value})
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
				<button onClick={() => article.persist()} disabled={!article.isDirty || article.isPersisting} data-testid="author-select-save-button">
					{article.isPersisting ? 'Saving...' : 'Save'}
				</button>
				<button onClick={() => article.reset()} disabled={!article.isDirty} data-testid="author-select-reset-button">
					Reset
				</button>
			</div>
		</div>
	)
}
