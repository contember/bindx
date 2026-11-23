/**
 * A temp entity referenced from more than one place in one persist must still be
 * created once. A temp id means nothing to the server, so every other reference
 * has to reach the created row another way. These are the ways (see issue #169).
 */

/** A place in the mutation where a temp entity was emitted as an inline `create`. */
export interface CreateSite {
	readonly relationType: 'hasOne' | 'hasMany'
	readonly parentEntityType: string
	readonly parentEntityId: string
	readonly fieldName: string
}

export interface SharedCreate {
	readonly entityType: string
	readonly entityId: string
	readonly sites: readonly CreateSite[]
}

/** Sets the entity's owning relation to a persisted owner, replacing a has-many membership op. */
export interface OwnerLink {
	readonly fieldName: string
	readonly ownerId: string
}

export type SharedCreateStrategy =
	/** Created at the carrier; every other site is a one-has-many membership expressed by an owner link. */
	| { readonly kind: 'fold'; readonly carrier: CreateSite; readonly ownerLinks: readonly OwnerLink[] }
	/** Created at the carrier with a client-chosen primary key; every other site connects by it. */
	| { readonly kind: 'clientId'; readonly carrier: CreateSite; readonly id: string }

export interface SharedCreatePlanContext {
	getInverseField(entityType: string, fieldName: string): string | undefined
	getRelationType(entityType: string, fieldName: string): 'hasOne' | 'hasMany' | undefined
	isPersistedId(id: string): boolean
	/** The entity's own has-one already points somewhere else than the owner. */
	conflictsWithOwnRelation(entityType: string, entityId: string, fieldName: string, ownerId: string): boolean
	isCustomPrimaryAllowed(entityType: string): boolean
	generateId(): string
}

export function isSameSite(a: CreateSite, b: CreateSite): boolean {
	return a.relationType === b.relationType
		&& a.parentEntityType === b.parentEntityType
		&& a.parentEntityId === b.parentEntityId
		&& a.fieldName === b.fieldName
}

/**
 * Prefers folding, which needs no client id: the entity is created at its single
 * has-one site (or at one membership) and joins every other one-has-many through its
 * own owning relation. Otherwise a client-chosen primary key, created at a membership
 * so its owner is implicit. Undefined when neither applies.
 */
export function planSharedCreate(shared: SharedCreate, context: SharedCreatePlanContext): SharedCreateStrategy | undefined {
	return planFold(shared, context) ?? planClientId(shared, context)
}

function planFold(shared: SharedCreate, context: SharedCreatePlanContext): SharedCreateStrategy | undefined {
	const hasOneSites = shared.sites.filter(site => site.relationType === 'hasOne')
	const hasManySites = shared.sites.filter(site => site.relationType === 'hasMany')
	if (hasOneSites.length > 1) return undefined
	const carrier = hasOneSites[0] ?? hasManySites[0]
	if (!carrier) return undefined

	const usedFields = new Set<string>()
	if (carrier.relationType === 'hasMany') {
		const carrierField = owningFieldOf(shared, carrier, context)
		if (carrierField) usedFields.add(carrierField)
	}
	const ownerLinks: OwnerLink[] = []
	for (const site of hasManySites) {
		if (isSameSite(site, carrier)) continue
		const fieldName = owningFieldOf(shared, site, context)
		if (!fieldName || usedFields.has(fieldName) || !context.isPersistedId(site.parentEntityId)) return undefined
		if (context.conflictsWithOwnRelation(shared.entityType, shared.entityId, fieldName, site.parentEntityId)) return undefined
		usedFields.add(fieldName)
		ownerLinks.push({ fieldName, ownerId: site.parentEntityId })
	}
	return { kind: 'fold', carrier, ownerLinks }
}

/** The shared entity's many-has-one that owns a one-has-many site, if the schema names it. */
function owningFieldOf(shared: SharedCreate, site: CreateSite, context: SharedCreatePlanContext): string | undefined {
	const inverse = context.getInverseField(site.parentEntityType, site.fieldName)
	if (!inverse) return undefined
	return context.getRelationType(shared.entityType, inverse) === 'hasOne' ? inverse : undefined
}

function planClientId(shared: SharedCreate, context: SharedCreatePlanContext): SharedCreateStrategy | undefined {
	if (!context.isCustomPrimaryAllowed(shared.entityType)) return undefined
	const carrier = shared.sites.find(site => site.relationType === 'hasMany') ?? shared.sites[0]
	if (!carrier) return undefined
	return { kind: 'clientId', carrier, id: context.generateId() }
}

export function describeSite(site: CreateSite): string {
	return `${site.parentEntityType}:${site.parentEntityId}.${site.fieldName}`
}

/** Thrown before anything is sent when a shared temp entity cannot be created once. */
export class SharedCreateError extends Error {
	constructor(readonly unplannable: readonly SharedCreate[]) {
		super(
			unplannable.map(shared => (
				`${shared.entityType}:${shared.entityId} is created in one persist through ${shared.sites.map(describeSite).join(', ')}. `
				+ 'It can be created only once, and the other references cannot name it: '
				+ 'none of them is a one-has-many membership the entity owns, and the backend does not allow a client-chosen primary key (customPrimary) for it.'
			)).join(' '),
		)
		this.name = 'SharedCreateError'
	}
}
