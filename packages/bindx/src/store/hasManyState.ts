/**
 * The has-many state algebra: the stored shape plus every pure function over it.
 *
 * Separated from {@link HasManyStore}, which owns the keyed map, the write
 * chokepoint and the three indexes. Nothing here touches the store's state.
 *
 * ## Reads are per view, writes are per relation
 *
 * A has-many selected with params (filter/orderBy/limit/offset) is fetched under an
 * auto-generated alias (`tags_a7x9k2`), and several such VIEWS of one relation can be
 * mounted at once. What the server returned differs per view, so {@link HasManyView}
 * is keyed by alias. The pending mutations do NOT: the backend has one `tags` relation
 * and one mutation input for it, so `plannedAdditions` / `plannedRemovals` live at the
 * relation level and the state is keyed by the SCHEMA FIELD NAME alone.
 *
 * The two directions are deliberately asymmetric, because subset-closure only holds
 * one way:
 *
 *   - A **removal** says the item is no longer a member of the relation. Every view is
 *     a subset of the relation, so the item is hidden in all of them.
 *   - An **addition** says the item is a member of the relation, which does not settle
 *     whether it belongs in a *filtered* view — the client cannot evaluate the filter.
 *     So an addition renders in the views it was made in ({@link PlannedHasManyAddition.origins})
 *     plus every view that cannot exclude anything ({@link HasManyView.membership} `'total'`).
 */

export type ReconciliationResult = 'applied' | 'conflict'

export function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
	if (a.size !== b.size) return false
	for (const item of a) {
		if (!b.has(item)) return false
	}
	return true
}

export function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false
	}
	return true
}

/**
 * Removal type for has-many items
 */
export type HasManyRemovalType = 'disconnect' | 'delete'

/**
 * Kind of a planned has-many addition:
 *   - 'created': a newly created entity (via add())
 *   - 'connected': an existing persisted entity being connected (via connect())
 */
export type HasManyAdditionKind = 'created' | 'connected'

/**
 * Whether a view's query args can exclude a member of the relation.
 *   - 'total': no filter/limit/offset, so every member belongs in this view.
 *   - 'partial': the args may exclude members and the client cannot evaluate them.
 */
export type HasManyViewMembership = 'total' | 'partial'

/** What the server returned for ONE args-view of the relation, plus its local order. */
export interface HasManyView {
	/** IDs of items the server returned for this view's args */
	serverIds: Set<string>
	/** Explicit ordered list of item IDs, null means use the view's default order */
	orderedIds: string[] | null
	membership: HasManyViewMembership
}

export interface PlannedHasManyAddition {
	kind: HasManyAdditionKind
	/**
	 * Aliases of the views the addition was made in — never empty. Presentation only:
	 * it never affects what is sent. A `connect()` of the same id can legitimately
	 * arrive from two views, and both are entitled to show it, hence a set.
	 */
	origins: Set<string>
}

export interface SentHasManyAddition {
	itemId: string
	kind: HasManyAdditionKind
}

export interface SentHasManyRemoval {
	itemId: string
	type: HasManyRemovalType
}

export interface SentHasManyDelta {
	additions: readonly SentHasManyAddition[]
	removals: readonly SentHasManyRemoval[]
}

/**
 * Has-many relation state stored in SnapshotStore, keyed by
 * "parentType:parentId:fieldName" — the schema field name, never an alias.
 */
export interface StoredHasManyState {
	/** Per-args-view server data, keyed by alias; the unparameterized view uses the field name. */
	views: Map<string, HasManyView>
	/** Planned removals (disconnect or delete) keyed by entity ID. Relation-level. */
	plannedRemovals: Map<string, HasManyRemovalType>
	/**
	 * Planned additions keyed by entity ID. Relation-level: these are exactly the
	 * operations the next persist will send. The entries whose kind is 'created' are
	 * exactly the created entities, so the "created ⊆ connections" invariant is structural.
	 */
	plannedAdditions: Map<string, PlannedHasManyAddition>
	version: number
}

/**
 * What every consumer that names the relation the way the schema and the server do
 * sees: persistence, dirty tracking, error paths. Views are not its business, so the
 * baseline it reads is the union across them.
 */
export interface HasManyRelationProjection {
	serverIds: Set<string>
	plannedRemovals: Map<string, HasManyRemovalType>
	plannedAdditions: Map<string, HasManyAdditionKind>
	version: number
}

/**
 * What is this view's own, as opposed to the relation's: the server rows its args
 * returned and the order its user arranged. The pending writes are not here — they
 * belong to the relation, so consumers read {@link HasManyRelationProjection}.
 */
export interface HasManyViewProjection {
	serverIds: Set<string>
	orderedIds: string[] | null
}

