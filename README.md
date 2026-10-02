# Sounds for Agents

Original interface sounds and with agent skill.

The library includes all twelve cues from the approved listening preview: **Soft**, **Tactile**, and **Playful**, each with **success**, **error**, **completion**, and **notification**. The API calls completion `complete`.

## Listen and choose

```sh
npm ci
npm run dev
```

Open the listening playground at <http://127.0.0.1:5186>. Enable sounds, audition individual cues or compare the same event across all three styles, then choose a preferred style. Choosing a style in the preview does not enable sound in another app.

## Agent workflow

The portable skill is [skills/sounds-for-agents/SKILL.md](skills/sounds-for-agents/SKILL.md). Keep its folder and supporting references together when installing it in an agent's skill library.

1. Inspect the app and identify events that already have visible feedback.
2. Present a playable audition of Soft, Tactile, and Playful. Ask which style the user wants, including Off.
3. Wait for an explicit choice before adding sound to the app. Reuse a previously approved choice for the same scope.
4. Record the choice and event mappings in a [sound plan](examples), then integrate only that approved scope.

The runtime starts with sound off at 25% volume. Enabling audio requires a user interaction inside the app. Mute, volume, stop, and disable controls remain available, and visible feedback works independently of sound. Sound preferences are separate from motion preferences.

## React

After the user selects a style, mount the provider around the relevant app surface. The library and its controls are unstyled; use the app's existing CSS.

```tsx
import { SoundsProvider, SoundControls, useSounds } from '@sounds-for-agents/react';

function QueryAction() {
  const sounds = useSounds();

  async function runQuery() {
    try {
      await executeQuery();
      showResult('Query completed'); // Visible feedback remains essential.
      sounds.play('success');
    } catch {
      showResult('Query failed');
      sounds.play('error');
    }
  }

  return <button onClick={runQuery}>Run query</button>;
}

// Example only: use the style explicitly selected for this app.
function App() {
  return <SoundsProvider style="soft">
    <SoundControls />
    <QueryAction />
  </SoundsProvider>;
}
```

`executeQuery` and `showResult` above stand for the consuming app's existing logic. Playback returns a result and gracefully declines when sound is disabled, muted, interrupted, or already playing.

## Framework-independent core

```ts
import { createSoundEngine } from '@sounds-for-agents/react/core';

const sounds = createSoundEngine({ style: 'tactile' });
enableButton.addEventListener('click', () => { void sounds.enable(); });
saveButton.addEventListener('click', async () => {
  try {
    await saveChanges();
    showSavedMessage();
    sounds.play('success');
  } catch (error) {
    showSaveError(error);
    sounds.play('error');
  }
});
// Dispose when the owning surface is removed.
```

The core requires no React or audio library. Importing or constructing it creates no live audio context. See the [API and integration guide](skills/sounds-for-agents/references/api.md).

## Plans and checks

```sh
npm run plan:validate -- examples/soft-plan.json
npm run check
npx playwright install chromium
npm run test:audio
npm run test:browser
```

The validator checks the recorded choice, default-off settings, controls, and event mappings. It does **not** authenticate a user's approval; the agent must obtain that choice in the conversation.

## Package status

This is a v0.1 source repository. The package is `@sounds-for-agents/react`, remains `private: true` and `UNLICENSED`, and has not been published to npm. GitHub repository visibility is independent of the npm flag. To consume a built local package, run `npm pack` and install the resulting tarball in your app. A license and npm release are separate decisions.

The synthesized cues are original; there are no external samples or audio downloads. The library schedules bounded cues, rejects overlapping playback, fades stopped cues, and cleans up audio resources. Browser activation and user-control behavior follows [MDN Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices). Physical-device playback still depends on the browser and device audio settings.
