import { describe, test, expect } from 'bun:test'
import { renderHook } from '@testing-library/react'
import { type ReactNode } from 'react'
import {
	BindxUIDefaultsProvider,
	useComponentDefaults,
} from '../../../packages/bindx-ui/src/defaults/BindxUIDefaults.js'

describe('BindxUIDefaults', () => {
	test('returns empty object when no provider', () => {
		const { result } = renderHook(() => useComponentDefaults('Button'))
		expect(result.current).toEqual({})
	})

	test('returns defaults from provider', () => {
		const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
			<BindxUIDefaultsProvider defaults={{ Button: { size: 'sm', variant: 'outline' } }}>
				{children}
			</BindxUIDefaultsProvider>
		)

		const { result } = renderHook(() => useComponentDefaults<{ size: string; variant: string }>('Button'), {
			wrapper,
		})

		expect(result.current).toEqual({ size: 'sm', variant: 'outline' })
	})

	test('returns empty object for unregistered component', () => {
		const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
			<BindxUIDefaultsProvider defaults={{ Button: { size: 'sm' } }}>
				{children}
			</BindxUIDefaultsProvider>
		)

		const { result } = renderHook(() => useComponentDefaults('Input'), { wrapper })
		expect(result.current).toEqual({})
	})

	test('nested providers merge defaults', () => {
		const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
			<BindxUIDefaultsProvider defaults={{ Button: { size: 'sm' }, Input: { type: 'text' } }}>
				<BindxUIDefaultsProvider defaults={{ Button: { variant: 'outline' } }}>
					{children}
				</BindxUIDefaultsProvider>
			</BindxUIDefaultsProvider>
		)

		const { result: buttonResult } = renderHook(
			() => useComponentDefaults<{ size: string; variant: string }>('Button'),
			{ wrapper },
		)
		// Inner provider merges with outer: size from outer + variant from inner
		expect(buttonResult.current).toEqual({ size: 'sm', variant: 'outline' })

		const { result: inputResult } = renderHook(
			() => useComponentDefaults<{ type: string }>('Input'),
			{ wrapper },
		)
		// Input only defined in outer, should propagate through
		expect(inputResult.current).toEqual({ type: 'text' })
	})

	test('nested provider overrides parent for same key', () => {
		const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
			<BindxUIDefaultsProvider defaults={{ Button: { size: 'lg' } }}>
				<BindxUIDefaultsProvider defaults={{ Button: { size: 'sm' } }}>
					{children}
				</BindxUIDefaultsProvider>
			</BindxUIDefaultsProvider>
		)

		const { result } = renderHook(() => useComponentDefaults<{ size: string }>('Button'), { wrapper })
		expect(result.current).toEqual({ size: 'sm' })
	})
})
