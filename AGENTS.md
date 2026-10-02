# Working in this repository

This repository contains the Sounds for Agents library, agent skill, and listening playground. Keep changes scoped here unless the user requests a consuming-app integration.

## User choice

Before adding sound to a consuming app, present a playable audition of Soft, Tactile, and Playful and ask the user which style they want, including an Off option. Wait for an explicit choice. Reuse an existing explicit choice for the same scope; do not repeatedly prompt. Approval to develop the library or preview is separate from a consuming-app style choice. A plan records a choice; validation does not prove human consent.

## Runtime

- Preserve the twelve original synthesized cues: success, error, complete, and notification in soft, tactile, and playful styles.
- Never create or resume a live AudioContext on import, render, mount, preference restoration, or ordinary playback attempts. Enable only from a trusted user interaction.
- Sound starts disabled, volume defaults to 0.25, and mute preserves the remembered volume. Keep audio preferences separate from reduced-motion preferences.
- Keep visible feedback available independently of sound. Provide enable/disable, mute, volume, and stop controls. No loops, autoplay, hover or typing sounds.
- Only one cue may be active. Keep gain envelopes silent before a source starts, fade interrupted cues, cancel future notes, and clean up sources, timers, subscriptions, and contexts.
- Keep core code framework independent and React controls unstyled. Never remount consumer editors or replace consumer CSS to add sound.

## Package and contracts

The source package is `@sounds-for-agents/react`. Keep `private: true` and `UNLICENSED` until the user chooses npm publication and a license. This does not describe or change GitHub repository visibility.

Keep public exports, types, catalog, plan schema/validator, README, API documentation, and bundled skill consistent. Runtime core is available through the `./core` export without React.

## Verification

Use Node.js 22.12 or newer. Run `npm run check` for code changes and `npm run test:audio` for synth changes. Review keyboard behavior, mobile layout, user activation, mute/stop/disable, interruptions, React Strict Mode, and SSR safety. Tests should verify behavior rather than match instruction wording. Validate the skill with the skill-creator validator when editing it.
