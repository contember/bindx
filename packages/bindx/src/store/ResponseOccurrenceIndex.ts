import type { SelectionMeta } from '../selection/types.js'

/** The schema knowledge the index needs: where a relation points and whether it is a list. */
export interface RelationTargetResolver {
	getRelationTarget(entityType: string, fieldName: string): string | undefined
	isHasMany(entityType: string, fieldName: string): boolean
}

type EntityRecord = Record<string, unknown>

interface PendingVisit {
	readonly value: unknown
	readonly entityType: string
	readonly selection: SelectionMeta
	readonly isList: boolean
}

/**
 * Unites the occurrences of one entity within a single server response.
 *
 * One query can reach the same entity through several paths, each with its own
 * sub-selection (`article.attachments` next to `article.sections.article.attachments`).
 * Every occurrence is later written into the entity's snapshot, so without this
 * the narrower one could replace fields the wider one carried. Occurrences of
 * one response are equally fresh, so they are merged without any recency rule:
 * each maps to the union of all of them, keyed by entity type and id. A scalar two
 * occurrences disagree on (which one server read should not produce) takes the
 * value of the occurrence visited last. The response is walked breadth first,
 * relations in selection order and list items in list order, so the outcome
 * follows from the response and the selection alone.
 *
 * The union is shallow. A relation value in it is one occurrence's raw value, and
 * the related entities inside it resolve to their own unions when they are
 * written, so relations inside relations unite level by level without rewriting
 * the response.
 *
 * Reads never merge across responses: a later read replaces what an earlier one
 * stored, as before.
 */
export class ResponseOccurrenceIndex {
	private readonly unions = new WeakMap<object, Readonly<EntityRecord>>()

	/**
	 * Indexes a response read for `entityType` with `selection`. The type of every
	 * nested occurrence comes from the schema through the selection's field names;
	 * an occurrence whose type cannot be resolved is left out rather than matched
	 * by id alone.
	 */
	index(entityType: string, data: unknown, selection: SelectionMeta, schema: RelationTargetResolver): void {
		const occurrencesByType = collectOccurrences({ value: data, entityType, selection, isList: Array.isArray(data) }, schema)
		for (const occurrencesById of occurrencesByType.values()) {
			for (const occurrences of occurrencesById.values()) {
				if (Array.isArray(occurrences)) {
					this.unite(occurrences)
				}
			}
		}
	}

	private unite(occurrences: readonly EntityRecord[]): void {
		const union: EntityRecord = {}
		for (const occurrence of occurrences) {
			Object.assign(union, occurrence)
		}
		Object.freeze(union)
		for (const occurrence of occurrences) {
			this.unions.set(occurrence, union)
		}
	}

	/** The union of every occurrence of this entity in its response, or the occurrence itself when it had no sibling. */
	resolve(occurrence: EntityRecord): EntityRecord {
		return this.unions.get(occurrence) ?? occurrence
	}
}

/** Occurrences by entity type and id. A lone occurrence is kept as is; an array only appears once an id repeats. */
type OccurrencesByType = Map<string, Map<unknown, EntityRecord | EntityRecord[]>>

function collectOccurrences(root: PendingVisit, schema: RelationTargetResolver): OccurrencesByType {
	const occurrencesByType: OccurrencesByType = new Map()
	const pending: PendingVisit[] = [root]
	for (let next = 0; next < pending.length; next++) {
		const visit = pending[next]!
		for (const entity of entitiesOf(visit.value, visit.isList)) {
			addOccurrence(occurrencesByType, visit.entityType, entity)
			for (const fieldMeta of visit.selection.fields.values()) {
				if (!fieldMeta.isRelation || !fieldMeta.nested || entity[fieldMeta.alias] == null) continue
				const targetType = schema.getRelationTarget(visit.entityType, fieldMeta.fieldName)
				if (targetType === undefined) continue
				pending.push({
					value: entity[fieldMeta.alias],
					entityType: targetType,
					selection: fieldMeta.nested,
					isList: schema.isHasMany(visit.entityType, fieldMeta.fieldName),
				})
			}
		}
	}
	return occurrencesByType
}

function addOccurrence(occurrencesByType: OccurrencesByType, entityType: string, entity: EntityRecord): void {
	const id = entity['id']
	if (typeof id !== 'string' && typeof id !== 'number') return
	let occurrencesById = occurrencesByType.get(entityType)
	if (!occurrencesById) {
		occurrencesById = new Map()
		occurrencesByType.set(entityType, occurrencesById)
	}
	const known = occurrencesById.get(id)
	if (known === undefined) {
		occurrencesById.set(id, entity)
	} else if (Array.isArray(known)) {
		known.push(entity)
	} else if (known !== entity) {
		occurrencesById.set(id, [known, entity])
	}
}

/** The entity records a relation value holds: a has-one object, or a has-many array or connection (`{ edges: [{ node }] }`). */
function entitiesOf(value: unknown, isList: boolean): readonly EntityRecord[] {
	if (Array.isArray(value)) {
		return value.filter(isRecord)
	}
	if (!isRecord(value)) {
		return []
	}
	if (!isList) {
		return [value]
	}
	const edges = value['edges']
	return Array.isArray(edges) ? edges.map(edge => (isRecord(edge) ? edge['node'] : undefined)).filter(isRecord) : []
}

function isRecord(value: unknown): value is EntityRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
