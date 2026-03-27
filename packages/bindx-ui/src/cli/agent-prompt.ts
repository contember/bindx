export interface AgentPromptArgs {
	componentPath: string
	ejectVersion: string
	currentVersion: string
	localDiff: string
	upstreamDiff: string
	localContent: string
	upstreamContent: string
	localFilePath: string
}

export function generateAgentPrompt(args: AgentPromptArgs): string {
	return `You are backporting upstream changes to an ejected bindx-ui component.

## Component: ${args.componentPath}
Ejected from @contember/bindx-ui@${args.ejectVersion}, current: @${args.currentVersion}

## What the user changed (base → local):
\`\`\`diff
${args.localDiff}
\`\`\`

## What upstream changed (base → upstream):
\`\`\`diff
${args.upstreamDiff}
\`\`\`

## Current local file:
\`\`\`tsx
${args.localContent}
\`\`\`

## Current upstream file:
\`\`\`tsx
${args.upstreamContent}
\`\`\`

## Task
Apply upstream changes while preserving user modifications.
- User changes take priority on conflicts.
- When upstream adds new code, include it.
- When upstream renames/refactors, apply consistently.
- Update header to current version.
- If ambiguous, use AskUserQuestion to clarify.

Write the merged result to: ${args.localFilePath}
Then run: bindx-ui backport --sync ${args.componentPath}
`
}
