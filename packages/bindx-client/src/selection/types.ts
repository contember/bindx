import type { ComponentBrand, AnyBrand } from '../brand/ComponentBrand.js'
import type { EntityWhere, EntityOrderBy } from './queryTypes.js'
import type { IsPlainObject } from '../utils/fieldShape.js'

/**
 * Symbol used to store selection metadata on builder objects
 */
export const SELECTION_META = Symbol('SELECTION_META')

/**
 * Options for has-many relation selection with typed filter/orderBy
 *
 * @typeParam TItem - The related entity type (array item type)
 * @typeParam TAlias - Optional alias for the field
 */
export interface HasManyOptions<
	TItem = unknown,
	TAlias extends string = string,
> {
	as?: TAlias
	filter?: EntityWhere<TItem>
	orderBy?: readonly EntityOrderBy<TItem>[]
	limit?: number
	offset?: number
	totalCount?: boolean
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
		totalCount?: boolean
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
type ArrayItemType<T> = T extends readonly (infer U)[] ? U : never

/**
 * A fragment defined with the fluent builder
 *
 * @typeParam TModel - The entity model type
 * @typeParam TResult - The selected fields result type
 * @typeParam TBrand - Component brand type for validation (defaults to AnyBrand)
 * @typeParam TSourceSelected - The selection keyed by source field names (see {@link SelectionBuilder});
 *   `unknown` when not known, see {@link FragmentSourceSelected}
 */
export interface FluentFragment<
	TModel,
	TResult,
	TBrand extends AnyBrand = AnyBrand,
	TSourceSelected = unknown,
> {
	/** Runtime metadata */
	readonly __meta: SelectionMeta
	/** Type brand for result type */
	readonly __resultType: TResult
	/** Type brand for model type */
	readonly __modelType: TModel
	/** Type brand for the selection keyed by source field names */
	readonly __sourceSelected?: TSourceSelected
	/** Marker for type checking */
	readonly __isFragment: true
	/** Component brand for type-level tracking */
	readonly __brand?: TBrand
	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>
	/** Runtime roles for validation */
	readonly __roles?: readonly string[]
}

/**
 * The source-keyed selection of a fragment. A fragment typed without one (`FluentFragment<T, R>`)
 * requires its result fields.
 */
export type FragmentSourceSelected<TResult, TSourceSelected> = unknown extends TSourceSelected ? TResult : TSourceSelected

/**
 * Scalar method on selection builder - selects a scalar field
 */
// TEntity is declared `in out` on all three *Method interfaces. Measured instead, it cycles through the `-?` mapped
// type in SelectionBuilderMethods and comes out unmeasurable, so TypeScript 7.1 compares builders structurally:
// quadratic in the entity's field count, TS2589 on large schemas.
export interface ScalarMethod<
	in out TEntity,
	K extends keyof TEntity,
	TSelected extends object,
	THasManyParams extends object,
	TSourceSelected extends object,
> {
	/** Select field with original name */
	(): SelectionBuilder<TEntity, TSelected & Pick<TEntity, K>, THasManyParams, TSourceSelected & Pick<TEntity, K>>
	/** Select field with alias */
	<TAlias extends string>(options: { as: TAlias }): SelectionBuilder<
		TEntity,
		TSelected & { [P in TAlias]: TEntity[K] },
		THasManyParams,
		TSourceSelected & Pick<TEntity, K>
	>
}

/**
 * Has-one method on selection builder - selects a relation to single entity.
 * Every overload keeps the relation under its field name in TSourceSelected, also when aliased.
 */
export interface HasOneMethod<
	in out TEntity, // see ScalarMethod
	K extends keyof TEntity,
	TRelated,
	TSelected extends object,
	THasManyParams extends object,
	TSourceSelected extends object,
> {
	/** Select with inline callback */
	<TNestedSelected extends object, TNestedSource extends object>(
		selector: (builder: SelectionBuilder<TRelated>) => SelectionBuilder<TRelated, TNestedSelected, object, TNestedSource>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: TNestedSelected },
		THasManyParams,
		TSourceSelected & { [P in K & string]: TNestedSource }
	>

	/** Select with fragment */
	<TFragmentResult extends object, TFragmentSource>(
		fragment: FluentFragment<TRelated, TFragmentResult, AnyBrand, TFragmentSource>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: TFragmentResult },
		THasManyParams,
		TSourceSelected & { [P in K & string]: FragmentSourceSelected<TFragmentResult, TFragmentSource> }
	>

	/** Select with multiple fragments (merged) - result type is intersection of all fragment result types */
	<T1 extends object, T2 extends object, S1, S2>(
		fragment1: FluentFragment<TRelated, T1, AnyBrand, S1>,
		fragment2: FluentFragment<TRelated, T2, AnyBrand, S2>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: T1 & T2 },
		THasManyParams,
		TSourceSelected & { [P in K & string]: FragmentSourceSelected<T1, S1> & FragmentSourceSelected<T2, S2> }
	>

	/** Select with three fragments (merged) */
	<T1 extends object, T2 extends object, T3 extends object, S1, S2, S3>(
		fragment1: FluentFragment<TRelated, T1, AnyBrand, S1>,
		fragment2: FluentFragment<TRelated, T2, AnyBrand, S2>,
		fragment3: FluentFragment<TRelated, T3, AnyBrand, S3>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: T1 & T2 & T3 },
		THasManyParams,
		TSourceSelected & { [P in K & string]: FragmentSourceSelected<T1, S1> & FragmentSourceSelected<T2, S2> & FragmentSourceSelected<T3, S3> }
	>

	/** Select with alias and callback */
	<TAlias extends string, TNestedSelected extends object, TNestedSource extends object>(
		options: { as: TAlias },
		selector: (builder: SelectionBuilder<TRelated>) => SelectionBuilder<TRelated, TNestedSelected, object, TNestedSource>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in TAlias]: TNestedSelected },
		THasManyParams,
		TSourceSelected & { [P in K & string]: TNestedSource }
	>

	/** Select with alias and fragment */
	<TAlias extends string, TFragmentResult extends object, TFragmentSource>(
		options: { as: TAlias },
		fragment: FluentFragment<TRelated, TFragmentResult, AnyBrand, TFragmentSource>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in TAlias]: TFragmentResult },
		THasManyParams,
		TSourceSelected & { [P in K & string]: FragmentSourceSelected<TFragmentResult, TFragmentSource> }
	>

	/** Select with alias and two fragments (merged) */
	<TAlias extends string, T1 extends object, T2 extends object, S1, S2>(
		options: { as: TAlias },
		fragment1: FluentFragment<TRelated, T1, AnyBrand, S1>,
		fragment2: FluentFragment<TRelated, T2, AnyBrand, S2>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in TAlias]: T1 & T2 },
		THasManyParams,
		TSourceSelected & { [P in K & string]: FragmentSourceSelected<T1, S1> & FragmentSourceSelected<T2, S2> }
	>

	/** Select with alias and three fragments (merged) */
	<
		TAlias extends string,
		T1 extends object,
		T2 extends object,
		T3 extends object,
		S1,
		S2,
		S3,
	>(
		options: { as: TAlias },
		fragment1: FluentFragment<TRelated, T1, AnyBrand, S1>,
		fragment2: FluentFragment<TRelated, T2, AnyBrand, S2>,
		fragment3: FluentFragment<TRelated, T3, AnyBrand, S3>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in TAlias]: T1 & T2 & T3 },
		THasManyParams,
		TSourceSelected & { [P in K & string]: FragmentSourceSelected<T1, S1> & FragmentSourceSelected<T2, S2> & FragmentSourceSelected<T3, S3> }
	>
}

