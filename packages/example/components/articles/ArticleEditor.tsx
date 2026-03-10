import { useEntity, useEntityList } from '@contember/bindx-react'
import { schema } from '../../generated/index.js'
import { AuthorEditor } from '../editors/AuthorEditor.js'
import { TextInput } from '../inputs/index.js'

/**
 * Full article editor - demonstrates useEntity with the new API
 */
export function ArticleEditor({ id }: { id: string }) {
	const article = useEntity(schema.Article, { by: { id } }, e =>
		e
			.id()
			.title()
			.content()
			.author(a => a.id().name().email().bio())
			.location(l => l.id().label().lat().lng())
			.tags(t => t.id().name().color()),
	)

	// Load all available tags for the "add tag" dropdown
	const allTags = useEntityList(schema.Tag, {}, t => t.id().name().color())

	// Load all available authors for the "change author" dropdown
	const allAuthors = useEntityList(schema.Author, {}, a => a.id().name().email())

	if (article.isLoading) {
		return <div>Loading article...</div>
	}

	if (article.isError) {
		return <div>Error: {article.error.message}</div>
	}

	// Get current tag IDs for filtering available tags
	const tagItems = article.fields.tags?.items ?? []
	const currentTagIds = new Set(tagItems.map(t => t.id))

	// Filter available tags (those not already on the article)
	const availableTags = allTags.isLoading || allTags.isError
		? []
		: allTags.items.filter(tag => !currentTagIds.has(tag.id))
		.map(tag => ({ id: tag.id, data: tag.$data! }))

	return (
		<div className="article-editor" data-testid="article-editor">
			<h1>Edit Article</h1>

			<div className="form-section">
				<TextInput field={article.fields.title} label="Title" testId="article-title-input" />
				<TextInput field={article.fields.content} label="Content" testId="article-content-input" />
			</div>

			<div className="form-section">
				<h3>Author</h3>
				{!allAuthors.isLoading && !allAuthors.isError && (
					<div style={{ marginBottom: '12px' }}>
						<label>Select author: </label>
						<select
							value={article.fields.author.$id ?? ''}
							onChange={e => {
								if (e.target.value) {
									article.fields.author.$connect(e.target.value)
								}
							}}
							data-testid="article-author-select"
						>
							<option value="">Select an author...</option>
							{allAuthors.items.map(author => (
								<option key={author.id} value={author.id}>
									{author.$fields.name.value}
								</option>
							))}
						</select>
					</div>
				)}
				{article.fields.author.$fields && (
					<AuthorEditor author={article.fields.author.$fields} />
				)}
			</div>

			<div className="form-section" data-testid="article-location">
				<h3>Location</h3>
				<p>Label: {article.data.location?.label ?? 'N/A'}</p>
				<p>
					Coordinates: {article.data.location?.lat ?? 'N/A'},{' '}
					{article.data.location?.lng ?? 'N/A'}
				</p>
			</div>

			<div className="form-section" data-testid="article-tags">
				<h3>Tags ({tagItems.length})</h3>
				<ul style={{ listStyle: 'none', padding: 0 }}>
					{tagItems.map(tag => (
						<li key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
							<span
								data-testid={`tag-badge-${tag.$fields.name.value}`}
								style={{
									backgroundColor: tag.$fields.color.value ?? '#ccc',
									color: 'white',
									padding: '2px 8px',
									borderRadius: '4px',
								}}
							>
								{tag.$fields.name.value}
							</span>
							<button
								onClick={() => article.fields.tags.disconnect(tag.id)}
								style={{ padding: '2px 6px', cursor: 'pointer' }}
								data-testid={`remove-tag-${tag.$fields.name.value}`}
							>
								×
							</button>
						</li>
					))}
				</ul>

				{availableTags.length > 0 && (
					<div style={{ marginTop: '8px' }}>
						<label>Add tag: </label>
						<select
							onChange={e => {
								if (e.target.value) {
									article.fields.tags.connect(e.target.value)
									e.target.value = ''
								}
							}}
							defaultValue=""
							data-testid="article-add-tag-select"
						>
							<option value="">Select a tag...</option>
							{availableTags.map(tag => (
								<option key={tag.id} value={tag.id}>
									{tag.data.name}
								</option>
							))}
						</select>
					</div>
				)}

				{article.fields.tags.isDirty && (
					<p style={{ color: 'orange', fontSize: '12px' }} data-testid="tags-dirty-notice">Tags have been modified</p>
				)}
			</div>

			<div className="actions">
				<button disabled={!article.isDirty || article.isPersisting} onClick={() => article.persist()} data-testid="article-save-button">
					{article.isPersisting ? 'Saving...' : 'Save'}
				</button>
				<button disabled={!article.isDirty} onClick={() => article.reset()} data-testid="article-reset-button">
					Reset
				</button>
			</div>

			{article.isDirty && <p className="dirty-notice" data-testid="article-dirty-notice">You have unsaved changes</p>}
		</div>
	)
}
