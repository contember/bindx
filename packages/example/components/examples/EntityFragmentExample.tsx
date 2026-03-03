import { Entity, createComponent } from '../../bindx.js'
import { Field, HasMany, HasOne } from '@contember/bindx-react'

// ============================================================================
// Fragment Component Definitions
// ============================================================================

/**
 * A reusable fragment component for displaying author information.
 *
 * This component:
 * 1. Can be used inside <Entity> with typed props
 * 2. Exposes `$author` fragment for use with useEntity hook
 * 3. Uses implicit selection (collected from JSX)
 */
export const AuthorInfo = createComponent()
	.entity('author', 'Author')
	.props<{ showEmail?: boolean }>()
	.render(({ author, showEmail }) => (
		<div className="author-info">
			<strong>
				<Field field={author.name} />
			</strong>
			{showEmail && (
				<span className="email">
					{' '}
					(<Field field={author.email} />)
				</span>
			)}
		</div>
	))

/**
 * A component that uses explicit selection for has-many with limit.
 */
export const AuthorArticles = createComponent()
	.entity('author', 'Author', e => e.articles({ limit: 5 }, a => a.id().title()))
	.render(({ author }) => (
		<ul>
			<HasMany field={author.articles}>
				{article => (
					<li key={article.id}>
						<Field field={article.title} />
					</li>
				)}
			</HasMany>
		</ul>
	))

/**
 * A component that uses implicit selection - limit is passed at render time.
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
 * Another fragment component for author - displays bio and articles.
 */
export const AuthorBio = createComponent()
	.entity('author', 'Author')
	.render(({ author }) => (
		<div className="author-bio">
			<p>
				<Field field={author.bio} />
			</p>
			<h4>Recent Articles</h4>
			<ul>
				<HasMany field={author.articles} limit={3}>
					{article => (
						<li key={article.id}>
							<Field field={article.title} />
						</li>
					)}
				</HasMany>
			</ul>
		</div>
	))

/**
 * Fragment component for displaying article tags.
 */
export const ArticleTags = createComponent()
	.entity('article', 'Article')
	.props<{ className?: string }>()
	.render(({ article, className }) => (
		<div className={className ?? 'article-tags'}>
			<HasMany field={article.tags}>
				{tag => (
					<span key={tag.id} className="tag" style={{ backgroundColor: tag.color.value ?? undefined }}>
						<Field field={tag.name} />
					</span>
				)}
			</HasMany>
		</div>
	))

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example 1: Using fragment components in JSX under <Entity>
 */
export function AuthorProfileExample({ authorId }: { authorId: string }) {
	return (
		<Entity name="Author" by={{ id: authorId }}>
			{author => (
				<div className="author-profile">
					<h2>Author Profile</h2>

					{/* Use the AuthorInfo fragment component */}
					<AuthorInfo author={author} showEmail />

					{/* Use the AuthorBio fragment component */}
					<AuthorBio author={author} />
				</div>
			)}
		</Entity>
	)
}

/**
 * Example 2: Nested Entity with multiple fragment components
 */
export function ArticleDetailWithFragments({ articleId }: { articleId: string }) {
	return (
		<Entity name="Article" by={{ id: articleId }}>
			{article => (
				<article className="article-detail">
					<header>
						<h1>
							<Field field={article.$fields.title} />
						</h1>

						<AuthorInfo author={article.$fields.author.$entity} showEmail />

						{/* Use fragment component for author */}
						<HasOne field={article.$fields.author}>
							{author => <AuthorInfo author={author} showEmail />}
						</HasOne>
					</header>

					<div className="content">
						<Field field={article.$fields.content} />
					</div>

					<footer>
						{/* Use fragment component for tags */}
						<ArticleTags article={article} className="footer-tags" />
					</footer>
				</article>
			)}
		</Entity>
	)
}

/**
 * Example 3: Composition of multiple fragments
 */
export function AuthorCardExample({ authorId }: { authorId: string }) {
	return (
		<Entity name="Author" by={{ id: authorId }}>
			{author => (
				<div className="author-card">
					{/* Multiple fragment components for the same entity */}
					<div className="card-header">
						<AuthorInfo author={author} showEmail={false} />
					</div>
					<div className="card-body">
						<AuthorBio author={author} />
					</div>
				</div>
			)}
		</Entity>
	)
}

// ============================================================================
// Hook Integration Examples (Fragment $propName properties)
// ============================================================================

/**
 * The $author fragment property is available for hook integration.
 * It contains the selection metadata extracted from the component's JSX.
 *
 * Usage with useEntity:
 * ```ts
 * const article = useEntity('Article', { id }, e =>
 *   e.title().author(AuthorInfo.$author)
 * )
 * ```
 *
 * Merging multiple fragments:
 * ```ts
 * const article = useEntity('Article', { id }, e =>
 *   e.title().author(AuthorInfo.$author, AuthorBio.$author)
 * )
 * ```
 */

// Verify that $author fragment is accessible (compile-time check)
const _authorInfoFragment = AuthorInfo.$author
const _authorBioFragment = AuthorBio.$author
const _articleTagsFragment = ArticleTags.$article

// These are FluentFragment objects that can be used in useEntity
void _authorInfoFragment
void _authorBioFragment
void _articleTagsFragment
