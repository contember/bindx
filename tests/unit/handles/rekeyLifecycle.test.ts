import { describe, expect, test } from 'bun:test'
import {
	ActionDispatcher,
	BatchPersister,
	EntityHandle,
	FIELD_REF_META,
	MutationCollector,
	SchemaRegistry,
	SnapshotStore,
	type BackendAdapter,
	type EntityPersistedEvent,
	type EntityPersistingEvent,
	type SchemaDefinition,
} from '@contember/bindx'

interface Tag {
	id: string
	name: string
}

interface Profile {
	id: string
	name: string
	tags: Tag[]
}

interface Article {
	id: string
	title: string
	profile: Profile | null
	tags: Tag[]
}

interface TestSchema {
	Article: Article
	Profile: Profile
	Tag: Tag
	[key: string]: object
}

const schemaDefinition: SchemaDefinition<TestSchema> = {
	entities: {
		Article: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				profile: { type: 'hasOne', target: 'Profile' },
				tags: { type: 'hasMany', target: 'Tag', relationKind: 'manyHasMany' },
			},
		},
		Profile: {
			fields: {
				id: { type: 'scalar' },
				name: { type: 'scalar' },
				tags: { type: 'hasMany', target: 'Tag', relationKind: 'manyHasMany' },
			},
		},
		Tag: {
			fields: {
				id: { type: 'scalar' },
				name: { type: 'scalar' },
			},
		},
	},
}

