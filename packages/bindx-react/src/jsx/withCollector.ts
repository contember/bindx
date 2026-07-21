import type { ReactNode } from 'react'
import type { CollectorContract } from './collectorContract.js'
import { COLLECTOR_CONTRACT, deriveContractStaticRender } from './collectorContract.js'

/**
 * Attaches a static render function to a component for selection collection.
 *
 * During the collection phase, the analyzer calls `staticRender(props)` instead of
 * analyzing runtime children. Props contain collector proxies, so field accesses
 * are tracked automatically. The returned JSX is analyzed for nested components.
 *
 * @example
 * ```tsx
 * // Simple: children is a render prop receiving has-one entity
 * export const SelectField = withCollector(
 *   function SelectField({ field, children, ... }) { ... },
 *   (props) => props.children(props.field.$entity)
 * )
 *
 * // Composing with HasMany for iteration
 * export const DefaultRepeater = withCollector(
 *   function DefaultRepeater({ field, children, ... }) { ... },
 *   (props) => (
 *     <HasMany field={props.field}>
 *       {item => props.children(item, collectionItemInfo)}
 *     </HasMany>
 *   )
 * )
 *
 * // Declarative contract instead of a hand-written staticRender: `children` is invoked
 * // per item of the `field` has-many relation. The staticRender is derived automatically.
 * export const InitializingRepeater = withCollector(
 *   function InitializingRepeater({ field, children, ... }) { ... },
 *   { children: itemOf('field') }
 * )
 * ```
 */
export function withCollector<TComponent extends (...args: never[]) => ReactNode>(
	component: TComponent,
	staticRender: (props: Parameters<TComponent>[0]) => ReactNode,
): TComponent
export function withCollector<TComponent extends (...args: never[]) => ReactNode>(
	component: TComponent,
	contract: CollectorContract,
): TComponent
export function withCollector<TComponent extends (...args: never[]) => ReactNode>(
	component: TComponent,
	contractOrStaticRender: ((props: Parameters<TComponent>[0]) => ReactNode) | CollectorContract,
): TComponent {
	// A function is a staticRender; a plain object is a declarative contract.
	if (typeof contractOrStaticRender === 'function') {
		const staticRender = contractOrStaticRender
		;(component as TComponent & { staticRender: typeof staticRender }).staticRender = staticRender
		return component
	}

	const contract = contractOrStaticRender
	const staticRender = deriveContractStaticRender(contract)
	const target = component as TComponent & {
		staticRender: typeof staticRender
		[COLLECTOR_CONTRACT]: CollectorContract
	}
	target.staticRender = staticRender
	target[COLLECTOR_CONTRACT] = contract
	return component
}
