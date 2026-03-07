
export type JSONPrimitive = string | number | boolean | null
export type JSONValue = JSONPrimitive | JSONObject | JSONArray
export type JSONObject = { readonly [K in string]?: JSONValue }
export type JSONArray = readonly JSONValue[]

export interface Article {
		id: string
		title: string
		content: string | null
		richContent: JSONValue | null
		publishedAt: string | null
		author: Author
		location: Location
		tags: Tag[]
		contentReferences: ContentReference[]
}

export interface Author {
		id: string
		name: string
		email: string | null
		bio: string | null
		articles: Article[]
}

export interface ContentReference {
		id: string
		type: string
		imageUrl: string | null
		caption: string | null
		article: Article
}

export interface Location {
		id: string
		lat: number | null
		lng: number | null
		label: string | null
}

export interface Tag {
		id: string
		name: string
		color: string | null
		articles: Article[]
}


export interface BindxEntities {
	Article: Article
	Author: Author
	ContentReference: ContentReference
	Location: Location
	Tag: Tag
}

export interface BindxSchema {
	entities: BindxEntities
}
