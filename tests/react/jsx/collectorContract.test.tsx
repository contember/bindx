// Tests for declarative collector contracts (Phase 2.2): withCollector(runtime, contract)
// derives a staticRender that collects IDENTICALLY to an equivalent hand-written one
// (oracle comparison), tolerates a missing callback, and never affects runtime rendering.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import {
	createComponent,
	withCollector,
	itemOf,
	entityOf,
	COLLECTOR_CONTRACT,
	Field,
	HasMany,
	HasOne,
	Entity,
	useHasMany,
	COMPONENT_SELECTIONS,
	type SelectionMeta,
	type HasManyRef,
	type HasOneRef,
	type EntityRef,
} from '@contember/bindx-react'
import { schema, renderWithBindx, type Article, type Author, type Tag } from '../../shared'

afterEach(() => {
	cleanup()
})

// Triggers static collection via the `$<propName>` fragment getter, then reads the
// stored SelectionMeta — same mechanism the parent Entity walk uses.
function getComponentSelection(component: unknown, propName: string): SelectionMeta | undefined {
	const fragment = (component as Record<string, unknown>)[`$${propName}`]
	if (!fragment) return undefined
	const selections = (component as Record<symbol, Map<string, { selection: SelectionMeta }>>)[COMPONENT_SELECTIONS]
	return selections?.get(propName)?.selection
}

function fieldNames(meta: SelectionMeta): string[] {
	return [...meta.fields.values()].map(f => f.fieldName)
}

// ── Contract components under test and their hand-written staticRender oracles ──

interface RepeaterProps {
	field: HasManyRef<Tag>
	children?: (item: EntityRef<Tag>) => React.ReactNode
}

const ContractRepeater = withCollector(
	function ContractRepeater({ field, children }: RepeaterProps): React.ReactNode {
		const accessor = useHasMany(field)
		return <>{accessor.map(item => <React.Fragment key={item.id}>{children?.(item)}</React.Fragment>)}</>
	},
	{ children: itemOf('field') },
)

const ManualRepeater = withCollector(
	function ManualRepeater(_props: RepeaterProps): React.ReactNode { return null },
	(props: RepeaterProps) => (
		<HasMany field={props.field}>{item => props.children?.(item)}</HasMany>
	),
)

interface EditorProps {
	entity: HasOneRef<Author>
	children?: (entity: EntityRef<Author>) => React.ReactNode
}

const ContractEditor = withCollector(
	function ContractEditor(_props: EditorProps): React.ReactNode { return null },
	{ children: entityOf('entity') },
)

const ManualEditor = withCollector(
	function ManualEditor(_props: EditorProps): React.ReactNode { return null },
	(props: EditorProps) => (
		<HasOne field={props.entity}>{entity => props.children?.(entity)}</HasOne>
	),
)

describe('collector contract — oracle equivalence', () => {
	test('itemOf: has-many item callback with nested Field access matches hand-written staticRender', () => {
		const ContractHost = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => (
				<ContractRepeater field={article.tags}>
					{tag => <Field field={tag.name} />}
				</ContractRepeater>
			))

		const ManualHost = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => (
				<ManualRepeater field={article.tags}>
					{tag => <Field field={tag.name} />}
				</ManualRepeater>
			))

		const contract = getComponentSelection(ContractHost, 'article')
		const oracle = getComponentSelection(ManualHost, 'article')
		expect(contract).toEqual(oracle!)
		expect(fieldNames(contract!)).toContain('tags')
	})

	test('itemOf: host-root capture inside the callback (footer-editor shape) matches oracle', () => {
		// The callback uses its own item param AND a field of the HOST entity — the exact
		// shape that defeated the analyzer. Under a contract the host capture is an ordinary root path.
		const ContractHost = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => (
				<ContractRepeater field={article.tags}>
					{tag => (
						<>
							<Field field={tag.name} />
							<Field field={article.title} />
						</>
					)}
				</ContractRepeater>
			))

		const ManualHost = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => (
				<ManualRepeater field={article.tags}>
					{tag => (
						<>
							<Field field={tag.name} />
							<Field field={article.title} />
						</>
					)}
				</ManualRepeater>
			))

		const contract = getComponentSelection(ContractHost, 'article')
		const oracle = getComponentSelection(ManualHost, 'article')
		expect(contract).toEqual(oracle!)
		// The host-root capture landed at the article root, the item field under the relation.
		expect(fieldNames(contract!)).toContain('title')
		expect(fieldNames(contract!)).toContain('tags')
	})

	test('entityOf: has-one entity callback matches hand-written staticRender', () => {
		const ContractHost = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => (
				<ContractEditor entity={article.author}>
					{author => <Field field={author.name} />}
				</ContractEditor>
			))

		const ManualHost = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => (
				<ManualEditor entity={article.author}>
					{author => <Field field={author.name} />}
				</ManualEditor>
			))

		const contract = getComponentSelection(ContractHost, 'article')
		const oracle = getComponentSelection(ManualHost, 'article')
		expect(contract).toEqual(oracle!)
		expect(fieldNames(contract!)).toContain('author')
	})
})

describe('collector contract — robustness', () => {
	test('missing callback registers the relation with no nested selection and does not crash', () => {
		const Host = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => <ContractRepeater field={article.tags} />)

		const selection = getComponentSelection(Host, 'article')
		expect(fieldNames(selection!)).toContain('tags')
	})

	test('COLLECTOR_CONTRACT exposes the declared contract for introspection', () => {
		const holder = ContractRepeater as unknown as Record<symbol, unknown>
		expect(holder[COLLECTOR_CONTRACT]).toEqual({ children: { kind: 'itemOf', field: 'field' } })

		const editorHolder = ContractEditor as unknown as Record<symbol, unknown>
		expect(editorHolder[COLLECTOR_CONTRACT]).toEqual({ children: { kind: 'entityOf', field: 'entity' } })
	})
})

describe('collector contract — runtime rendering (contract only affects collection)', () => {
	test('a contract component renders via its runtime function under <Entity>', async () => {
		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }}>
				{article => (
					<div data-testid="tags">
						<ContractRepeater field={article.tags}>
							{tag => <span><Field field={tag.name} /> </span>}
						</ContractRepeater>
					</div>
				)}
			</Entity>,
		)

		await waitFor(() => {
			const text = container.querySelector('[data-testid="tags"]')?.textContent ?? ''
			expect(text).toContain('JavaScript')
			expect(text).toContain('React')
		})
	})
})
