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

export interface AgentBatchSummaryItem {
	componentPath: string
	ejectVersion: string
	status: 'auto-updated' | 'merge-needed' | 'no-git-ref' | 'upstream-removed' | 'local-missing'
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

export function generateAgentBatchPrompt(
	items: AgentBatchSummaryItem[],
	currentVersion: string,
	autoUpdated: string[],
	upToDate: string[],
): string {
	const mergeNeeded = items.filter(i => i.status === 'merge-needed')
	const noGitRef = items.filter(i => i.status === 'no-git-ref')
	const removed = items.filter(i => i.status === 'upstream-removed')
	const localMissing = items.filter(i => i.status === 'local-missing')

	let prompt = `You are backporting upstream changes across multiple ejected bindx-ui components.
Current package version: @contember/bindx-ui@${currentVersion}

## Summary
`

	if (upToDate.length > 0) {
		prompt += `- **Already up to date**: ${upToDate.length} component(s) — no action needed\n`
	}
	if (autoUpdated.length > 0) {
		prompt += `- **Auto-updated** (no local changes): ${autoUpdated.join(', ')}\n`
	}
	if (mergeNeeded.length > 0) {
		prompt += `- **Merge needed**: ${mergeNeeded.length} component(s) — see below\n`
	}
	if (noGitRef.length > 0) {
		prompt += `- **No git ref** (cannot diff): ${noGitRef.map(i => i.componentPath).join(', ')} — re-eject these or merge manually\n`
	}
	if (removed.length > 0) {
		prompt += `- **Removed upstream**: ${removed.map(i => i.componentPath).join(', ')} — review if still needed\n`
	}
	if (localMissing.length > 0) {
		prompt += `- **Local file missing**: ${localMissing.map(i => i.componentPath).join(', ')} — restore or re-eject\n`
	}

	if (mergeNeeded.length === 0) {
		prompt += `\nNothing to merge — all components were auto-updated or already up to date.\n`
		return prompt
	}

	if (mergeNeeded.length <= 5) {
		prompt += `\n## Components to merge\n\n`
		prompt += `For each component below, get the full diff details by running:\n`
		prompt += `\`\`\`bash\nbindx-ui backport --agent <component-path>\n\`\`\`\n\n`
		prompt += `Components:\n`
		for (const item of mergeNeeded) {
			prompt += `- \`${item.componentPath}\` (ejected from v${item.ejectVersion}) — file: ${item.localFilePath}\n`
		}
		prompt += `\n## Workflow for each component\n`
		prompt += `1. Run \`bindx-ui backport --agent ${mergeNeeded[0]!.componentPath}\` to see diffs\n`
		prompt += `2. Read the diffs, apply upstream changes while preserving user modifications\n`
		prompt += `3. Write the merged file\n`
		prompt += `4. Run \`bindx-ui backport --sync <component-path>\` to update metadata\n`
		prompt += `5. If a component should be skipped, run \`bindx-ui backport --skip <component-path>\`\n`
	} else {
		prompt += `\n## ${mergeNeeded.length} components need merging\n\n`
		prompt += `Too many to show inline. Process them one by one:\n\n`
		prompt += `\`\`\`bash\n# Get details for a specific component:\nbindx-ui backport --agent <component-path>\n\n`
		prompt += `# After merging, sync metadata:\nbindx-ui backport --sync <component-path>\n\n`
		prompt += `# To skip a component:\nbindx-ui backport --skip <component-path>\n\`\`\`\n\n`
		prompt += `Components to merge:\n`
		for (const item of mergeNeeded) {
			prompt += `- \`${item.componentPath}\` (v${item.ejectVersion}) — ${item.localFilePath}\n`
		}
	}

	prompt += `\n## After all components are processed\n`
	prompt += `Run \`bindx-ui status\` to verify everything is up to date.\n`

	return prompt
}
