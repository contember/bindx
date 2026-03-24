import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { type ClassValue, clsx } from 'clsx'
import { type ComponentType, createElement, forwardRef, type ReactNode, useMemo } from 'react'
import { twMerge } from 'tailwind-merge'

type StringToBoolean<T> = T extends 'true' | 'false' ? boolean : T
type ConfigSchema = Record<string, Record<string, ClassValue>>

export type ConfigVariants<T extends ConfigSchema | undefined> = T extends ConfigSchema ? {
	[Variant in keyof T]?: StringToBoolean<keyof T[Variant]> | null | undefined;
} : object

type ConfigVariantsMulti<T extends ConfigSchema | undefined> = T extends ConfigSchema ? {
	[Variant in keyof T]?: StringToBoolean<keyof T[Variant]> | StringToBoolean<keyof T[Variant]>[] | undefined;
} : object

type DataAttrValue = boolean | string | number | undefined | null

export interface UicConfig<T extends ConfigSchema | undefined> {
	baseClass?: ClassValue
	variants?: T
	passVariantProps?: string[]
	defaultProps?: Record<string, unknown>
	defaultVariants?: ConfigVariants<T>
	compoundVariants?: ((ConfigVariants<T> | ConfigVariantsMulti<T>) & { className?: string })[]
	variantsAsDataAttrs?: (keyof ConfigVariants<T>)[]
	displayName?: string
	wrapOuter?: ComponentType<{ children?: ReactNode }>
	wrapInner?: ComponentType<{ children?: ReactNode }>
	beforeChildren?: ReactNode
	afterChildren?: ReactNode
	style?: React.CSSProperties
}

export const uiconfig = <T extends ConfigSchema | undefined>(config: UicConfig<T>): UicConfig<T> => config

export type NoInfer<T> = T & { [K in keyof T]: T[K] }

function dataAttribute(value: unknown): '' | undefined {
	return value ? '' : undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const uic = <El extends React.ElementType, Variants extends ConfigSchema | undefined = undefined>(
	Component: El,
	config: UicConfig<Variants>,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => {
	const cls = cva(config?.baseClass as string, {
		variants: config?.variants as Record<string, Record<string, ClassValue>> | undefined,
		defaultVariants: config?.defaultVariants as Record<string, string | null | undefined> | undefined,
		// CVA compound variant types use ClassProp which doesn't structurally match our generic ConfigVariants
		compoundVariants: config?.compoundVariants as never,
	})
	const passVariantProps = config?.passVariantProps ? new Set(config.passVariantProps) : undefined

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const component = forwardRef<unknown, any>((props, ref) => {
		const { className: classNameProp, children: childrenBase, ...rest } = props

		const variants: Record<string, string | undefined> = {}

		for (const key in config?.variants) {
			variants[key] = rest[key] as string | undefined
			if (key in rest && !passVariantProps?.has(key)) {
				delete rest[key]
			}
		}

		const dataAttrs: Record<string, '' | undefined> = {}
		if (config?.variantsAsDataAttrs && config.variants) {
			for (const key of config.variantsAsDataAttrs) {
				const keyAsString = key.toString()
				const variantValue = rest[key as string] ?? (config.defaultVariants as Record<string, unknown> | undefined)?.[key as string]
				dataAttrs[`data-${keyAsString}`] = dataAttribute(variantValue)
			}
		}
		const restStyle = rest['style'] as React.CSSProperties | undefined
		const style = useMemo(() => config?.style ? { ...config.style, ...(restStyle || {}) } : restStyle, [restStyle])
		const finalClassName = useMemo(() => twMerge(clsx(cls(variants), classNameProp)), [variants, classNameProp])

		let FinalComponent: React.ElementType = Component
		if (props['asChild'] && typeof Component === 'string') {
			FinalComponent = Slot
			delete rest['asChild']
		}

		let children = childrenBase
		if (config?.wrapInner) {
			children = createElement(config.wrapInner, props, children)
		}

		if (config?.beforeChildren || config?.afterChildren) {
			children = [
				config?.beforeChildren,
				children,
				config?.afterChildren,
			]
		}


		const innerEl = (
			<FinalComponent
				ref={ref}
				className={finalClassName}
				{...(config.defaultProps ?? {})}
				{...dataAttrs}
				{...rest}
				style={style}
			>
				{children}
			</FinalComponent>
		)
		return config?.wrapOuter ? createElement(config.wrapOuter, props, innerEl) : innerEl
	})
	component.displayName = config?.displayName

	return component
}
