import { entityDef } from '@contember/bindx'
import type { Article, ArticleBlock, Author, ContentReference, Location, Tag } from './entities'

export const schema = {
	Article: entityDef<Article>('Article'),
	ArticleBlock: entityDef<ArticleBlock>('ArticleBlock'),
	Author: entityDef<Author>('Author'),
	ContentReference: entityDef<ContentReference>('ContentReference'),
	Location: entityDef<Location>('Location'),
	Tag: entityDef<Tag>('Tag'),
} as const
