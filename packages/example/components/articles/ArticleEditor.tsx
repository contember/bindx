import { useEntity } from '@contember/bindx-react'
import { schema } from '../../generated/index.js'
import { AuthorEditor } from '../editors/AuthorEditor.js'
import { InputField, SelectField, MultiSelectField, Button } from '@contember/bindx-ui'

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

	if (article.isLoading) {
		return <div>Loading article...</div>
	}

	if (article.isError) {
		return <div>Error: {article.error.message}</div>
	}

	return (
		<div className="article-editor" data-testid="article-editor">
			<h1>Edit Article</h1>

			<div className="form-section">
				<InputField field={article.fields.title} label="Title" inputProps={{ 'data-testid': 'article-title-input' }} />
				<InputField field={article.fields.content} label="Content" inputProps={{ 'data-testid': 'article-content-input' }} />
			</div>

			<div className="form-section">
				<div data-testid="article-author-select">
					<SelectField field={article.fields.author} label="Author">
						{it => it.$fields.name.value}
					</SelectField>
				</div>
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
				<MultiSelectField field={article.fields.tags} label="Tags">
					{it => (
						<span
							data-testid={`tag-badge-${it.$fields.name.value}`}
							style={{ color: it.$fields.color.value ?? undefined }}
						>
							{it.$fields.name.value}
						</span>
					)}
				</MultiSelectField>

				{article.fields.tags.isDirty && (
					<p style={{ color: 'orange', fontSize: '12px' }} data-testid="tags-dirty-notice">Tags have been modified</p>
				)}
			</div>

			<div className="actions">
				<Button disabled={!article.isDirty || article.isPersisting} onClick={() => article.persist()} data-testid="article-save-button">
					{article.isPersisting ? 'Saving...' : 'Save'}
				</Button>
				<Button variant="outline" disabled={!article.isDirty} onClick={() => article.reset()} data-testid="article-reset-button">
					Reset
				</Button>
			</div>

			{article.isDirty && <p className="dirty-notice" data-testid="article-dirty-notice">You have unsaved changes</p>}
		</div>
	)
}
