import type { ReactNode } from 'react'
import { Entity, Field, HasOne, Attribute, usePersist } from '@contember/bindx-react'
import { InputField, SelectField, MultiSelectField, Button } from '@contember/bindx-ui'
import { schema } from '../generated/index.js'

/**
 * Full article editor using Entity JSX with usePersist for saving.
 */
export function ArticleEditorPage({ id }: { id: string }): ReactNode {
	const { persistAll } = usePersist()

	return (
		<Entity
			entity={schema.Article}
			by={{ id }}
			loading={<div>Loading article...</div>}
			notFound={<div>Article not found</div>}
		>
			{article => (
				<div className="article-editor" data-testid="article-editor">
					<h1>Edit Article</h1>

					<div className="form-section">
						<InputField field={article.title} label="Title" inputProps={{ 'data-testid': 'article-title-input' }} />
						<InputField field={article.content} label="Content" inputProps={{ 'data-testid': 'article-content-input' }} />
					</div>

					<div className="form-section" data-testid="article-author-select">
						<SelectField field={article.author} label="Author">
							{it => <Field field={it.name} />}
						</SelectField>
					</div>

					<HasOne field={article.author}>
						{author => (
							<div className="form-section author-editor" data-testid="author-editor">
								<h3>Author</h3>
								<InputField field={author.name} label="Name" inputProps={{ 'data-testid': 'author-name-input' }} />
								<InputField field={author.email} label="Email" inputProps={{ 'data-testid': 'author-email-input' }} />
							</div>
						)}
					</HasOne>

					<div className="form-section" data-testid="article-location">
						<h3>Location</h3>
						<p>Label: <Field field={article.location.label} /></p>
						<p>
							Coordinates: <Field field={article.location.lat} />,{' '}
							<Field field={article.location.lng} />
						</p>
					</div>

					<div className="form-section" data-testid="article-tags">
						<MultiSelectField field={article.tags} label="Tags">
							{it => (
								<Attribute field={it.color} format={color => ({ style: { color: color.value ?? undefined } })}>
									<span>
										<Field field={it.name}>
											{name => (
												<span data-testid={`tag-badge-${name.value}`}>{name.value}</span>
											)}
										</Field>
									</span>
								</Attribute>
							)}
						</MultiSelectField>

						{article.tags.isDirty && (
							<p style={{ color: 'orange', fontSize: '12px' }} data-testid="tags-dirty-notice">Tags have been modified</p>
						)}
					</div>

					<div className="actions">
						<Button disabled={!article.$isDirty} onClick={() => persistAll()} data-testid="article-save-button">
							Save
						</Button>
					</div>

					{article.$isDirty && <p className="dirty-notice" data-testid="article-dirty-notice">You have unsaved changes</p>}
				</div>
			)}
		</Entity>
	)
}
