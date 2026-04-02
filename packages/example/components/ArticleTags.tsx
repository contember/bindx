import { createComponent, Field, HasMany, Attribute } from '@contember/bindx-react'
import { schema } from '../generated/index.js'

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
				{tag => (
					<Attribute field={tag.color} format={color => ({ style: { backgroundColor: color.value ?? '#666' } })}>
						<span className="inline-block px-2 py-0.5 rounded text-white text-sm mr-1">
							<Field field={tag.name} />
						</span>
					</Attribute>
				)}
			</HasMany>
		</div>
	))
