import { Entity, createComponent, useEntity } from '../../bindx.js'
import { Field, HasMany, mergeFragments } from '@contember/bindx-react'

/**
 * Component with explicit selection - selection is defined upfront in the builder.
 */
export const AuthorArticlesExplicit = createComponent()
	.entity('author', 'Author', e => e.name().articles({ limit: 5 }, a => a.id().title()))
	.render(({ author }) => (
		<ul>
			<HasMany field={author.$fields.articles}>
				{article => (
					<li key={article.id}>
						<Field field={article.$fields.title} />
					</li>
				)}
			</HasMany>
		</ul>
	))

/**
 * Component with implicit selection - selection is collected from JSX access.
 */
export const AuthorArticlesImplicit = createComponent()
	.entity('author', 'Author')
	.render(({ author }) => (
		<ul>
			<HasMany field={author.articles} limit={5}>
				{article => (
					<li key={article.id}>
						<Field field={article.title} />
					</li>
				)}
			</HasMany>
		</ul>
	))

/**
 * Another implicit component for author bio.
 */
export const AuthorBioImplicit = createComponent()
	.entity('author', 'Author')
	.render(({ author }) => (
		<div>
			<p>
				<Field field={author.bio} />
			</p>
		</div>
	))

/**
 * Example: Using implicit component inside Entity JSX.
 */
export const ArticleImplicitInImplicit = () => {
	return (
		<Entity name="Article" by={{ id: 'some-article-id' }}>
			{article => (
				<article className="article-detail">
					<header>
						<h1>
							<Field field={article.$fields.title} />
						</h1>
					</header>
					<AuthorArticlesImplicit author={article.$fields.author.$entity} />
				</article>
			)}
		</Entity>
	)
}

/**
 * Example: Using explicit component inside Entity JSX.
 */
export const ArticleExplicitInImplicit = () => {
	return (
		<Entity name="Article" by={{ id: 'some-article-id' }}>
			{article => (
				<article className="article-detail">
					<header>
						<h1>
							<Field field={article.$fields.title} />
						</h1>
					</header>
					<AuthorArticlesExplicit author={article.$fields.author.$entity} />
				</article>
			)}
		</Entity>
	)
}

/**
 * Example: Using explicit component with useEntity hook.
 * The component's $author fragment is used in the selection.
 */
export const ArticleExplicitInExplicit = () => {
	const article = useEntity('Article', { by: { id: 'some-article-id' } }, e =>
		e.title().author(AuthorArticlesExplicit.$author),
	)

	if (article.isLoading) {
		return <div>Loading article...</div>
	}

	if (article.isError) {
		return <div>Error: {article.error.message}</div>
	}

	return (
		<article className="article-detail">
			<header>
				<h1>
					<Field field={article.fields.title} />
				</h1>
			</header>
			<AuthorArticlesExplicit author={article.fields.author.$entity} />
		</article>
	)
}

/**
 * Example: Using multiple implicit components with useEntity hook.
 * mergeFragments combines the fragment selections from both components.
 */
export const ArticleImplicitInExplicit = () => {
	// Use mergeFragments to combine fragment selections from both components
	// This ensures the EntityRef has the required brands for both components
	const article = useEntity('Article', { by: { id: 'some-article-id' } }, e =>
		e.title().author(mergeFragments(AuthorArticlesImplicit.$author, AuthorBioImplicit.$author)),
	)

	if (article.isLoading) {
		return <div>Loading article...</div>
	}

	if (article.isError) {
		return <div>Error: {article.error.message}</div>
	}

	return (
		<article className="article-detail">
			<header>
				<h1>
					<Field field={article.fields.title} />
				</h1>
			</header>
			<AuthorBioImplicit author={article.fields.author.$entity} />

			<AuthorArticlesImplicit author={article.fields.author.$entity} />
		</article>
	)
}
