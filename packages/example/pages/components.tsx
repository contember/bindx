import type { ReactNode } from 'react'
import { Entity, createComponent, Field, HasMany, mergeFragments, useEntity } from '@contember/bindx-react'
import { schema } from '../generated/index.js'
import { AuthorInfo } from '../components/AuthorInfo.js'
import { AuthorBio } from '../components/AuthorBio.js'
import { ArticleTags } from '../components/ArticleTags.js'

// ============================================================================
// Local createComponent fragments for this page
// ============================================================================

/**
 * Component with explicit selection — selection is defined upfront in the builder.
 */
const AuthorArticlesExplicit = createComponent()
	.entity('author', schema.Author, e => e.name().articles({ limit: 5 }, a => a.id().title()))
	.render(({ author }) => (
		<ul>
			<HasMany field={author.articles}>
				{article => (
					<li key={article.id}><Field field={article.title} /></li>
				)}
			</HasMany>
		</ul>
	))

/**
 * Component with implicit selection — selection is collected from JSX access.
 */
const AuthorArticlesImplicit = createComponent()
	.entity('author', schema.Author)
	.render(({ author }) => (
		<ul>
			<HasMany field={author.articles} limit={5}>
				{article => (
					<li key={article.id}><Field field={article.title} /></li>
				)}
			</HasMany>
		</ul>
	))

// ============================================================================
// Example 1: Fragment components in Entity JSX
// ============================================================================

function AuthorProfileExample({ authorId }: { authorId: string }): ReactNode {
	return (
		<Entity entity={schema.Author} by={{ id: authorId }} loading={<div>Loading...</div>}>
			{author => (
				<div className="border rounded p-4">
					<h4>Author Profile</h4>
					<AuthorInfo author={author} showEmail />
					<AuthorBio author={author} />
				</div>
			)}
		</Entity>
	)
}

// ============================================================================
// Example 2: Nested Entity with fragment components
// ============================================================================

function ArticleWithFragmentsExample({ articleId }: { articleId: string }): ReactNode {
	return (
		<Entity entity={schema.Article} by={{ id: articleId }} loading={<div>Loading...</div>}>
			{article => (
				<article className="border rounded p-4">
					<header>
						<h4><Field field={article.title} /></h4>
						<AuthorInfo author={article.author} showEmail />
					</header>
					<div className="my-2">
						<Field field={article.content} />
					</div>
					<footer>
						<ArticleTags article={article} />
					</footer>
				</article>
			)}
		</Entity>
	)
}

// ============================================================================
// Example 3: Explicit vs implicit selection components
// ============================================================================

function ExplicitVsImplicitExample({ articleId }: { articleId: string }): ReactNode {
	return (
		<Entity entity={schema.Article} by={{ id: articleId }} loading={<div>Loading...</div>}>
			{article => (
				<div className="border rounded p-4">
					<h4><Field field={article.title} /></h4>

					<div className="grid grid-cols-2 gap-4 mt-2">
						<div>
							<h5 className="font-medium text-sm">Explicit selection</h5>
							<AuthorArticlesExplicit author={article.author} />
						</div>
						<div>
							<h5 className="font-medium text-sm">Implicit selection</h5>
							<AuthorArticlesImplicit author={article.author} />
						</div>
					</div>
				</div>
			)}
		</Entity>
	)
}

// ============================================================================
// Example 4: Fragment $propName with useEntity hook
// ============================================================================

function HookIntegrationExample({ articleId }: { articleId: string }): ReactNode {
	const article = useEntity(schema.Article, { by: { id: articleId } }, e =>
		e.title().author(mergeFragments(AuthorArticlesImplicit.$author, AuthorBio.$author)),
	)

	if (article.$isLoading) return <div>Loading...</div>
	if (article.$isError || article.$isNotFound) return <div>Error</div>

	return (
		<div className="border rounded p-4">
			<h4>{article.title.value}</h4>
			<p className="text-sm text-gray-500 mb-2">
				Uses <code>mergeFragments()</code> to combine fragment selections from AuthorArticlesImplicit and AuthorBio
			</p>
			<AuthorBio author={article.author} />
			<AuthorArticlesImplicit author={article.author} />
		</div>
	)
}

// ============================================================================
// Combined page
// ============================================================================

/**
 * Showcase of createComponent patterns and fragment composition.
 *
 * Demonstrates:
 * - createComponent with implicit and explicit selection
 * - Fragment components inside Entity JSX
 * - Fragment $propName for useEntity hook integration
 * - mergeFragments for combining selections
 */
export function ComponentsPage({ authorId, articleId }: { authorId: string; articleId: string }): ReactNode {
	return (
		<>
			<h3>1. Fragment Components in Entity JSX</h3>
			<p className="text-sm text-gray-500 mb-2">
				Reusable <code>createComponent()</code> fragments used inside <code>&lt;Entity&gt;</code>
			</p>
			<AuthorProfileExample authorId={authorId} />

			<hr className="my-6" />

			<h3>2. Nested Entity with Fragments</h3>
			<p className="text-sm text-gray-500 mb-2">
				Multiple fragment components composed in a single <code>&lt;Entity&gt;</code>
			</p>
			<ArticleWithFragmentsExample articleId={articleId} />

			<hr className="my-6" />

			<h3>3. Explicit vs Implicit Selection</h3>
			<p className="text-sm text-gray-500 mb-2">
				Explicit selection defines fields upfront; implicit collects from JSX
			</p>
			<ExplicitVsImplicitExample articleId={articleId} />

			<hr className="my-6" />

			<h3>4. Fragment + useEntity Hook Integration</h3>
			<p className="text-sm text-gray-500 mb-2">
				Fragment <code>$author</code> used with <code>useEntity</code> and <code>mergeFragments()</code>
			</p>
			<HookIntegrationExample articleId={articleId} />
		</>
	)
}
