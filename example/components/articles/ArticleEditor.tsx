import { useEntity } from '../../bindx.js'
import { AuthorEditor } from '../editors/AuthorEditor.js'
import { TextInput } from '../inputs/index.js'

/**
 * Full article editor - demonstrates useEntity with the new API
 */
export function ArticleEditor({ id }: { id: string }) {
	const article = useEntity('Article', { id }, e =>
		e
			.id()
			.title()
			.content()
			.author(a => a.id().name().email().bio())
			.location(l => l.id().label().lat().lng())
			.tags(t => t.id().name().color()),
	)

	if (article.isLoading) {
		return <div>Loading article...</div>
	}

	if (article.isError) {
		return <div>Error: {article.error.message}</div>
	}

	return (
		<div className="article-editor">
			<h1>Edit Article</h1>

			<div className="form-section">
				<TextInput field={article.fields.title} label="Title" />
				<TextInput field={article.fields.content} label="Content" />
			</div>

			<div className="form-section">
				<AuthorEditor author={article.fields.author.fields} />
			</div>

			<div className="form-section">
				<h3>Location</h3>
				<p>Label: {article.data.location?.label ?? 'N/A'}</p>
				<p>
					Coordinates: {article.data.location?.lat ?? 'N/A'},{' '}
					{article.data.location?.lng ?? 'N/A'}
				</p>
			</div>

			<div className="form-section">
				<h3>Tags ({article.data.tags?.length ?? 0})</h3>
				<ul>
					{article.data.tags?.map(tag => (
						<li key={tag.id} style={{ color: tag.color }}>
							{tag.name}
						</li>
					))}
				</ul>
			</div>

			<div className="actions">
				<button disabled={!article.isDirty || article.isPersisting} onClick={() => article.persist()}>
					{article.isPersisting ? 'Saving...' : 'Save'}
				</button>
				<button disabled={!article.isDirty} onClick={() => article.reset()}>
					Reset
				</button>
			</div>

			{article.isDirty && <p className="dirty-notice">You have unsaved changes</p>}
		</div>
	)
}
