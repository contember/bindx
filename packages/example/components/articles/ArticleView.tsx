import { useEntity } from '@contember/bindx-react'
import { schema } from '../../generated/index.js'

/**
 * Simple article view using inline fragment definition
 */
export function ArticleView({ id }: { id: string }) {
	const article = useEntity(schema.Article, { by: { id } }, e => e.title().author(a => a.name()))

	if (article.isLoading) {
		return <div>Loading...</div>
	}

	if (article.isError) {
		return <div>Error: {article.error.message}</div>
	}

	return (
		<div className="article-view" data-testid="article-view">
			<h2 data-testid="article-view-title">{article.data.title}</h2>
			<p data-testid="article-view-author">By: {article.data.author?.name ?? 'Unknown'}</p>
		</div>
	)
}
