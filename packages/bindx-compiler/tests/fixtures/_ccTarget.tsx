// A createComponent target reached through a barrel re-export. Its render reads only
// `entity.title`; getSelection never touches scalar props, so a render-local passed alongside
// the entity is droppable with no bail — once the barrel chain is followed to this declaration.
import { Field, createComponent, entityDef } from '@contember/bindx-react'

const ArticleDef = entityDef('Article')

export const CcBody = createComponent()
	.entity('entity', ArticleDef)
	.render(({ entity }) => <Field field={entity.title} />)
