/**
 * ComponentBrand provides unique identity for each component created with createComponent.
 * Each instance has a unique runtime Symbol for brand validation.
 * The class structure itself provides nominal typing in TypeScript.
 */
export class ComponentBrand {
	/**
	 * Private property to ensure nominal typing.
	 * Each class instance is considered a unique type.
	 */
	private readonly __nominal = true

	/**
	 * Runtime symbol for brand validation.
	 * Used to check that EntityRef includes required component brands.
	 */
	readonly brandSymbol: symbol

	constructor(public readonly name: string) {
		this.brandSymbol = Symbol(`component_${name}_${Math.random().toString(36).slice(2)}`)
	}
}

/**
 * Type alias for any ComponentBrand.
 * Used as default/base type in generic constraints.
 */
export type AnyBrand = ComponentBrand
