import { c } from '@contember/schema-definition'

export class Author {
	name = c.stringColumn().notNull()
	email = c.stringColumn()
	bio = c.stringColumn()
	articles = c.oneHasMany(Article, 'author')
}

export class Tag {
	name = c.stringColumn().notNull()
	color = c.stringColumn()
	articles = c.manyHasManyInverse(Article, 'tags')
}

export class Location {
	lat = c.doubleColumn()
	lng = c.doubleColumn()
	label = c.stringColumn()
}

export class Article {
	title = c.stringColumn().notNull()
	content = c.stringColumn()
	richContent = c.jsonColumn()
	publishedAt = c.dateTimeColumn()
	author = c.manyHasOne(Author, 'articles')
	location = c.oneHasOne(Location)
	tags = c.manyHasMany(Tag, 'articles')
	contentReferences = c.oneHasMany(ContentReference, 'article')
}

export class ContentReference {
	article = c.manyHasOne(Article, 'contentReferences').cascadeOnDelete()
	type = c.stringColumn().notNull()
	imageUrl = c.stringColumn()
	caption = c.stringColumn()
	quoteText = c.stringColumn()
	quoteAuthor = c.stringColumn()
	embedUrl = c.stringColumn()
	embedType = c.stringColumn()
	calloutText = c.stringColumn()
	calloutVariant = c.stringColumn()
}