export function createHasManyView(
	membership: HasManyViewMembership,
	serverIds?: Iterable<string>,
): HasManyView {
	return { serverIds: new Set(serverIds ?? []), orderedIds: null, membership }
}

export function cloneHasManyView(view: HasManyView): HasManyView {
	return {
		serverIds: new Set(view.serverIds),
		orderedIds: view.orderedIds ? [...view.orderedIds] : null,
		membership: view.membership,
	}
}

export function cloneViews(views: ReadonlyMap<string, HasManyView>): Map<string, HasManyView> {
	const clone = new Map<string, HasManyView>()
	for (const [alias, view] of views) clone.set(alias, cloneHasManyView(view))
	return clone
}

export function cloneAddition(addition: PlannedHasManyAddition): PlannedHasManyAddition {
	return { kind: addition.kind, origins: new Set(addition.origins) }
}

export function cloneAdditions(
	additions: ReadonlyMap<string, PlannedHasManyAddition>,
): Map<string, PlannedHasManyAddition> {
	const clone = new Map<string, PlannedHasManyAddition>()
	for (const [id, addition] of additions) clone.set(id, cloneAddition(addition))
	return clone
}

/**
 * Deep clone. Every path that hands a state out or stores a new one goes through
 * this: {@link SnapshotStore}'s dirty-version memo assumes values are REPLACED, never
 * mutated in place, and with two nesting levels a shallow copy would share mutable
 * Sets across store generations.
 */
export function cloneHasManyState(state: StoredHasManyState): StoredHasManyState {
	return {
		views: cloneViews(state.views),
		plannedRemovals: new Map(state.plannedRemovals),
		plannedAdditions: cloneAdditions(state.plannedAdditions),
		version: state.version,
	}
}

export function emptyHasManyState(): StoredHasManyState {
	return { views: new Map(), plannedRemovals: new Map(), plannedAdditions: new Map(), version: 0 }
}

/** Whether an addition renders in {@link alias} — see the asymmetry note at the top. */
export function additionRendersIn(
	views: ReadonlyMap<string, HasManyView>,
	alias: string,
	addition: PlannedHasManyAddition,
): boolean {
	if (addition.origins.has(alias)) return true
	return views.get(alias)?.membership === 'total'
}

/** The aliases of views whose args cannot exclude any member of the relation. */
function totalAliases(views: ReadonlyMap<string, HasManyView>): string[] {
	const aliases: string[] = []
	for (const [alias, view] of views) {
		if (view.membership === 'total') aliases.push(alias)
	}
	return aliases
}

/**
 * The aliases a confirmed member should render in, never empty.
 *
 * {@link preferred} is what the local record says; when nothing is left of it the row
 * falls back to the views that cannot exclude it. If there are none — every mounted
 * view is filtered — it is parked in the unparameterized view, created here if absent:
 * the relation's baseline is the UNION across views, so a row that joins no view is a
 * server row the store has lost. That view is `total` by definition, so parking shows
 * it to nobody it does not belong to.
 */
function renderTargets(
	views: Map<string, HasManyView>,
	fieldName: string,
	preferred: string[],
): string[] {
	if (preferred.length > 0) return preferred
	const totals = totalAliases(views)
	if (totals.length > 0) return totals
	if (!views.has(fieldName)) views.set(fieldName, createHasManyView('total'))
	return [fieldName]
}

/** The aliases of existing views a confirmed addition folds into. */
export function additionFoldTargets(
	state: StoredHasManyState,
	addition: PlannedHasManyAddition,
): string[] {
	const targets: string[] = []
	for (const alias of state.views.keys()) {
		if (additionRendersIn(state.views, alias, addition)) targets.push(alias)
	}
	return targets
}

/**
 * Default order of one view: its server rows minus the relation's planned removals,
 * then the planned additions that render there.
 */
export function computeViewOrderedIds(state: StoredHasManyState, alias: string): string[] {
	const result: string[] = []
	const view = state.views.get(alias)

	if (view) {
		for (const id of view.serverIds) {
			if (!state.plannedRemovals.has(id)) result.push(id)
		}
	}

	for (const [id, addition] of state.plannedAdditions) {
		if (state.plannedRemovals.has(id)) continue
		if (!additionRendersIn(state.views, alias, addition)) continue
		if (!result.includes(id)) result.push(id)
	}

	return result
}

/** Explicit order of a view if it has one, otherwise its default order. */
export function viewOrderedIds(state: StoredHasManyState, alias: string): string[] {
	const explicit = state.views.get(alias)?.orderedIds
	return explicit !== null && explicit !== undefined ? [...explicit] : computeViewOrderedIds(state, alias)
}

