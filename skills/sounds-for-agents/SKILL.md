---
name: sounds-for-agents
description: Preview, plan, add, or review interface sound feedback with the Sounds for Agents kit. Before consuming-app integration, audition Soft, Tactile, and Playful and obtain the user's explicit style or Off choice; preserve existing scope and visible feedback.
---

# Sounds for Agents

Use four short cues—`success`, `error`, `complete`, and `notification`—to support real interface events. Read [references/api.md](references/api.md) for the portable API and plan contract. This skill does not require a global installation or hosted service.

## Let the user choose

When no existing explicit style choice covers the consuming-app scope, present a playable audition of **Soft**, **Tactile**, and **Playful** using the library's listening playground or a contained preview based on its cue renderer before integration. Descriptions alone are not an audition. Include sound enablement, volume, mute, and stop controls in the preview.

Ask which style the user wants, offering **Soft**, **Tactile**, **Playful**, and **Off**, then wait for an explicit answer. Reuse an existing explicit choice for the same approved scope instead of asking again. Never infer choice or approval from silence, elapsed time, an agent-generated plan, or a preview play click. If the user chooses Off, do not add consuming-app sound integration.

Liking all three audition families authorizes no particular consuming-app style. Keep all three in the library or preview when requested, and still obtain the app's explicit choice.

This choice gate concerns a consuming app. It does not prevent authorized work on the framework or an isolated preview. Inspect the app, identify real events, and prepare the preview while a choice is pending; hold dependent integration edits. Preview audition consent is separate from each app user's decision to enable sound.

## Integrate purposeful feedback

Read the consuming project's instructions, dependencies, and event handlers. Keep its styling, stateful editors, and keyboard behavior intact. Use the selected style at a stable `SoundsProvider` boundary, or use the framework-independent engine when appropriate.

Sound must start disabled with volume 0.25. Provide enable/disable, mute, volume, and stop controls. Enable live audio only from a trusted user action. Restoring preferences, mounting components, or ordinary playback attempts must not activate audio. Keep sound preferences independent of reduced motion.

Map cues to real events once. A validation success can play `success`; a real submitted failure can play `error`; a completed milestone can play `complete`; an actionable update can play `notification`. Do not play cues for hovering, typing, rerenders, background loops, or fabricated failures. Keep visible text and meaningful actions available when sound is off or unavailable.

## Record and verify

For multiple event mappings, write a plan with the explicit selected style and its confirmed user choice. Evidence notes may quote or accurately paraphrase the actual human answer; never invent them. Example fixture confirmations demonstrate structure and grant no authority.

Validate using `npx --no-install sounds-for-agents-validate path/to/plan.json` after local package installation, or `npm run plan:validate -- path/to/plan.json` from the source repository. The `--no-install` option prevents a registry-fetch fallback. Validation checks recorded structure and vocabulary; it cannot prove human consent or authorize unrelated edits.

Verify enablement from a user action, keyboard controls, mute, volume, stop/disable cancellation, interruptions, visible feedback, and one cue per real event. Check that editors retain state and no audio starts on import, render, mount, or restored settings. For library work run its relevant checks, including `npm run check`, `npm run test:audio` for synth changes, and `npm run agent:check` for catalog/plan changes.

Report the selected style, event mappings, and what was verified. This is an early source package with a local playground, not a published npm release or hosted service. The package's `private: true` blocks npm publication independently of GitHub visibility; its license remains `UNLICENSED` pending selection.
