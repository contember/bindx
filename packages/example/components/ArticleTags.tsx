import { createComponent, HasMany } from '@contember/bindx-react'
import { schema } from '../generated/index.js'

const TagBadge = createComponent()
	.entity('tag', schema.Tag, t => t.name().color())
	.render(({ tag }) => (
		<span
			className="inline-block px-2 py-0.5 rounded text-white text-sm mr-1"
			style={{ backgroundColor: tag.color.value ?? '#666' }}
		>
			{tag.name.value}
		</span>
	))

/**
 * Reusable fragment component for displaying article tags.
 * Uses implicit selection (collected from JSX).
 */
export const ArticleTags = createComponent()
	.entity('article', schema.Article)
	.props<{ className?: string }>()
	.render(({ article, className }) => (
		<div className={className ?? 'article-tags'}>
			<HasMany field={article.tags}>
				{tag => <TagBadge key={tag.id} tag={tag} />}
			</HasMany>
		</div>
	))
