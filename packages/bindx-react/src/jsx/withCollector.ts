import type { ReactNode } from 'react'

/**
 * Attaches a static render function to a component for selection collection.
 *
 * During the collection phase, the analyzer calls `staticRender(props)` instead of
 * analyzing runtime children. Props contain collector proxies, so field accesses
 * are tracked automatically. The returned JSX is analyzed for nested components.
 *
 * When called with a single argument, the component function itself is used as
 * staticRender. This works when the component is pure JSX (no hooks) and delegates
 * to an inner component that has its own `getSelection`.
 *
 * @example
 * ```tsx
 * // Single-arg: component IS the staticRender (no hooks, delegates to inner)
 * export const StyledRepeater = withCollector(
 *   function StyledRepeater({ field, children }) {
 *     return (
 *       <RepeaterCore field={field}>
 *         {(items) => <div>{items.map((e, info) => children(e, info))}</div>}
 *       </RepeaterCore>
 *     )
 *   }
 * )
 *
 * // Two-arg: explicit staticRender for components with hooks or custom collection
 * export const SelectField = withCollector(
 *   function SelectField({ field, children }) { ... },
 *   (props) => props.children(props.field.$entity)
 * )
 * ```
 */
export function withCollector<TComponent extends (...args: never[]) => ReactNode>(
	component: TComponent,
	staticRender?: (props: Parameters<TComponent>[0]) => ReactNode,
): TComponent {
	const render = staticRender ?? component as unknown as (props: Parameters<TComponent>[0]) => ReactNode
	;(component as TComponent & { staticRender: typeof render }).staticRender = render
	return component
}
