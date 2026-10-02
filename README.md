# Sounds for Agents

Original interface sounds and agent skill.

Three styles, **Soft**, **Tactile**, and **Playful**, each with four sounds: **success**, **error**, **completion**, and **notification** (`complete` in the API). All twelve are synthesized in code, so there are no audio files.

## Listen and choose

```sh
npm ci
npm run dev
```

Open the playground at <http://127.0.0.1:5186> and press **Enable sounds**. Play any sound on its own, or one event in all three styles, then pick your favorite. Picking a style here doesn't add sound to any app. Your agent will still ask you.

## Agent workflow

The skill is [skills/sounds-for-agents/SKILL.md](skills/sounds-for-agents/SKILL.md). When you install it for an agent, copy the whole `sounds-for-agents` folder. `SKILL.md` needs the `references/` folder beside it.

1. Find the moments that already show feedback on screen.
2. Let the user hear Soft, Tactile, and Playful, and ask which one they want. Off is an option.
3. Wait for their answer before adding any sound, and don't guess. If they already chose for this app, reuse that choice.
4. Record the choice and the moments that play a sound in a [sound plan](examples), and add sound for those moments only.

Sound starts off, at 25% volume. The listener turns it on with a click, tap, or key press. Mute, volume, stop, and disable controls are always there. Everything on screen still works with sound off, and sound settings are separate from motion settings.

## React

Once the user has chosen a style, wrap the part of your app that needs sound in `SoundsProvider`. The controls come unstyled, so style them with your app's own CSS.

```tsx
import { SoundsProvider, SoundControls, useSounds } from '@sounds-for-agents/react';

function QueryAction() {
  const sounds = useSounds();

  async function runQuery() {
    try {
      await executeQuery();
      showResult('Query completed'); // Always show the result on screen too.
      sounds.play('success');
    } catch {
      showResult('Query failed');
      sounds.play('error');
    }
  }

  return <button onClick={runQuery}>Run query</button>;
}

// Use the style your user chose for this app. "soft" is only an example.
function App() {
  return <SoundsProvider style="soft">
    <SoundControls />
    <QueryAction />
  </SoundsProvider>;
}
```

`executeQuery` and `showResult` stand in for your own code. If sound is off, muted, interrupted, or busy, `play()` plays nothing and returns `accepted: false` with a reason.

Also available (see the [API guide](skills/sounds-for-agents/references/api.md)):

- `useSoundPlayer()`: a `play` and `stop` that never change, so components that only play sounds don't re-render when the volume moves.
- `data-sound-control` attributes on `SoundControls` for styling, and an `onEnabled` callback for a short confirmation sound.
- `loadSoundPreferences` and `saveSoundPreferences`: remember volume and mute, never whether sound is on.

## Without React

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
// Call sounds.dispose() when whatever created the engine goes away.
```

The core needs neither React nor an audio library, and creating an engine doesn't start any audio. See the [API and integration guide](skills/sounds-for-agents/references/api.md).

## Plans and checks

```sh
npm run plan:validate -- examples/soft-plan.json
npm run check
npx playwright install chromium  # once, for the next two
npm run test:audio
npm run test:browser
```

The validator checks a plan's structure: the choice, sound off by default, the controls, and which event gets which sound. It **can't** tell whether a person really made that choice, so the agent has to ask in the conversation.

## Status

This is an early (v0.1) source repo. The package, `@sounds-for-agents/react`, isn't published to npm, and it's marked `private` and `UNLICENSED` for now. (`private` only blocks npm publishing. It doesn't make this repo private.) To try it in an app, run `npm pack` here and install the tarball it makes.

Sounds are short and never overlap, and stopping fades them out. Audio only starts from a user action, and the user controls follow [MDN's Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices). What you hear still depends on the browser and the device's audio settings.
