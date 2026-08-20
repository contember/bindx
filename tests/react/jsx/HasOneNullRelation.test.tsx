// Regression test for https://github.com/contember/bindx/issues/32.
// Nested nullable relations must expose placeholder accessors to JSX children.

import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	defineSchema,
	entityDef,
	HasOne,
	type HasOneRef,
	hasOne,
	isPlaceholderId,
	MockAdapter,
	scalar,
	Show,
	useEntity,
	useHasOne,
} from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

interface Profile {
	id: string
	bio: string | null
	avatar: string | null
}
interface Author {
	id: string
	name: string
	email: string | null
	profile: Profile | null
}
interface Article {
	id: string
	title: string
	author: Author | null
}
interface SelectedProfile {
	id: string
	bio: string | null
}
interface NestedSchema {
	Article: Article
	Author: Author
	Profile: Profile
}

const nestedSchema = defineSchema<NestedSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				author: hasOne('Author', { nullable: true }),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
				profile: hasOne('Profile', { nullable: true }),
			},
		},
		Profile: {
			fields: {
				id: scalar(),
				bio: scalar(),
				avatar: scalar(),
			},
		},
	},
})

const schema = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
	Profile: entityDef<Profile>('Profile'),
} as const

const mockData = {
	Article: {
		'article-1': {
			id: 'article-1',
			title: 'Article 1',
			author: null,
		},
		'article-2': {
			id: 'article-2',
			title: 'Article 2',
			author: {
				id: 'author-1',
				name: 'Author 1',
				email: 'author@example.com',
				profile: null,
			},
		},
	},
	Author: {
		'author-1': {
			id: 'author-1',
			name: 'Author 1',
			email: 'author@example.com',
			profile: null,
		},
	},
	Profile: {
		'profile-1': {
			id: 'profile-1',
			bio: 'Connected profile',
			avatar: null,
		},
	},
}

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

describe('HasOne JSX — nested nullable has-one with no connected row', () => {
	test('inner children callback receives a placeholder ref (not undefined) so field access does not crash', async () => {
		const adapter = new MockAdapter(mockData, { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
				a.id().title().author(au => au.id().name().email().profile(p => p.id().bio())))

			if (article.$isLoading) return <div data-testid="loading">Loading…</div>
			if (article.$isError || article.$isNotFound) return <div data-testid="error">Error</div>

			return (
				<div>
					<HasOne field={article.author}>
						{author => (
							<div>
								<span data-testid="author-placeholder">{isPlaceholderId(author.id) ? 'yes' : 'no'}</span>
								<HasOne field={author.profile}>
									{profile => (
										<div data-testid="profile-block">
											<span data-testid="profile-placeholder">{isPlaceholderId(profile.id) ? 'yes' : 'no'}</span>
											<span data-testid="profile-bio">{profile.bio.inputProps.value ?? 'empty'}</span>
										</div>
									)}
								</HasOne>
							</div>
						)}
					</HasOne>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={nestedSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'loading')).toBeNull()
		})

		expect(getByTestId(container, 'profile-block')).not.toBeNull()
		expect(getByTestId(container, 'author-placeholder').textContent).toBe('yes')
		expect(getByTestId(container, 'profile-placeholder').textContent).toBe('yes')
		expect(getByTestId(container, 'profile-bio').textContent).toBe('empty')
	})

	test.failing('$connect(id) re-points sibling field subscriptions to a warm target', async () => {
		const adapter = new MockAdapter(mockData, { delay: 0 })

		function ConnectProfile({ field }: { field: HasOneRef<Profile, SelectedProfile> }): React.ReactElement {
			const profile = useHasOne(field)
			return (
				<div>
					<span data-testid="connected-profile-id">{profile.$id}</span>
					<button data-testid="connect-profile" onClick={() => profile.$connect('profile-1')}>
						Connect profile
					</button>
				</div>
			)
		}

		function ProfileSlot({ field }: { field: HasOneRef<Profile, SelectedProfile> }): React.ReactElement {
			return (
				<div>
					<Show field={field.bio} fallback={<span data-testid="profile-empty">empty</span>}>
						{bio => <span data-testid="profile-value">{bio}</span>}
					</Show>
					<ConnectProfile field={field} />
				</div>
			)
		}

		function TestComponent(): React.ReactElement {
			const article = useEntity(schema.Article, { by: { id: 'article-2' } }, a =>
				a.id().author(author => author.id().profile(profile => profile.id().bio())))
			const profile = useEntity(schema.Profile, { by: { id: 'profile-1' } }, p => p.id().bio())

			if (article.$isLoading || profile.$isLoading) return <div data-testid="loading">Loading…</div>
			if (article.$isError || article.$isNotFound || profile.$isError || profile.$isNotFound) {
				return <div data-testid="error">Error</div>
			}

			return (
				<HasOne field={article.author}>
					{author => <ProfileSlot field={author.profile} />}
				</HasOne>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={nestedSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'loading')).toBeNull()
		})
		expect(getByTestId(container, 'profile-empty').textContent).toBe('empty')

		fireEvent.click(getByTestId(container, 'connect-profile'))

		expect(getByTestId(container, 'connected-profile-id').textContent).toBe('profile-1')
		await waitFor(() => {
			expect(getByTestId(container, 'profile-value').textContent).toBe('Connected profile')
		})
	})
})