/**
 * Resolve alias from options or fall back to field name
 */
type ResolveAlias<K, TOptions> = TOptions extends { as: infer A extends string } ? A : K & string

/**
 * Has-many method on selection builder - selects a relation to multiple entities.
 * Every overload keeps the relation under its field name in TSourceSelected, also when aliased.
 */
export interface HasManyMethod<
	in out TEntity, // see ScalarMethod
	K extends keyof TEntity,
	TItem,
	TSelected extends object,
	THasManyParams extends object,
	TSourceSelected extends object,
> {
	/** Select with inline callback (no options) */
	<TNestedSelected extends object, TNestedSource extends object>(
		selector: (builder: SelectionBuilder<TItem>) => SelectionBuilder<TItem, TNestedSelected, object, TNestedSource>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: TNestedSelected[] },
		THasManyParams & { [P in K & string]: object },
		TSourceSelected & { [P in K & string]: TNestedSource[] }
	>

	/** Select with fragment (no options) */
	<TFragmentResult extends object, TFragmentSource>(
		fragment: FluentFragment<TItem, TFragmentResult, AnyBrand, TFragmentSource>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: TFragmentResult[] },
		THasManyParams & { [P in K & string]: object },
		TSourceSelected & { [P in K & string]: FragmentSourceSelected<TFragmentResult, TFragmentSource>[] }
	>

	/** Select with two fragments (merged, no options) */
	<T1 extends object, T2 extends object, S1, S2>(
		fragment1: FluentFragment<TItem, T1, AnyBrand, S1>,
		fragment2: FluentFragment<TItem, T2, AnyBrand, S2>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: (T1 & T2)[] },
		THasManyParams & { [P in K & string]: object },
		TSourceSelected & { [P in K & string]: (FragmentSourceSelected<T1, S1> & FragmentSourceSelected<T2, S2>)[] }
	>

	/** Select with three fragments (merged, no options) */
	<T1 extends object, T2 extends object, T3 extends object, S1, S2, S3>(
		fragment1: FluentFragment<TItem, T1, AnyBrand, S1>,
		fragment2: FluentFragment<TItem, T2, AnyBrand, S2>,
		fragment3: FluentFragment<TItem, T3, AnyBrand, S3>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in K & string]: (T1 & T2 & T3)[] },
		THasManyParams & { [P in K & string]: object },
		TSourceSelected & { [P in K & string]: (FragmentSourceSelected<T1, S1> & FragmentSourceSelected<T2, S2> & FragmentSourceSelected<T3, S3>)[] }
	>

	/** Select with options and callback */
	<TOptions extends HasManyOptions<TItem>, TNestedSelected extends object, TNestedSource extends object>(
		options: TOptions,
		selector: (builder: SelectionBuilder<TItem>) => SelectionBuilder<TItem, TNestedSelected, object, TNestedSource>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in ResolveAlias<K, TOptions>]: TNestedSelected[] },
		THasManyParams & { [P in ResolveAlias<K, TOptions>]: TOptions },
		TSourceSelected & { [P in K & string]: TNestedSource[] }
	>

	/** Select with options and fragment */
	<TOptions extends HasManyOptions<TItem>, TFragmentResult extends object, TFragmentSource>(
		options: TOptions,
		fragment: FluentFragment<TItem, TFragmentResult, AnyBrand, TFragmentSource>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in ResolveAlias<K, TOptions>]: TFragmentResult[] },
		THasManyParams & { [P in ResolveAlias<K, TOptions>]: TOptions },
		TSourceSelected & { [P in K & string]: FragmentSourceSelected<TFragmentResult, TFragmentSource>[] }
	>

	/** Select with options and two fragments (merged) */
	<TOptions extends HasManyOptions<TItem>, T1 extends object, T2 extends object, S1, S2>(
		options: TOptions,
		fragment1: FluentFragment<TItem, T1, AnyBrand, S1>,
		fragment2: FluentFragment<TItem, T2, AnyBrand, S2>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in ResolveAlias<K, TOptions>]: (T1 & T2)[] },
		THasManyParams & { [P in ResolveAlias<K, TOptions>]: TOptions },
		TSourceSelected & { [P in K & string]: (FragmentSourceSelected<T1, S1> & FragmentSourceSelected<T2, S2>)[] }
	>

	/** Select with options and three fragments (merged) */
	<
		TOptions extends HasManyOptions<TItem>,
		T1 extends object,
		T2 extends object,
		T3 extends object,
		S1,
		S2,
		S3,
	>(
		options: TOptions,
		fragment1: FluentFragment<TItem, T1, AnyBrand, S1>,
		fragment2: FluentFragment<TItem, T2, AnyBrand, S2>,
		fragment3: FluentFragment<TItem, T3, AnyBrand, S3>,
	): SelectionBuilder<
		TEntity,
		TSelected & { [P in ResolveAlias<K, TOptions>]: (T1 & T2 & T3)[] },
		THasManyParams & { [P in ResolveAlias<K, TOptions>]: TOptions },
		TSourceSelected & { [P in K & string]: (FragmentSourceSelected<T1, S1> & FragmentSourceSelected<T2, S2> & FragmentSourceSelected<T3, S3>)[] }
	>
}

