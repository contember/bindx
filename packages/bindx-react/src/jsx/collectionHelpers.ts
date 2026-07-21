/**
 * Shared building blocks for the selection collection pass — used by both the
 * runtime proxy collector (componentFactory) and compiled-selection/hole
 * resolution (compiledSelection). Extracted to keep a clean module boundary
 * and avoid a cycle between those two.
 */
import type { FluentFragment, SelectionMeta, AnyBrand } from '@contember/bindx'
import { ComponentBrand } from '@contember/bindx'

/**
 * Creates a FluentFragment from selection metadata.
 */
export function createFragment(
	selection: SelectionMeta,
	componentBrand: ComponentBrand,
	roles: readonly string[],
): FluentFragment<unknown, object, AnyBrand> {
	return {
		__meta: selection,
		__resultType: {} as object,
		__modelType: undefined as unknown,
		__isFragment: true,
		__brand: componentBrand,
		__brands: new Set([componentBrand.brandSymbol]),
		__roles: roles.length > 0 ? roles : undefined,
	}
}

/**
 * Creates a tolerant stand-in for scalar (non-entity) props during collection.
 * Render bodies may call it (`t('key')`), read nested properties
 * (`labels.heading`) or coerce it to a primitive — all are no-ops so the
 * collection pass keeps capturing entity field accesses (see issue #57).
 */
export function createScalarPropMock(): unknown {
	const mock: unknown = new Proxy(function () {}, {
		get(_target, prop): unknown {
			if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
				return (): string => ''
			}
			if (prop === Symbol.iterator) {
				return function* (): Generator<never> {}
			}
			// undefined keeps JSON.stringify from recursing via a callable toJSON
			if (prop === 'toJSON') {
				return undefined
			}
			return mock
		},
		apply(): unknown {
			return mock
		},
	})
	return mock
}
