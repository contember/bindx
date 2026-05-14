// Regression test for <issue-url — filled in after Step 7>
//
// `<HasOne field={...}>` over a nullable many/one-has-one relation that is
// currently null at runtime fires its children callback with `undefined`
// instead of the placeholder accessor `useEntity` returns for the same
// field. The typed contract claims `EntityRef<T>` (non-nullable), so callers
// don't guard — and crash on the first field access (`Cannot read properties
// of undefined (reading '<field>')`).
//
// Bug observed in NPI (`packages/admin/app/components/publications/seo-card.tsx`):
// outer `<HasOne field={product.seo}>` auto-creates the placeholder, then the
// inner `<HasOne field={seo.image}>` over the disconnected image relation
// gives `undefined` to the callback. The same shape reproduces here with
// `<HasOne field={article.author}>{author => <HasOne field={author.profile}>…`.

import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	defineSchema,
	entityDef,
	HasOne,
	hasOne,
	MockAdapter,
	scalar,
	useEntity,
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
			// Both levels disconnected — outer `author` is null, so the
			// inner `<HasOne field={author.profile}>` runs on a placeholder
			// author. This mirrors the NPI seo-card scenario where the
			// product has no SEO meta row yet, the outer HasOne hands out
			// a placeholder, and the inner one over the still-empty image
			// relation crashes.
			author: null,
		},
	},
	Author: {},
	Profile: {},
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
							<HasOne field={author.profile}>
								{profile => (
									<div data-testid="profile-block">
										<span data-testid="profile-bio">{profile.bio.value ?? 'empty'}</span>
									</div>
								)}
							</HasOne>
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

		// Inner HasOne should still render — placeholder accessor returns
		// `null` field values, not throw `Cannot read properties of undefined`.
		expect(getByTestId(container, 'profile-block')).not.toBeNull()
		expect(getByTestId(container, 'profile-bio').textContent).toBe('empty')
	})
})
