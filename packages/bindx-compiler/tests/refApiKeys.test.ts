/**
 * The compiler's list of field-ref API names must match what the runtime collector's field ref
 * answers itself; a name missing here would be fetched as a field of a non-has-one relation.
 */
import { describe, expect, test } from 'bun:test'
import { SelectionScope } from '@contember/bindx'
import { createCollectorProxy } from '@contember/bindx-react'
import { FIELD_REF_API_KEYS } from '../src/resolve.js'

describe('FIELD_REF_API_KEYS', () => {
	test('equals the collector field ref properties, meta names excluded', () => {
		const entity = createCollectorProxy(new SelectionScope())
		const fieldRef: object = Reflect.get(entity, 'title')
		const apiKeys = Object.keys(fieldRef).filter(key => key !== 'id' && !key.startsWith('$') && !key.startsWith('__'))
		expect([...FIELD_REF_API_KEYS].sort()).toEqual(apiKeys.sort())
	})
})
