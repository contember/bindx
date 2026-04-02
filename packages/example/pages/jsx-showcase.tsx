import type { ReactNode } from 'react'
import { Entity, Field, HasMany, HasOne, If, Show, Attribute, createComponent } from '@contember/bindx-react'
import { schema } from '../generated/index.js'

// ============================================================================
// createComponent-based fragments (participate in selection collection)
// ============================================================================

const AuthorEditForm = createComponent()
	.entity('author', schema.Author)
	.render(({ author }) => (
		<form className="flex flex-col gap-3">
			<div>
				<label className="block text-sm font-medium">Name</label>
				<Field field={author.name}>
					{name => (
						<>
							<input
								type="text"
								className="border rounded px-2 py-1 w-full"
								value={name.value ?? ''}
								onChange={e => author.name.setValue(e.target.value)}
							/>
							{name.isDirty && <span className="text-orange-500 text-xs ml-1">*</span>}
						</>
					)}
				</Field>
			</div>

			<div>
				<label className="block text-sm font-medium">Email</label>
				<Field field={author.email}>
					{email => (
						<input
							type="email"
							className="border rounded px-2 py-1 w-full"
							value={email.value ?? ''}
							onChange={e => author.email.setValue(e.target.value)}
						/>
					)}
				</Field>
			</div>

			<div>
				<label className="block text-sm font-medium">Bio</label>
				<Field field={author.bio}>
					{bio => (
						<textarea
							className="border rounded px-2 py-1 w-full"
							value={bio.value ?? ''}
							onChange={e => author.bio.setValue(e.target.value)}
						/>
					)}
				</Field>
			</div>

			{author.$isDirty && (
				<div className="flex gap-2">
					<button type="button" className="px-3 py-1 bg-blue-500 text-white rounded text-sm">
						Save Changes
					</button>
				</div>
			)}
		</form>
	))

// ============================================================================
// Pages
// ============================================================================

/**
 * Showcase of all JSX components: Entity, Field, HasMany, HasOne, If, Show.
 */
export function JsxShowcasePage({ authorId }: { authorId: string }): ReactNode {
	return (
		<Entity
			entity={schema.Author}
			by={{ id: authorId }}
			loading={<div>Loading author...</div>}
			error={err => <div className="error">Failed to load: {err.message}</div>}
		>
			{author => (
				<div className="author-card">
					{/* Scalar fields */}
					<h2><Field field={author.name} /></h2>

					{/* Field with render function */}
					<p className="email">
						<Field field={author.email}>
							{field => <a href={`mailto:${field.value}`}>{field.value}</a>}
						</Field>
					</p>

					{/* Show component — renders only when field is non-null */}
					<Show field={author.bio} fallback={<p className="text-gray-400 italic">No bio available</p>}>
						{bio => <p className="bio">{bio}</p>}
					</Show>

					{/* HasMany relation with index */}
					<section className="articles mt-4">
						<h3>Articles</h3>
						<HasMany field={author.articles} limit={5}>
							{(article, index) => (
								<article key={article.id} className="border-l-2 border-gray-200 pl-3 mb-3">
									<h4>
										{index + 1}. <Field field={article.title} />
									</h4>

									{/* Nested HasOne relation */}
									<HasOne field={article.location}>
										{location => (
											<span className="text-sm text-gray-500">
												Location: <Field field={location.label} />
											</span>
										)}
									</HasOne>

									{/* Nested HasMany relation */}
									<div className="flex gap-1 mt-1">
										<HasMany field={article.tags}>
											{tag => (
								<Attribute key={tag.id} field={tag.color} format={color => ({ style: { backgroundColor: color.value ?? '#666' } })}>
									<span className="inline-block px-1.5 py-0.5 rounded text-white text-xs">
										<Field field={tag.name} />
									</span>
								</Attribute>
							)}
										</HasMany>
									</div>

									{/* Conditional rendering */}
									<Field field={article.publishedAt}>
										{pub => pub.value !== null
											? <time className="text-xs text-green-600">Published: {String(pub.value)}</time>
											: <span className="text-xs text-orange-500">Draft</span>
										}
									</Field>
								</article>
							)}
						</HasMany>
					</section>
				</div>
			)}
		</Entity>
	)
}

/**
 * Interactive editing example using Entity JSX.
 */
export function AuthorEditPage({ authorId }: { authorId: string }): ReactNode {
	return (
		<Entity
			entity={schema.Author}
			by={{ id: authorId }}
			loading={<div>Loading author...</div>}
			error={err => <div className="error">Failed to load: {err.message}</div>}
		>
			{author => <AuthorEditForm author={author} />}
		</Entity>
	)
}

/**
 * Combined JSX showcase page.
 */
export function JsxShowcaseFullPage({ authorId, articleId }: { authorId: string; articleId: string }): ReactNode {
	return (
		<>
			<h3>Author Profile (Entity + Field + HasMany + HasOne + If + Show)</h3>
			<JsxShowcasePage authorId={authorId} />
			<hr className="my-6" />
			<h3>Interactive Editing</h3>
			<AuthorEditPage authorId={authorId} />
			<hr className="my-6" />
			<h3>Article Detail</h3>
			<ArticleDetailPage articleId={articleId} />
		</>
	)
}

/**
 * Article detail with author and tags.
 */
function ArticleDetailPage({ articleId }: { articleId: string }): ReactNode {
	return (
		<Entity entity={schema.Article} by={{ id: articleId }} loading={<div>Loading...</div>}>
			{article => (
				<article>
					<header>
						<h2><Field field={article.title} /></h2>
						<HasOne field={article.author}>
							{author => (
								<div className="text-sm text-gray-600">
									By <strong><Field field={author.name} /></strong> (<Field field={author.email} />)
								</div>
							)}
						</HasOne>
					</header>
					<div className="my-2">
						<Field field={article.content} />
					</div>
					<footer className="flex gap-1">
						<HasMany field={article.tags}>
							{tag => (
								<Attribute key={tag.id} field={tag.color} format={color => ({ style: { backgroundColor: color.value ?? '#666' } })}>
									<span className="inline-block px-1.5 py-0.5 rounded text-white text-xs">
										<Field field={tag.name} />
									</span>
								</Attribute>
							)}
						</HasMany>
					</footer>
				</article>
			)}
		</Entity>
	)
}
