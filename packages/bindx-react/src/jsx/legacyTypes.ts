/**
 * Legacy type exports for backwards compatibility.
 * These types were previously exported from createComponent.ts
 */

import type { EntityRef, FluentFragment } from '@contember/bindx'

/**
 * Extract keys from props type where value is EntityRef<any, any>
 */
export type EntityPropKeys<P> = {
	[K in keyof P]: P[K] extends EntityRef<infer _T, infer _S> ? K : never
}[keyof P]

/**
 * Extract the full entity type from an EntityRef prop
 */
export type EntityFromProp<P, K extends keyof P> = P[K] extends EntityRef<infer T, infer _S> ? T : never

/**
 * Extract the selection type from an EntityRef prop
 */
export type SelectionFromProp<P, K extends keyof P> = P[K] extends EntityRef<infer _T, infer S> ? S : never

/**
 * Fragment properties for implicit mode - $propName for each entity prop
 */
export type ImplicitFragmentProperties<P> = {
	[K in EntityPropKeys<P> as `$${K & string}`]: FluentFragment<EntityFromProp<P, K>, SelectionFromProp<P, K>>
}
