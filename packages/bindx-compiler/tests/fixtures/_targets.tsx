// Target components a hole can point at. Imported into holes.tsx so that fixture's
// only chains are the escaping hosts (clean index-based assertions in the harness).
import type { ReactNode } from 'react'
import { createComponent, Field, withCollector, type EntityRef } from '@contember/bindx-react'
import { schema, type Author } from './_schema.js'

// createComponent target — resolved at runtime via its own implicit selection surface.
export const AuthorCard = createComponent()
	.entity('author', schema.Author)
	.render(({ author }) => <Field field={author.name} />)

// withCollector target — resolved via its staticRender surface.
export const AuthorBadge = withCollector(
	(props: { author: EntityRef<Author> }): ReactNode => <Field field={props.author.name} />,
	(props) => <Field field={props.author.name} />,
)

// Plain React component target — no selection surface (documented runtime blind spot).
export const PlainAuthor = (props: { author: unknown }): ReactNode => <span>{String(props.author)}</span>

// Plain component that accepts arbitrary props (for multi-prop / literal-prop cases).
export const Panel = (props: Record<string, unknown>): ReactNode => <span>{String(props.label)}</span>
