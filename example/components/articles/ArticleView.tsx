import { useEntity } from '../../bindx.js'

/**
 * Simple article view using inline fragment definition
 */
export function ArticleView({ id }: { id: string }) {
	const article = useEntity('Article', { id }, e => e.title().author(a => a.name()))

	if (article.isLoading) {
		return <div>Loading...</div>
	}

	if (article.isError) {
		return <div>Error: {article.error.message}</div>
	}

	return (
		<div className="article-view">
			<h2>{article.data.title}</h2>
			<p>By: {article.data.author?.name ?? 'Unknown'}</p>
		</div>
	)
}
