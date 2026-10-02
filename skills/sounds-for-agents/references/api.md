# Portable API and plan reference

Package: `@sounds-for-agents/react`. React APIs require React 18.2 or React 19. Runtime core is available through `@sounds-for-agents/react/core` without React. Install from a local tarball or Git URL; authentication is needed if the source repository is private. No npm release or hosted API is provided.

## Styles and cues

`SOUND_STYLES` is the readonly list `soft`, `tactile`, `playful`. **Soft** uses warm rounded tones, **Tactile** compact percussive tones, and **Playful** rounded plucks with extra brightness. Audition all three for the user before consuming-app integration unless their explicit choice already covers that scope. Offer **Off** as a choice; `off` is a plan choice, not a runtime sound style.

`SOUND_CUES` is the readonly list `success`, `error`, `complete`, `notification`. Use these for confirmed success, real submitted failure, completed milestones, and actionable updates. Preserve visible feedback.

## Provide a playable audition

When this skill folder is copied on its own, reuse an available source checkout or clone the [source repository](https://github.com/thejjeanjjorge/sounds-for-agents) into a writable preview workspace. For a new checkout:

```sh
git clone https://github.com/thejjeanjjorge/sounds-for-agents.git
cd sounds-for-agents
npm ci
npm run dev
```

Open `http://127.0.0.1:5186` in a browser and let the user enable audio, audition Soft, Tactile, and Playful, and stop or adjust playback. Node.js 22.12 or newer is required. Cloning a private repository requires appropriate GitHub access. These preview steps do not change the consuming app or install this skill globally.

An installed tarball also includes `playground-dist` with its built HTML and assets. Resolve its entrypoint using the `@sounds-for-agents/react/playground` export, then serve that folder through any available local HTTP server. For example, if Python is available:

```sh
python -m http.server 5186 --bind 127.0.0.1 --directory "/path/to/node_modules/@sounds-for-agents/react/playground-dist"
```

Open the local URL; keep the asset folder beside its HTML. Serving the packed preview needs no npm release or source build. Audio still requires the user's trusted interaction in that browser. If making a custom preview with the renderer, expose enable/disable, mute, volume, and stop, and actually play the cues rather than showing descriptions alone.

After audition, ask the user's explicit **Soft**, **Tactile**, **Playful**, or **Off** choice before consuming-app integration. An existing explicit choice for the same scope can be reused. Liking all styles does not select one for the app.

## React

```tsx
import { SoundsProvider, SoundControls } from '@sounds-for-agents/react';

// Use the style explicitly selected by the user for this app.
<SoundsProvider style="soft">
  <SoundControls />
  <App />
</SoundsProvider>
```

`SoundsProvider` requires `style`; optional `initialVolume` defaults to 0.25 and `initialMuted` defaults to false. The initial enabled state is always false. `SoundControls` supplies unstyled native enable/disable, mute, volume, and stop controls; the app supplies their appearance. It accepts supported div props and an optional `label` for its accessible control-group name.

`useSounds()` returns the `SoundState` fields—`style`, `enabled`, `volume`, `muted`, `playing`, `status`, and optional `reason`—plus:

- `enable(): Promise<boolean>` / `disable(): void`: explicit audio enablement and disablement. A false enable result means audio did not become available.
- `play(cue, { style? })`: a cue using the selected style or a supported override. Returns `{ accepted: true, duration: number }` in seconds, or `{ accepted: false, duration: 0, reason: string }`. It declines when audio is disabled, muted, suspended, or already busy; it does not queue or overlap cues.
- `stop()`: cancel the current cue and scheduled notes.
- `setStyle(style)`, `setVolume(volume)`, `setMuted(muted)`: preference changes.

Volume uses a 0–1 range and clamps values outside it. Mute keeps the remembered volume. Status values are `disabled`, `ready`, `playing`, `muted`, `suspended`, and `disposed`; optional `reason` describes an availability or playback problem. Keep meaningful feedback visible when playback declines.

Call `enable` directly from a trusted user action. Do not call it on mount, import, settings restoration, or an ordinary attempt to play a cue. A preview play click does not enable sound for users of the consuming app. Use style overrides only within the user's approved choice; do not quietly replace their selected family.

Call `play` from the event confirming an actual result, rather than an effect that can replay on remount. Keep success/error messages, progress, and next actions available without sound. Do not remount a stateful editor to add audio.

`useSoundPlayer()` returns a stable `{ play, stop }` for components that only trigger cues. Unlike `useSounds()`, its identity never changes, so those components do not re-render when the volume moves or sound turns on, and it keeps working after Strict Mode replaces the engine. Use `useSounds()` where sound state is shown, such as the controls.

`SoundControls` marks each control with `data-sound-control` (`toggle`, `mute`, `volume-label`, `volume`, `stop`, `status`), the group with `data-sound-status`, and the toggle with `data-sound-enabled`, so app CSS can target controls by name instead of element order. Its optional `onEnabled` callback runs once when the Enable sounds button succeeds, for example to play a short confirmation cue (the engine is live by then). It does not run when audio could not start.

### Remember volume and mute

Apps usually want a listener's volume and mute choice to survive a reload. `loadSoundPreferences(key, storage?)` and `saveSoundPreferences(key, preferences, storage?)`, also exported from `@sounds-for-agents/react/core`, keep exactly those two values, validate them on the way in, and never throw when storage is blocked. They never store whether sound is enabled or which style is chosen: restoring preferences must not start audio, and the style is the user's explicit choice for the app.

```tsx
const saved = loadSoundPreferences('my-app-sound'); // read once, before the provider mounts

<SoundsProvider style="soft" initialVolume={saved.volume} initialMuted={saved.muted}>
  <SavePreferences />
  <App />
</SoundsProvider>

function SavePreferences() {
  const { volume, muted } = useSounds();
  useEffect(() => saveSoundPreferences('my-app-sound', { volume, muted }), [volume, muted]);
  return null;
}
```

Reading before mount suits a client-only app. With server rendering, read after hydration instead, for example in an effect that calls `setVolume` and `setMuted`, so the first client render matches the server HTML. Sound starts disabled either way.

## Core and renderer

`createSoundEngine({ style, volume?, muted? })` creates the framework-independent engine. It starts disabled, with volume 0.25 and muted false unless explicitly configured. Construction creates no live audio context. It exposes the same control/playback methods plus `getState()`, `subscribe(listener)` (returns an unsubscribe function), and `dispose()`. Dispose the engine when its owning surface is removed. Use the same trusted enablement boundary and accessible controls as the React integration.

`getCueDuration(style, cue): number` returns the realtime cue lifetime in seconds, including its 15 ms scheduling lead; it matches accepted playback's `duration`.

`renderCue(style, cue, { sampleRate? }): Promise<AudioBuffer>` renders an offline audition buffer. It uses 48,000 Hz by default and clamps a finite requested rate to 8,000–96,000 Hz. Offline rendering needs browser `OfflineAudioContext` support and can fail when unavailable. The buffer includes a 25 ms tail and is approximately 10 ms longer than `getCueDuration`, rounded to whole samples; use `buffer.duration` when timing its playback. Rendering a buffer does not enable live audio or play it for the user.

The machine-readable catalog is exported through `@sounds-for-agents/react/catalog`, the schema through `@sounds-for-agents/react/plan.schema.json`, this skill entrypoint through `@sounds-for-agents/react/skill`, and the packed listening preview entrypoint through `@sounds-for-agents/react/playground`.

## Integration plan

A plan records the human's explicit style choice; a validator cannot establish that the human actually gave it. An optional `userChoice.evidence` must come from the actual answer. Do not fabricate evidence or use example confirmations as authority.

```json
{
  "version": 1,
  "selectedStyle": "soft",
  "userChoice": { "confirmed": true, "style": "soft" },
  "defaults": { "enabled": false, "volume": 0.25, "muted": false },
  "controls": {
    "enable": "Sound settings enable button",
    "disable": "Sound settings disable button",
    "mute": "Sound settings mute button",
    "volume": "Sound settings volume slider",
    "stop": "Sound settings stop button"
  },
  "feedback": [
    {
      "id": "query-correct",
      "cue": "success",
      "target": "Submitted query validation handler",
      "trigger": "The validator confirms the submitted answer is correct",
      "visibleFeedback": "Show a textual Correct result alongside query output",
      "oncePerEvent": true
    }
  ]
}
```

Required fields are shown above. `notes` is an optional array of nonempty strings. The choice must be confirmed and match `selectedStyle`. Plans require default-off sound, volume 0.25, the five named controls, and at least one visible-feedback event mapping. No custom cue or timing fields are accepted in v0.1.

For `selectedStyle: "off"`, record `userChoice.style: "off"`, set `controls: null` and `feedback: []`, and do not add sound integration. Default fields remain unchanged.

```sh
npx --no-install sounds-for-agents-validate path/to/plan.json
# From the source repository:
npm run plan:validate -- path/to/plan.json
```

Targets and triggers are descriptive references; validation does not inspect consuming-app source, prove accessibility or human consent, or grant permission for edits, publication, or deployment.

Run the `npx --no-install` command from the app with the package installed locally. It resolves the local binary without falling back to a registry download.
