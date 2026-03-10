import { entityDef } from '@contember/bindx'
import type { Article, Author, ContentReference, Location, Tag } from './entities'

export const schema = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
	ContentReference: entityDef<ContentReference>('ContentReference'),
	Location: entityDef<Location>('Location'),
	Tag: entityDef<Tag>('Tag'),
} as const
