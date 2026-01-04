/**
 * Symbol used to store selection metadata on builder objects
 */
export const SELECTION_META = Symbol('SELECTION_META')

/**
 * Options for has-many relation selection
 */
export interface HasManyOptions<
	TAlias extends string = string,
	TFilter = unknown,
	TOrderBy = unknown,
> {
	as?: TAlias
	filter?: TFilter
	orderBy?: TOrderBy
	limit?: number
	offset?: number
}

/**
 * Metadata for a selected field (runtime)
 */
export interface SelectionFieldMeta {
	/** Original field name in the entity */
	fieldName: string
	/** Alias (output key) - defaults to fieldName */
	alias: string
	/** Full path to this field (for JSX components) */
	path: string[]
	/** Whether this is a relation (has nested fields) */
	isRelation: boolean
	/** Whether this is an array/has-many relation */
	isArray: boolean
	/** For relations: nested selection metadata */
	nested?: SelectionMeta
	/** For has-many: additional parameters */
	hasManyParams?: {
		filter?: unknown
		orderBy?: unknown
		limit?: number
		offset?: number
	}
}

/**
 * Runtime metadata for a complete selection
 */
export interface SelectionMeta {
	fields: Map<string, SelectionFieldMeta>
}

/**
 * Extract item type from array
 */
type ArrayItemType<T> = T extends Array<infer U> ? U : never

/**
 * A fragment defined with the fluent builder
 */
export interface FluentFragment<TModel, TResult> {
	/** Runtime metadata */
	readonly __meta: SelectionMeta
	/** Type brand for result type */
	readonly __resultType: TResult
	/** Type brand for model type */
	readonly __modelType: TModel
	/** Marker for type checking */
	readonly __isFragment: true
}

/**
 * Scalar method on selection builder - selects a scalar field
 */
export interface ScalarMethod<TEntity, K extends keyof TEntity, TSelected extends object, THasManyParams extends object> {
	/** Select field with original name */
	(): SelectionBuilder<TEntity, TSelected & Pick<TEntity, K>, THasManyParams>
	/** Select field with alias */
	<TAlias extends string>(options: { as: TAlias }): SelectionBuilder<
		TEntity,
		TSelected & { [P in TAlias]: TEntity[K] },
		THasManyParams
	>
}

/**
 * Has-one method on selection builder - selects a relation to single entity
 */
export interface HasOneMethod<
	TEntity,
	K extends keyof TEntity,
	TRelated,
	TSelected extends object,
	THasManyParams extends object,
> {
	/** Select with inline callback */
	<TNestedSelected extends object>(
		selector: (builder: SelectionBuilder<TRelated>) => SelectionBuilder<TRelated, TNestedSelected, object>,
	): SelectionBuilder<TEntity, TSelected & { [P in K & string]: TNestedSelected }, THasManyParams>

	/** Select with fragment */
	<TFragmentResult extends object>(
		fragment: FluentFragment<TRelated, TFragmentResult>,
	): SelectionBuilder<TEntity, TSelected & { [P in K & string]: TFragmentResult }, THasManyParams>

	/** Select with multiple fragments (merged) - result type is intersection of all fragment result types */
	<T1 extends object, T2 extends object>(
		fragment1: FluentFragment<TRelated, T1>,
		fragment2: FluentFragment<TRelated, T2>,
	): SelectionBuilder<TEntity, TSelected & { [P in K & string]: T1 & T2 }, THasManyParams>

	/** Select with three fragments (merged) */
	<T1 extends object, T2 extends object, T3 extends object>(
		fragment1: FluentFragment<TRelated, T1>,
		fragment2: FluentFragment<TRelated, T2>,
		fragment3: FluentFragment<TRelated, T3>,
	): SelectionBuilder<TEntity, TSelected & { [P in K & string]: T1 & T2 & T3 }, THasManyParams>

	/** Select with alias and callback */
	<TAlias extends string, TNestedSelected extends object>(
		options: { as: TAlias },
		selector: (builder: SelectionBuilder<TRelated>) => SelectionBuilder<TRelated, TNestedSelected, object>,
	): SelectionBuilder<TEntity, TSelected & { [P in TAlias]: TNestedSelected }, THasManyParams>

	/** Select with alias and fragment */
	<TAlias extends string, TFragmentResult extends object>(
		options: { as: TAlias },
		fragment: FluentFragment<TRelated, TFragmentResult>,
	): SelectionBuilder<TEntity, TSelected & { [P in TAlias]: TFragmentResult }, THasManyParams>

	/** Select with alias and two fragments (merged) */
	<TAlias extends string, T1 extends object, T2 extends object>(
		options: { as: TAlias },
		fragment1: FluentFragment<TRelated, T1>,
		fragment2: FluentFragment<TRelated, T2>,
	): SelectionBuilder<TEntity, TSelected & { [P in TAlias]: T1 & T2 }, THasManyParams>

	/** Select with alias and three fragments (merged) */
	<TAlias extends string, T1 extends object, T2 extends object, T3 extends object>(
		options: { as: TAlias },
		fragment1: FluentFragment<TRelated, T1>,
		fragment2: FluentFragment<TRelated, T2>,
		fragment3: FluentFragment<TRelated, T3>,
	): SelectionBuilder<TEntity, TSelected & { [P in TAlias]: T1 & T2 & T3 }, THasManyParams>
}

