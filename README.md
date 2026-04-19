# E-ink Reader Cordova

Cordova Android ebook reader base using OnsenUI, jQuery and epub.js.

The previous Ionic 3 source is still present in `src/` as legacy reference, but the runnable Cordova app now lives in `www/`.

## Stack

- Cordova Android
- cordova-android 14.0.1
- OnsenUI 2.12.8
- jQuery 3.7.1
- epub.js 0.3.93

OnsenUI, jQuery and epub.js are loaded from CDN in `www/index.html`. The included offline test book is `www/assets/books/moby-dick.epub`.

## Functionality

- Open a local EPUB.
- Read with epub.js 0.3 paginated rendition.
- Navigate with previous / next buttons.
- Navigate by tapping left / right reader zones.
- Use Android media notification previous / next through `cordova-plugin-music-controls2`.
- Use volume up / down in foreground.
- Simulate future hardware commands from the settings dialog.
- Keep an e-ink transport scaffold for future USB serial integration.

## Development

1. Run `npm install`.
2. Run `npm run prepare:android`.
3. Run `npm run build:android` or `npm run run:android`.

The debug APK is generated at `platforms/android/app/build/outputs/apk/debug/app-debug.apk`.

## Android e-ink reader controls

This fork includes an Android-first scaffold for persistent media-style page controls, foreground volume-key page controls and a future external e-ink display transport. See `docs/eink-reader-architecture.md` for the command flow, test steps and current limits.

## Information + Resources

* Good to know
  * Cfi = [EPUB Canonical Fragment Identifiers](http://www.idpf.org/epub/linking/cfi/epub-cfi.html)
  * EPUB is a registered trademark of the [IDPF](http://idpf.org/)

* Epub.js
  * [https://github.com/futurepress/epub.js](https://github.com/futurepress/epub.js)
  * [https://github.com/futurepress/epub.js/blob/master/documentation/README.md](https://github.com/futurepress/epub.js/blob/master/documentation/README.md)
    * [https://github.com/futurepress/epub.js/blob/master/documentation/README.md#methods](https://github.com/futurepress/epub.js/blob/master/documentation/README.md#methods)
    * [https://github.com/futurepress/epub.js/blob/master/documentation/README.md#events](https://github.com/futurepress/epub.js/blob/master/documentation/README.md#events)
  * [https://github.com/futurepress/epub.js/wiki/Tips-and-Tricks](https://github.com/futurepress/epub.js/wiki/Tips-and-Tricks)
  * Examples
    * [http://futurepress.github.io/epub.js/](http://futurepress.github.io/epub.js/)
    * [https://github.com/futurepress/epub.js/tree/master/examples](https://github.com/futurepress/epub.js/tree/master/examples)

## Related projects

* There is a [Ionic v1 based "Ionic Reader"](https://github.com/Nipun04/Ionic-Reader) that also uses Epub.js. It claims to "fix iOS flickering" and also has additional features "Last location, Go to location, Bookmarks, Highlights"
