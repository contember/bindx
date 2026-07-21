import type { ReactNode } from 'react'
import type { EntityRef, HasManyRef, HasOneRef } from './types.js'
import { HasMany } from './components/HasMany.js'
import { HasOne } from './components/HasOne.js'

/** Declares how a callback prop is invoked, so the analyzer can treat it like a HasMany/HasOne child. */
export interface CallbackContract {
	readonly kind: 'itemOf' | 'entityOf'
	readonly field: string
}

/** Maps a callback prop name (`children` included) to the relation it is invoked over. */
export type CollectorContract = Record<string, CallbackContract>

/** Symbol under which a contract is attached to a component for introspection. */
export const COLLECTOR_CONTRACT: unique symbol = Symbol('bindx.collectorContract')

/** Callback prop `field` receives each item of the has-many relation prop `field`. */
export function itemOf(field: string): CallbackContract {
	return { kind: 'itemOf', field }
}

/** Callback prop `field` receives the entity of the has-one relation prop `field`. */
export function entityOf(field: string): CallbackContract {
	return { kind: 'entityOf', field }
}

type RelationCallback = (value: EntityRef<unknown>) => ReactNode

// At the collection boundary props carry collector proxies; these predicates narrow them without `as`.
function isRelationCallback(value: unknown): value is RelationCallback {
	return typeof value === 'function'
}

function isHasManyRef(value: unknown): value is HasManyRef<unknown> {
	return typeof value === 'object' && value !== null
}

function isHasOneRef(value: unknown): value is HasOneRef<unknown> {
	return typeof value === 'object' && value !== null
}

/**
 * Derives a staticRender from a contract: one `<HasMany>`/`<HasOne>` per entry, replaying
 * the callback prop as its child. A missing callback still registers the relation with no
 * nested selection — mirroring HasMany/HasOne when their children collect nothing.
 */
export function deriveContractStaticRender(contract: CollectorContract): (props: Record<string, unknown>) => ReactNode {
	const entries = Object.entries(contract)
	return (props: Record<string, unknown>): ReactNode => (
		<>
			{entries.map(([callbackName, { kind, field }]) => {
				const fieldValue = props[field]
				const callbackValue = props[callbackName]
				const child = isRelationCallback(callbackValue) ? callbackValue : (): ReactNode => null

				if (kind === 'itemOf') {
					if (!isHasManyRef(fieldValue)) return null
					return <HasMany key={callbackName} field={fieldValue}>{item => child(item)}</HasMany>
				}
				if (!isHasOneRef(fieldValue)) return null
				return <HasOne key={callbackName} field={fieldValue}>{entity => child(entity)}</HasOne>
			})}
		</>
	)
}