/** The relation's server baseline: the union across views. */
export function relationServerIds(state: StoredHasManyState): Set<string> {
	const ids = new Set<string>()
	for (const view of state.views.values()) {
		for (const id of view.serverIds) ids.add(id)
	}
	return ids
}

export function toRelationProjection(state: StoredHasManyState): HasManyRelationProjection {
	const plannedAdditions = new Map<string, HasManyAdditionKind>()
	for (const [id, addition] of state.plannedAdditions) plannedAdditions.set(id, addition.kind)
	return {
		serverIds: relationServerIds(state),
		plannedRemovals: new Map(state.plannedRemovals),
		plannedAdditions,
		version: state.version,
	}
}

export function toViewProjection(
	state: StoredHasManyState | undefined,
	alias: string,
): HasManyViewProjection {
	const view = state?.views.get(alias)
	return {
		serverIds: new Set(view?.serverIds),
		orderedIds: view?.orderedIds ? [...view.orderedIds] : null,
	}
}

/**
 * The single liveness predicate for has-many membership: effective members are
 * (every view's serverIds ∪ plannedAdditions) minus plannedRemovals. Defined once and
 * consumed by the write chokepoint so the forward/reverse index can never drift from it.
 */
export function liveHasManyChildIds(state: StoredHasManyState | undefined): Set<string> {
	const live = new Set<string>()
	if (!state) return live
	for (const view of state.views.values()) {
		for (const id of view.serverIds) {
			if (!state.plannedRemovals.has(id)) live.add(id)
		}
	}
	for (const id of state.plannedAdditions.keys()) {
		if (!state.plannedRemovals.has(id)) live.add(id)
	}
	return live
}

export function plannedDeleteChildIds(state: StoredHasManyState | undefined): Set<string> {
	const ids = new Set<string>()
	if (!state) return ids
	for (const [id, type] of state.plannedRemovals) {
		if (type === 'delete') ids.add(id)
	}
	return ids
}

export interface HasManyReconciliation {
	state: StoredHasManyState
	result: ReconciliationResult
}

/**
 * Advances the server baseline by the confirmed sent delta and rebases local edits
 * made after the request went out.
 *
 * The rebase logic is relation-level and unchanged by views — "did the user locally
 * undo this while the request was in flight" has one answer per relation. Only the
 * baseline bookkeeping is per view: a confirmed addition joins the views it renders
 * in, a confirmed removal leaves every view.
 */
export function reconcileHasManyState(
	existing: StoredHasManyState,
	delta: SentHasManyDelta,
	fieldName: string,
): HasManyReconciliation {
	const currentLive = liveHasManyChildIds(existing)
	const views = cloneViews(existing.views)
	const plannedAdditions = cloneAdditions(existing.plannedAdditions)
	const plannedRemovals = new Map(existing.plannedRemovals)
	let result: ReconciliationResult = 'applied'

	for (const addition of delta.additions) {
		// Read the origins before dropping the record. A locally cancelled addition
		// leaves none, and the row then joins only the views that cannot exclude it.
		const planned = plannedAdditions.get(addition.itemId)
		const targets = renderTargets(views, fieldName, planned ? additionFoldTargets(existing, planned) : [])
		for (const alias of targets) views.get(alias)?.serverIds.add(addition.itemId)

		plannedAdditions.delete(addition.itemId)
		plannedRemovals.delete(addition.itemId)
		if (!currentLive.has(addition.itemId)) {
			plannedRemovals.set(
				addition.itemId,
				addition.kind === 'created' ? 'delete' : 'disconnect',
			)
		}
	}

	for (const removal of delta.removals) {
		// Which views listed the row, read as the baseline drops it: a rebase below must
		// not claim membership in a filtered view that never showed it.
		const shownIn: string[] = []
		for (const [alias, view] of views) {
			if (view.serverIds.delete(removal.itemId)) shownIn.push(alias)
		}

		const currentRemoval = plannedRemovals.get(removal.itemId)
		if (currentRemoval === removal.type) plannedRemovals.delete(removal.itemId)

		if (!currentLive.has(removal.itemId)) {
			if (removal.type === 'delete') plannedRemovals.delete(removal.itemId)
			continue
		}
		if (removal.type === 'delete') {
			result = 'conflict'
		} else if (!plannedAdditions.has(removal.itemId)) {
			// Re-plan the connection where the row actually was, so the rebase is visible
			// where the user is looking without inventing membership elsewhere.
			plannedAdditions.set(removal.itemId, {
				kind: 'connected',
				origins: new Set(renderTargets(views, fieldName, shownIn)),
			})
		}
	}

	return {
		state: { views, plannedRemovals, plannedAdditions, version: existing.version + 1 },
		result,
	}
}