/**
 * Maps entity fields to their corresponding builder methods
 */
type SelectionBuilderMethods<
	TEntity,
	TSelected extends object,
	THasManyParams extends object,
	TSourceSelected extends object,
> = {
	[K in keyof TEntity]-?: NonNullable<TEntity[K]> extends readonly (infer U)[]
		? IsPlainObject<U> extends true
			? HasManyMethod<TEntity, K, U, TSelected, THasManyParams, TSourceSelected>
			: ScalarMethod<TEntity, K, TSelected, THasManyParams, TSourceSelected>
		: NonNullable<TEntity[K]> extends object
			? HasOneMethod<TEntity, K, NonNullable<TEntity[K]>, TSelected, THasManyParams, TSourceSelected>
			: ScalarMethod<TEntity, K, TSelected, THasManyParams, TSourceSelected>
}

/**
 * The main fluent selection builder interface.
 *
 * @typeParam TEntity - The entity type being selected from
 * @typeParam TSelected - Accumulated type of selected fields (grows with each selection)
 * @typeParam THasManyParams - Record tracking has-many parameters for alias consistency
 * @typeParam TSourceSelected - The same selection keyed by source field names instead of aliases:
 *   the fields a ref must have selected to satisfy it
 *
 * @example
 * ```ts
 * // Select scalar fields
 * e.id().title().content()
 * // Type: { id: string, title: string, content: string }
 *
 * // Select with alias
 * e.title({ as: 'headline' })
 * // Type: { headline: string }, source: { title: string }
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
export type SelectionBuilder<
	TEntity,
	TSelected extends object = object,
	THasManyParams extends object = object,
	TSourceSelected extends object = object,
> =
	SelectionBuilderMethods<TEntity, TSelected, THasManyParams, TSourceSelected> & {
		[SELECTION_META]: SelectionMeta
		/** Type brand for the selected result */
		readonly __selected: TSelected
		/** Type brand for the selection keyed by source field names */
		readonly __sourceSelected: TSourceSelected
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