/**
 * Resolve alias from options or fall back to field name
 */
type ResolveAlias<K, TOptions> = TOptions extends { as: infer A extends string } ? A : K & string

/**
 * Has-many method on selection builder - selects a relation to multiple entities
 */
export interface HasManyMethod<
	TEntity,
	K extends keyof TEntity,
	TItem,
	TSelected extends object,
	THasManyParams extends object,
> {
	/** Select with inline callback (no options) */
	<TNestedSelected extends object>(
		selector: (builder: SelectionBuilder<TItem>) => SelectionBuilder<TItem, TNestedSelected, object>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: TNestedSelected[] },
		THasManyParams & { [P in K & string]: object }
	>

	/** Select with fragment (no options) */
	<TFragmentResult extends object>(
		fragment: FluentFragment<TItem, TFragmentResult>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: TFragmentResult[] },
		THasManyParams & { [P in K & string]: object }
	>

	/** Select with two fragments (merged, no options) */
	<T1 extends object, T2 extends object>(
		fragment1: FluentFragment<TItem, T1>,
		fragment2: FluentFragment<TItem, T2>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: (T1 & T2)[] },
		THasManyParams & { [P in K & string]: object }
	>

	/** Select with three fragments (merged, no options) */
	<T1 extends object, T2 extends object, T3 extends object>(
		fragment1: FluentFragment<TItem, T1>,
		fragment2: FluentFragment<TItem, T2>,
		fragment3: FluentFragment<TItem, T3>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: (T1 & T2 & T3)[] },
		THasManyParams & { [P in K & string]: object }
	>

	/** Select with options and callback */
	<TOptions extends HasManyOptions, TNestedSelected extends object>(
		options: TOptions,
		selector: (builder: SelectionBuilder<TItem>) => SelectionBuilder<TItem, TNestedSelected, object>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in ResolveAlias<K, TOptions>]: TNestedSelected[] },
		THasManyParams & { [P in ResolveAlias<K, TOptions>]: TOptions }
	>

	/** Select with options and fragment */
	<TOptions extends HasManyOptions, TFragmentResult extends object>(
		options: TOptions,
		fragment: FluentFragment<TItem, TFragmentResult>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in ResolveAlias<K, TOptions>]: TFragmentResult[] },
		THasManyParams & { [P in ResolveAlias<K, TOptions>]: TOptions }
	>

	/** Select with options and two fragments (merged) */
	<TOptions extends HasManyOptions, T1 extends object, T2 extends object>(
		options: TOptions,
		fragment1: FluentFragment<TItem, T1>,
		fragment2: FluentFragment<TItem, T2>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in ResolveAlias<K, TOptions>]: (T1 & T2)[] },
		THasManyParams & { [P in ResolveAlias<K, TOptions>]: TOptions }
	>

	/** Select with options and three fragments (merged) */
	<TOptions extends HasManyOptions, T1 extends object, T2 extends object, T3 extends object>(
		options: TOptions,
		fragment1: FluentFragment<TItem, T1>,
		fragment2: FluentFragment<TItem, T2>,
		fragment3: FluentFragment<TItem, T3>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in ResolveAlias<K, TOptions>]: (T1 & T2 & T3)[] },
		THasManyParams & { [P in ResolveAlias<K, TOptions>]: TOptions }
	>
}

/**
 * Maps entity fields to their corresponding builder methods
 */
type SelectionBuilderMethods<TEntity, TSelected extends object, THasManyParams extends object> = {
	[K in keyof TEntity]-?: TEntity[K] extends Array<infer U>
		? HasManyMethod<TEntity, K, U, TSelected, THasManyParams>
		: NonNullable<TEntity[K]> extends object
			? HasOneMethod<TEntity, K, NonNullable<TEntity[K]>, TSelected, THasManyParams>
			: ScalarMethod<TEntity, K, TSelected, THasManyParams>
}

/**
 * The main fluent selection builder interface.
 *
 * @typeParam TEntity - The entity type being selected from
 * @typeParam TSelected - Accumulated type of selected fields (grows with each selection)
 * @typeParam THasManyParams - Record tracking has-many parameters for alias consistency
 *
 * @example
 * ```ts
 * // Select scalar fields
 * e.id().title().content()
 * // Type: { id: string, title: string, content: string }
 *
 * // Select with alias
 * e.title({ as: 'headline' })
 * // Type: { headline: string }
 *
 * // Select has-one relation
 * e.author(a => a.name().email())
 * // Type: { author: { name: string, email: string } }
 *
 * // Select has-many with options
 * e.tags({ filter: { active: true } }, t => t.name())
 * // Type: { tags: { name: string }[] }
 * ```
 */
export type SelectionBuilder<TEntity, TSelected extends object = object, THasManyParams extends object = object> =
	SelectionBuilderMethods<TEntity, TSelected, THasManyParams> & {
		[SELECTION_META]: SelectionMeta
		/** Type brand for the selected result */
		readonly __selected: TSelected
	}

/**
 * Extracts the selected type from a SelectionBuilder
 */
export type InferSelection<T> = T extends SelectionBuilder<infer _E, infer S, infer _P> ? S : never

/**
 * Type for the fluent definer function used in useEntity/useEntityList
 */
export type FluentDefiner<TModel, TResult extends object> = (
	builder: SelectionBuilder<TModel>,
) => SelectionBuilder<TModel, TResult, object>
