# LB-EReader Android controls

## Summary

This project is a Cordova Android app with cordova-android 14, OnsenUI, jQuery and epub.js 0.3. The active app lives in `www/`, with native Android helpers in `plugins-local/`.

## What changed

Touched files:

- `www/index.html`
- `www/css/app.css`
- `www/js/app.js`
- `www/js/reader-control.js`
- `www/js/native-controls.js`
- `www/js/external-transport.js`
- `www/js/eink-viewport.js`
- `www/assets/books/moby-dick.epub`
- `.gitignore`
- `config.xml`
- `package.json`
- `package-lock.json`
- `docs/eink-reader-architecture.md`

Plugin declared:

- `cordova-plugin-music-controls2`
- `cordova-sqlite-storage`

Removed plugin:

- `cordova-plugin-whitelist`, because modern cordova-android includes whitelist handling and the old plugin does not compile with cordova-android 14.

## Reader command flow

`www/js/reader-control.js` is the central command service. It stores:

- current page index
- current EPUB locator / CFI
- last command
- last command source

`www/js/app.js` registers callbacks with the service when a book is opened. UI buttons, tap zones, native notification callbacks, volume buttons and future external hardware commands use the same service methods.

## Media notification

`www/js/native-controls.js` initializes `cordova-plugin-music-controls2` when Cordova and `window.MusicControls` are available.

Configured notification behavior:

- title: `LB-EReader`
- previous button enabled
- next button enabled
- `dismissable: false`
- no close button

The service maps:

- `music-controls-previous` to previous page
- `music-controls-next` to next page

If the plugin is missing or the app runs in a browser, initialization is skipped with a diagnostic log.

## Foreground volume keys

Volume page controls are enabled by the exported constant:

```js
var ENABLE_VOLUME_PAGE_CONTROLS = true;
```

in `www/js/native-controls.js`.

Mappings:

- volume up -> previous page
- volume down -> next page

This uses Cordova foreground events `volumeupbutton` and `volumedownbutton`.

## E-ink display scaffold

`www/js/external-transport.js` defines the transport shape:

- `connect()`
- `disconnect()`
- `sendFrame(frame)`
- `sendCommand(cmd)`
- `onExternalInput(callback)`

`UsbSerialTransport` is currently a stub. It logs calls and exposes `simulateInput()` for local tests. This is the intended adapter point for a future Android Cordova plugin using `usb-serial-for-android`.

`www/js/eink-viewport.js` defines initial target profiles:

- portrait `480x800`
- landscape `800x480`

It also includes `resizeToEinkTarget()` and `exportCurrentPageBitmapPlaceholder()`.

## External hardware input scaffold

The prepared input commands are:

- `ROT_LEFT`
- `ROT_RIGHT`
- `BTN_CLICK`

Current mapping:

- `ROT_LEFT` -> previous page
- `ROT_RIGHT` -> next page
- `BTN_CLICK` -> custom action placeholder

For now, call `window.readerApp.simulateExternalInput('ROT_RIGHT')` or use the settings dialog simulation buttons.

## Persistent settings

`www/js/settings-store.js` stores app settings in SQLite on Android through `cordova-sqlite-storage`.

When the SQLite plugin is not available, such as during browser testing, the same store falls back to IndexedDB.

Current persisted settings:

- Jellyfin enabled flag
- Jellyfin server URL
- Jellyfin username
- Jellyfin password
- local progress enabled flag
- Jellyfin progress sync enabled flag
- external e-ink enabled flag
- external e-ink auto-send flag

The database is named `eink_reader.db`. Settings are currently stored in a simple `settings` key/value table so future catalog, download and reading-progress tables can be added without changing the UI contract.

## Jellyfin catalog scaffold

`www/js/jellyfin-client.js` handles the first Jellyfin REST calls:

- `POST /Users/AuthenticateByName`
- `GET /Items`
- `GET /Items?parentId=...`

The Settings page can sign in with the saved server URL, username and password. It stores the returned Jellyfin access token and user id in the persistent settings table.

The `Sync catalog` button opens a remote catalog browser. It lists Jellyfin libraries, folders and items from `/Items`; selecting a folder navigates deeper with `parentId`. Selecting a non-folder logs the item and shows that download is not implemented yet.

Remote catalog responses are cached in the `jellyfin_catalog` database table:

- `id`
- `parent_id`
- `name`
- `type`
- `is_folder`
- `raw_json`
- `updated_at`

The cache is only a fallback for failed remote loads at this stage. It does not download books.

## How to test

1. Install dependencies and Cordova plugins:

```bash
npm install
npm run prepare:android
```

2. Run on Android:

```bash
npm run run:android
```

The debug APK is generated at `platforms/android/app/build/outputs/apk/debug/app-debug.apk`.

3. Open a book.

4. Test notification controls:

- pull down the Android notification shade
- tap previous / next
- watch logs for `[ReaderNativeControls] media command received`
- watch logs for `[ReaderControl] command`

5. Test volume controls while the app is foregrounded:

- press volume up for previous page
- press volume down for next page
- watch logs for `[ReaderNativeControls] volume up` or `volume down`

6. Test e-ink placeholders:

- every reader command calls `renderCurrentPageForEink()`
- every reader command calls `sendCurrentPageToExternalDisplay()`
- with the current stub, logs appear from `[UsbSerialTransport] sendFrame placeholder`

## Current limits

- Real bitmap/canvas export is not implemented yet.
- Real USB serial transport is not implemented yet.
- The media notification depends on `cordova-plugin-music-controls2` being installed by Cordova.
- OnsenUI, jQuery and epub.js are bundled under `www/`.

## Recommended next steps

- Add a local Cordova plugin for Android USB serial transport.
- Back the plugin with `usb-serial-for-android`.
- Add a debug page or dev-only command surface for simulated external input.
- Replace `exportCurrentPageBitmapPlaceholder()` with a real canvas or bitmap export of the rendered EPUB viewport.