describe('live handles across temp id rekey', () => {
	test('entity and cached field handles report and write the canonical identity', () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const schema = new SchemaRegistry(schemaDefinition)
		const tempId = store.createEntity('Article', { title: 'Draft' })
		const article = EntityHandle.create<Article>(tempId, 'Article', store, dispatcher, schema)
		const title = article.title
		let changes = 0
		let intercepts = 0
		title.onChange(() => { changes++ })
		title.onChanging(() => { intercepts++ })

		store.mapTempIdToPersistedId('Article', tempId, 'article-1')
		title.setValue('Published')

		expect(String(article.id)).toBe('article-1')
		expect(article[FIELD_REF_META].entityId).toBe('article-1')
		expect(title[FIELD_REF_META].entityId).toBe('article-1')
		expect(store.getEntitySnapshot<Article>('Article', 'article-1')?.data.title).toBe('Published')
		expect(changes).toBe(1)
		expect(intercepts).toBe(1)
	})

	test('entity lifecycle scopes survive rekey for every dispatcher attached to the store', () => {
		const store = new SnapshotStore()
		const firstDispatcher = new ActionDispatcher(store)
		const secondDispatcher = new ActionDispatcher(store)
		const schema = new SchemaRegistry(schemaDefinition)
		const tempId = store.createEntity('Article', { title: 'Draft' })
		const first = EntityHandle.create<Article>(tempId, 'Article', store, firstDispatcher, schema)
		const second = EntityHandle.create<Article>(tempId, 'Article', store, secondDispatcher, schema)
		let persisted = 0
		let persisting = 0
		first.$onPersisted(() => { persisted++ })
		second.$onPersisted(() => { persisted++ })
		first.$interceptPersisting(() => { persisting++ })
		second.$interceptPersisting(() => { persisting++ })

		store.mapTempIdToPersistedId('Article', tempId, 'article-1')
		const persistedEvent: EntityPersistedEvent = {
			type: 'entity:persisted',
			timestamp: Date.now(),
			entityType: 'Article',
			entityId: 'article-1',
			isNew: true,
			persistedId: 'article-1',
		}
		const persistingEvent: EntityPersistingEvent = {
			type: 'entity:persisting',
			timestamp: Date.now(),
			entityType: 'Article',
			entityId: 'article-1',
			isNew: false,
		}
		firstDispatcher.getEventEmitter().emit(persistedEvent)
		secondDispatcher.getEventEmitter().emit(persistedEvent)
		firstDispatcher.getEventEmitter().runInterceptorsSync(persistingEvent)
		secondDispatcher.getEventEmitter().runInterceptorsSync(persistingEvent)

		expect(persisted).toBe(2)
		expect(persisting).toBe(2)
	})

	test('has-one and has-many accessors preserve identity when their targets rekey', () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const schema = new SchemaRegistry(schemaDefinition)
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Article' }, true)
		const profileTempId = store.createEntity('Profile', { name: 'Draft profile' })
		const tagTempId = store.createEntity('Tag', { name: 'Draft tag' })
		store.setRelation('Article', 'article-1', 'profile', {
			currentId: profileTempId,
			state: 'connected',
		})
		store.getOrCreateHasMany('Article', 'article-1', 'tags', [])
		store.planHasManyConnection('Article', 'article-1', 'tags', tagTempId)
		const article = EntityHandle.create<Article>('article-1', 'Article', store, dispatcher, schema)
		const profile = article.profile
		const tags = article.tags
		const profileBefore = profile.$entity
		const tagBefore = tags.getById(tagTempId)

		store.mapTempIdToPersistedId('Profile', profileTempId, 'profile-1')
		store.mapTempIdToPersistedId('Tag', tagTempId, 'tag-1')

		expect(profile.$entity).toBe(profileBefore)
		expect(String(profileBefore.id)).toBe('profile-1')
		expect(profile[FIELD_REF_META].entityId).toBe('article-1')
		expect(tags.getById(tagTempId)).toBe(tagBefore)
		expect(tags.getById('tag-1')).toBe(tagBefore)
		expect(String(tagBefore.id)).toBe('tag-1')
		expect(tags[FIELD_REF_META].entityId).toBe('article-1')
	})

	test('a materialized placeholder follows its persisted id for reads and writes', () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const schema = new SchemaRegistry(schemaDefinition)
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Article' }, true)
		const article = EntityHandle.create<Article>('article-1', 'Article', store, dispatcher, schema)
		const placeholder = article.profile.$entity
		const name = placeholder.name
		name.setValue('Before materialization')
		placeholder.tags.add({ name: 'Child' })
		const profileTempId = store.getRelation('Article', 'article-1', 'profile')?.currentId
		if (!profileTempId) throw new Error('Expected the placeholder to materialize')

		store.mapTempIdToPersistedId('Profile', profileTempId, 'profile-1')
		name.setValue('After persistence')

		expect(String(placeholder.id)).toBe('profile-1')
		expect(placeholder[FIELD_REF_META].entityId).toBe('profile-1')
		expect(name[FIELD_REF_META].entityId).toBe('profile-1')
		expect(placeholder.tags[FIELD_REF_META].entityId).toBe('profile-1')
		expect(store.getEntitySnapshot<Profile>('Profile', 'profile-1')?.data.name).toBe('After persistence')
	})

	test('placeholder lifecycle subscriptions activate on materialization and survive rekey', () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const schema = new SchemaRegistry(schemaDefinition)
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Article' }, true)
		const article = EntityHandle.create<Article>('article-1', 'Article', store, dispatcher, schema)
		const placeholder = article.profile.$entity
		let persisted = 0
		let persisting = 0
		placeholder.$onPersisted(() => { persisted++ })
		placeholder.$interceptPersisting(() => { persisting++ })
		placeholder.tags.add({ name: 'Child' })
		const profileTempId = store.getRelation('Article', 'article-1', 'profile')?.currentId
		if (!profileTempId) throw new Error('Expected the placeholder to materialize')
		const emitter = dispatcher.getEventEmitter()

		emitter.runInterceptorsSync({
			type: 'entity:persisting',
			timestamp: Date.now(),
			entityType: 'Profile',
			entityId: profileTempId,
			isNew: true,
		})
		store.mapTempIdToPersistedId('Profile', profileTempId, 'profile-1')
		emitter.runInterceptorsSync({
			type: 'entity:persisting',
			timestamp: Date.now(),
			entityType: 'Profile',
			entityId: 'profile-1',
			isNew: false,
		})
		emitter.emit({
			type: 'entity:persisted',
			timestamp: Date.now(),
			entityType: 'Profile',
			entityId: 'profile-1',
			isNew: true,
			persistedId: 'profile-1',
		})

		expect(persisting).toBe(2)
		expect(persisted).toBe(1)
	})

	test('a held scalar placeholder follows collector materialization and persistence', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const schema = new SchemaRegistry(schemaDefinition)
		const adapter: BackendAdapter = {
			query: () => Promise.resolve([]),
			persist: (_entityType, entityId) => Promise.resolve({
				ok: true,
				data: {
					id: entityId,
					title: 'Article',
					profile: { id: 'profile-1', name: 'Before persistence' },
				},
			}),
			create: (_entityType, data) => Promise.resolve({
				ok: true,
				data: { ...data, id: 'profile-1' },
			}),
			delete: () => Promise.resolve({ ok: true }),
		}
		const persister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector: new MutationCollector(store, schema),
		})
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Article' }, true)
		const article = EntityHandle.create<Article>('article-1', 'Article', store, dispatcher, schema)
		const placeholder = article.profile.$entity
		const name = placeholder.name
		let persisted = 0
		let persisting = 0
		placeholder.$onPersisted(() => { persisted++ })
		placeholder.$interceptPersisting(() => { persisting++ })
		name.setValue('Before persistence')

		await persister.persistAll()

		expect(String(placeholder.id)).toBe('profile-1')
		expect(placeholder[FIELD_REF_META].entityId).toBe('profile-1')
		expect(name[FIELD_REF_META].entityId).toBe('profile-1')
		expect(name.value).toBe('Before persistence')
		expect(persisted).toBe(1)
		expect(persisting).toBe(1)

		dispatcher.getEventEmitter().runInterceptorsSync({
			type: 'entity:persisting',
			timestamp: Date.now(),
			entityType: 'Profile',
			entityId: 'profile-1',
			isNew: false,
		})
		expect(persisting).toBe(2)
	})
})
