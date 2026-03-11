import type { BindxSchemaNames } from './types'

export const schemaNames: BindxSchemaNames = {
	"entities": {
		"Article": {
			"name": "Article",
			"fields": {
				"id": {
					"type": "column"
				},
				"title": {
					"type": "column"
				},
				"content": {
					"type": "column"
				},
				"richContent": {
					"type": "column"
				},
				"publishedAt": {
					"type": "column"
				},
				"author": {
					"type": "one",
					"entity": "Author"
				},
				"location": {
					"type": "one",
					"entity": "Location"
				},
				"tags": {
					"type": "many",
					"entity": "Tag"
				},
				"contentReferences": {
					"type": "many",
					"entity": "ContentReference"
				}
			},
			"scalars": [
				"id",
				"title",
				"content",
				"richContent",
				"publishedAt"
			]
		},
		"Author": {
			"name": "Author",
			"fields": {
				"id": {
					"type": "column"
				},
				"name": {
					"type": "column"
				},
				"email": {
					"type": "column"
				},
				"bio": {
					"type": "column"
				},
				"articles": {
					"type": "many",
					"entity": "Article"
				}
			},
			"scalars": [
				"id",
				"name",
				"email",
				"bio"
			]
		},
		"ContentReference": {
			"name": "ContentReference",
			"fields": {
				"id": {
					"type": "column"
				},
				"article": {
					"type": "one",
					"entity": "Article"
				},
				"type": {
					"type": "column"
				},
				"imageUrl": {
					"type": "column"
				},
				"caption": {
					"type": "column"
				},
				"quoteText": {
					"type": "column"
				},
				"quoteAuthor": {
					"type": "column"
				},
				"embedUrl": {
					"type": "column"
				},
				"embedType": {
					"type": "column"
				},
				"calloutText": {
					"type": "column"
				},
				"calloutVariant": {
					"type": "column"
				}
			},
			"scalars": [
				"id",
				"type",
				"imageUrl",
				"caption",
				"quoteText",
				"quoteAuthor",
				"embedUrl",
				"embedType",
				"calloutText",
				"calloutVariant"
			]
		},
		"Location": {
			"name": "Location",
			"fields": {
				"id": {
					"type": "column"
				},
				"lat": {
					"type": "column"
				},
				"lng": {
					"type": "column"
				},
				"label": {
					"type": "column"
				}
			},
			"scalars": [
				"id",
				"lat",
				"lng",
				"label"
			]
		},
		"Tag": {
			"name": "Tag",
			"fields": {
				"id": {
					"type": "column"
				},
				"name": {
					"type": "column"
				},
				"color": {
					"type": "column"
				},
				"articles": {
					"type": "many",
					"entity": "Article"
				}
			},
			"scalars": [
				"id",
				"name",
				"color"
			]
		}
	},
	"enums": {}
}
