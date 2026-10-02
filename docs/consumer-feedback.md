# What integrating Sounds for Agents into a real app found

Notes from adding the library to **SQL Land**, a React and Vite SQL practice app, on 2026-10-02. The library was installed from GitHub at `9b358cd`. As the skill requires, the audition was offered first and the user then chose **Playful** when asked. The app plays cues at ten moments, which its `sounds.plan.json` records.

This file lists what the integration ran into and what the other commits on this branch change. Measurements are included so each item can be judged without redoing the work. Where something was not verified, it says so.

## Changed on this branch

| Commit | Recommendation | Why |
| --- | --- | --- |
| Name the expected value in plan validation errors | Say what a field must be | `must be equal to constant` does not name the constant, and a failed if/then added a vague `must match "then" schema` line. Authors had to open the schema. |
| Add a stable player, styling hooks and an onEnabled callback | `useSoundPlayer()`, `data-sound-control` attributes, `onEnabled` | `useSounds()` returns a new value on every state change, so a component that only plays cues re-rendered on each volume tick. `SoundControls` has no class names, so the app styled it with `button:first-of-type`. Enabling plays nothing, so a listener cannot tell it worked. |
| Add helpers to remember volume and mute between visits | `loadSoundPreferences`, `saveSoundPreferences` | The rules mention "preference restoration" but gave apps nothing to do it with. The helpers keep volume and mute only, so restoring cannot start audio. |

## Not changed here, with evidence

### 1. Cue loudness may decide whether short cues are noticed

All twelve cues were rendered offline with `renderCue` at 48 kHz and measured. This is the signal before the engine's master gain.

| Style | Cue peak range (dBFS) | RMS range (dBFS) |
| --- | --- | --- |
| Soft | −19.1 to −19.8 | −32.0 to −32.9 |
| Tactile | −20.0 to −20.3 | −35.2 to −36.0 |
| Playful | −19.5 to −20.8 | −34.9 to −35.7 |

The master gain is `volume × NOMINAL_GAIN` (0.72, in `src/core/synth.ts`), which gives these peaks at the output:

| Volume | Master gain | Cue peak |
| --- | --- | --- |
| 25% (default) | 0.18 | about −35 dBFS |
| 50% | 0.36 | about −29 dBFS |
| 100% | 0.72 | about −23 dBFS |

So the default sits near −35 dBFS peak, and even 100% never gets above about −23 dBFS. The cues are consistent with each other (every cue is within about 1.5 dB of the others), so level does not separate them. The shortest cues last about 0.4 s against 0.75 s for `complete`.

**Not verified with listeners.** This is a measurement, not a listening test. It suggests short cues at the default volume are close to easy to miss on laptop speakers, which is worth auditioning. If the output ceiling is raised, the plan contract's 25% default can stay as it is. A rough starting point to try is a 100% peak nearer −12 to −6 dBFS, which would put the 25% default around −24 to −18 dBFS.

To reproduce, in a page that has the library loaded:

```js
const buffer = await renderCue('playful', 'success');
const data = buffer.getChannelData(0);
const peak = Math.max(...data.map(Math.abs));
console.log(20 * Math.log10(peak)); // dBFS before the master gain
```

### 2. Install cost of a Git dependency (this corrects an earlier guess)

A first guess was that `prepare` building the playground made installs slow. The numbers say otherwise. On Node 24, Windows:

| Step | Time |
| --- | --- |
| `npm install github:…#sha` into the app | 109 s |
| `npm ci` of a clean clone (158 packages) | 45 s |
| `npm run build:library` | 12 s |
| `npm run build:playground` | 3 s |

The playground build is not the cost. Installing the dev dependencies (Vite 8, Vitest 5, Playwright Test, jsdom, tsup) so that `prepare` can build is. If install time matters to consumers, the options are prebuilt output (a release tarball or a `dist` branch) so they need none of the dev dependencies, or documenting the `npm pack` route. Nothing was changed here.

### 3. A `storageKey` prop on `SoundsProvider`

The helpers keep the core framework independent. A provider prop would save each app about ten lines, but it needs the restore-after-hydration care described in the API guide, so it was left as a decision for the author.

### 4. Guidance for hidden verdicts and for "the task finished"

SQL Land has exams that hide every verdict until the results page. Playing `success` or `error` there would give the result away, so each answer plays the same neutral `notification`. Separately, Run query plays `notification` when a query works and never `success`, because a listener could take a working query for a correct answer. The catalog's own example for `notification`, "a requested task finishes and its visible notification becomes available", describes both moments. Two sentences in the API guide would spare the next app the reasoning:

- Do not play `success` or `error` when the screen does not show the verdict.
- When "it worked" could be mistaken for "it is right", use `notification` for the former.

### 5. A cue cannot play before its event

Cues that follow a result arrive when the result does. SQL Land's first query waited about four seconds for an in-browser database to start, so the first Run and Check seemed silent. Warming that up earlier brought cues to 18 to 89 ms after the press. A note in the API guide would help: play at the event that confirms the result, and if that result is slow, do the slow work earlier.

### 6. The playground's choice is not visible to an agent

The chooser is in-memory state, which fits the rule that the agent must ask in the conversation. If agents are meant to cite a user's choice in a plan, an optional "copy my choice" line would make that easier. Low priority.

## What worked well

- The plan validator and its invalid examples caught real mistakes quickly, and the `play()` reason codes (`not-enabled`, `muted`, `busy`) made behavior easy to reason about.
- After the page loaded, no audio context was created until the Enable button was pressed, and then exactly one. Under Strict Mode, a one-time confirmation cue played when sound was enabled sounded exactly once. SQL Land did that with an effect that watched the state change, and `onEnabled` is the cleaner way to do it.
- `SoundControls` works from the keyboard: Tab moves through enable, mute and volume, and the arrow keys change and persist the volume.
- The library adds about 5.8 kB gzipped to the app bundle.
- The user-choice contract is clear enough to follow exactly. Asking for the style first meant nothing had to be undone.

## What was and was not run

Behavior was checked in Chromium by instrumenting `AudioContext` and counting scheduled sources, with each cue told apart by its length. Nobody listened to it there. `npm run check` passes on this branch. `npm run test:audio` and `npm run test:browser` were not run locally because Playwright's browsers are not installed on the machine used; they run in CI.
