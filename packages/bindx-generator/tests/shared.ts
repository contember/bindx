/**
 * Shared test fixtures for generator tests
 */
import { Model } from '@contember/schema'

// Test model schema
export const testModel: Model.Schema = {
	enums: {
		PostStatus: ['draft', 'published', 'archived'],
	},
	entities: {
		Author: {
			name: 'Author',
			primary: 'id',
			primaryColumn: 'id',
			tableName: 'author',
			fields: {
				id: {
					name: 'id',
					type: Model.ColumnType.Uuid,
					columnType: 'uuid',
					nullable: false,
					columnName: 'id',
				},
				name: {
					name: 'name',
					type: Model.ColumnType.String,
					columnType: 'text',
					nullable: false,
					columnName: 'name',
				},
				email: {
					name: 'email',
					type: Model.ColumnType.String,
					columnType: 'text',
					nullable: true,
					columnName: 'email',
				},
				salary: {
					name: 'salary',
					type: Model.ColumnType.Int,
					columnType: 'integer',
					nullable: true,
					columnName: 'salary',
				},
				posts: {
					name: 'posts',
					type: Model.RelationType.OneHasMany,
					target: 'Post',
					ownedBy: 'author',
				},
			},
			unique: [],
			indexes: [],
			eventLog: { enabled: true },
		},
		Post: {
			name: 'Post',
			primary: 'id',
			primaryColumn: 'id',
			tableName: 'post',
			fields: {
				id: {
					name: 'id',
					type: Model.ColumnType.Uuid,
					columnType: 'uuid',
					nullable: false,
					columnName: 'id',
				},
				title: {
					name: 'title',
					type: Model.ColumnType.String,
					columnType: 'text',
					nullable: false,
					columnName: 'title',
				},
				content: {
					name: 'content',
					type: Model.ColumnType.String,
					columnType: 'text',
					nullable: true,
					columnName: 'content',
				},
				status: {
					name: 'status',
					type: Model.ColumnType.Enum,
					columnType: 'PostStatus',
					nullable: false,
					columnName: 'status',
				},
				author: {
					name: 'author',
					type: Model.RelationType.ManyHasOne,
					target: 'Author',
					inversedBy: 'posts',
					nullable: false,
					joiningColumn: {
						columnName: 'author_id',
						onDelete: Model.OnDelete.restrict,
					},
				},
				tags: {
					name: 'tags',
					type: Model.RelationType.ManyHasMany,
					target: 'Tag',
					inversedBy: 'posts',
					joiningTable: {
						tableName: 'post_tags',
						joiningColumn: { columnName: 'post_id', onDelete: Model.OnDelete.cascade },
						inverseJoiningColumn: { columnName: 'tag_id', onDelete: Model.OnDelete.cascade },
						eventLog: { enabled: true },
					},
				},
			},
			unique: [],
			indexes: [],
			eventLog: { enabled: true },
		},
		Tag: {
			name: 'Tag',
			primary: 'id',
			primaryColumn: 'id',
			tableName: 'tag',
			fields: {
				id: {
					name: 'id',
					type: Model.ColumnType.Uuid,
					columnType: 'uuid',
					nullable: false,
					columnName: 'id',
				},
				name: {
					name: 'name',
					type: Model.ColumnType.String,
					columnType: 'text',
					nullable: false,
					columnName: 'name',
				},
				posts: {
					name: 'posts',
					type: Model.RelationType.ManyHasMany,
					target: 'Post',
					ownedBy: 'tags',
				},
			},
			unique: [],
			indexes: [],
			eventLog: { enabled: true },
		},
	},
}
