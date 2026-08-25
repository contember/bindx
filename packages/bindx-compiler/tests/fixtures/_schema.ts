// Tiny local schema for fixtures. entityDef carries no schema — matching the
// standalone createComponent path where relation-ness is derived purely from usage.
import { entityDef } from '@contember/bindx-react'

export interface Author {
	id: string
	name: string
	email: string
}

export interface Tag {
	id: string
	name: string
	color: string
}

export interface Article {
	id: string
	title: string
	content: string
	status?: string
	published?: boolean | null
	rating?: number | null
	views?: number | null
	author: Author | null
	tags: Tag[]
}

export const schema = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
	Tag: entityDef<Tag>('Tag'),
} as const
