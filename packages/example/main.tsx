import './styles.css'
import { createRoot } from 'react-dom/client'
import { setStaticSelectionValidation } from '@contember/bindx-react'
import { App } from './App.js'

// With the compiler enabled, cross-check emitted selections against the runtime
// proxy pass in dev — warns on any under-fetch. See docs/compiler-plan.md.
if (import.meta.env.DEV && __BINDX_COMPILER__) {
	setStaticSelectionValidation(true)
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
