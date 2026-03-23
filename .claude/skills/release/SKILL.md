---
name: release
description: Release and publish packages to npm. Use when the user says "release", "publish", "tag version", "cut a release", "npm publish", or wants to create a new version of the packages. Handles version selection, tagging, pushing, and monitoring the CI publish pipeline.
---

# Release

Publish all workspace packages to npm via git tag → GitHub Actions pipeline.

## Prerequisites

Verify before starting:
- Clean working directory (`git status` shows no changes)
- On `main` or a version branch (`v*.* `)
- Branch is up to date with origin
- `gh` CLI is authenticated (for pipeline monitoring)

If the working directory is dirty, ask the user whether to commit or stash first.

## Procedure

### 1. Determine current version

```bash
git fetch --tags origin
git tag -l 'v*' --sort=-v:refname | head -10
```

Show the latest tags to the user.

### 2. Show changes since last tag

```bash
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  git log "$LAST_TAG"..HEAD --oneline --no-merges
else
  git log --oneline -20
fi
```

Summarize the changes in a few bullet points (group by type: features, fixes, refactors).

### 3. Suggest version

Based on changes:
- **patch** (0.1.0 → 0.1.1): only fixes, docs, minor refactors
- **minor** (0.1.0 → 0.2.0): new features, non-breaking API changes
- **major** (0.1.0 → 1.0.0): breaking changes
- **prerelease** (0.2.0-alpha.1): unstable/testing

Suggest a version and ask the user to confirm or override via AskUserQuestion:
> "Changes since {last_tag}: {summary}. Suggested version: **{version}**. Proceed, or enter a different version?"

### 4. Tag and push

Run the tag-version script. This bumps all package.json versions, commits, tags, and pushes:

```bash
./scripts/tag-version/run.sh {version}
```

The script validates everything (semver format, clean git, branch rules) and will exit with an error if something is wrong. If it fails, report the error to the user.

### 5. Monitor pipeline

After the tag is pushed, watch the GitHub Actions publish workflow:

```bash
# Wait a moment for GH to pick up the tag
sleep 5
gh run list --workflow=publish.yml --limit=1
```

Then watch it:

```bash
gh run watch $(gh run list --workflow=publish.yml --limit=1 --json databaseId --jq '.[0].databaseId')
```

Report the outcome to the user. If it fails, show the logs:

```bash
gh run view {run_id} --log-failed
```
