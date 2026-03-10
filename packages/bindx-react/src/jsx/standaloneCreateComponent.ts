/**
 * Standalone createComponent function.
 *
 * Unlike the old createBindx()-returned createComponent, this function
 * does not need a schema-bound closure. The SchemaRegistry is passed as null
 * and components resolve it from context at render time if needed.
 */

import type {
	ComponentBuilder,
	ComponentBuilderState,
	CreateComponentOptions,
} from './componentBuilder.types.js'
import { createComponentBuilder } from './componentBuilder.js'

/**
 * Creates a component builder for defining bindx components.
 *
 * @example
 * ```typescript
 * import { createComponent } from '@contember/bindx-react'
 * import { schema } from './generated'
 *
 * const ArticleCard = createComponent()
 *   .entity('article', schema.Article, e => e.title().author(a => a.name()))
 *   .props<{ className?: string }>()
 *   .render(({ article, className }) => (
 *     <div className={className}>
 *       <h2>{article.$data?.title}</h2>
 *       <span>{article.$data?.author?.name}</span>
 *     </div>
 *   ))
 * ```
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function createComponent(): ComponentBuilder<ComponentBuilderState<{}, object, readonly string[]>>
export function createComponent<TRoles extends readonly string[]>(
	options: CreateComponentOptions<TRoles>,
// eslint-disable-next-line @typescript-eslint/ban-types
): ComponentBuilder<ComponentBuilderState<{}, object, TRoles>>
export function createComponent(options?: CreateComponentOptions<readonly string[]>): ComponentBuilder<ComponentBuilderState> {
	const roles = options?.roles ?? []
	return createComponentBuilder(
		null,
		roles,
	)
}
