(function (window, document) {
  'use strict';

  var ENABLE_VOLUME_PAGE_CONTROLS = true;

  function NativeControls(readerControl) {
    this.readerControl = readerControl;
    this.initializedMusicControls = false;
    this.initializedVolumeControls = false;
    this.shuttingDownMusicControls = false;
  }

  NativeControls.prototype.initialize = function () {
    this.initializeMusicControls();
    this.initializeVolumeControls();
    this.initializeLifecycleHooks();
  };

  NativeControls.prototype.initializeMusicControls = function () {
    if (this.initializedMusicControls) {
      return;
    }

    if (this.shuttingDownMusicControls) {
      return;
    }

    if (!window.MusicControls) {
      console.log('[ReaderNativeControls] MusicControls plugin not available');
      return;
    }

    this.initializedMusicControls = true;
    console.log('[ReaderNativeControls] creating persistent media notification');

    window.MusicControls.create({
      track: 'LB-EReader',
      artist: 'OnsenUI EPUB reader',
      isPlaying: true,
      dismissable: false,
      hasPrev: true,
      hasNext: true,
      hasClose: false,
      hasSkipForward: false,
      hasSkipBackward: false,
      ticker: 'LB-EReader',
      notificationIcon: 'icon'
    }, function () {
      console.log('[ReaderNativeControls] media notification ready');
      window.MusicControls.subscribe(this.handleMusicControlAction.bind(this));
      window.MusicControls.listen();
      window.MusicControls.updateIsPlaying(true);
    }.bind(this), function (error) {
      console.log('[ReaderNativeControls] media notification error', error);
    });
  };

  NativeControls.prototype.initializeLifecycleHooks = function () {
    document.addEventListener('resume', function () {
      this.refreshMusicControls('resume');
    }.bind(this), false);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        this.refreshMusicControls('visible');
      }
    }.bind(this), false);
  };

  NativeControls.prototype.refreshMusicControls = function (source) {
    if (!window.MusicControls || !this.initializedMusicControls) {
      return;
    }

    if (this.shuttingDownMusicControls) {
      return;
    }

    console.log('[ReaderNativeControls] refresh media controls', source);
    window.MusicControls.subscribe(this.handleMusicControlAction.bind(this));
    window.MusicControls.listen();
    window.MusicControls.updateIsPlaying(true);
  };

  NativeControls.prototype.initializeVolumeControls = function () {
    if (this.initializedVolumeControls || !ENABLE_VOLUME_PAGE_CONTROLS) {
      return;
    }

    this.initializedVolumeControls = true;
    document.addEventListener('volumeupbutton', function (event) {
      console.log('[ReaderNativeControls] volume up -> previous page');
      event.preventDefault();
      this.readerControl.previousPage('volume');
    }.bind(this), false);

    document.addEventListener('volumedownbutton', function (event) {
      console.log('[ReaderNativeControls] volume down -> next page');
      event.preventDefault();
      this.readerControl.nextPage('volume');
    }.bind(this), false);
  };

  NativeControls.prototype.destroyMusicControls = function () {
    this.shuttingDownMusicControls = true;
    this.initializedMusicControls = false;

    if (window.MusicControls) {
      console.log('[ReaderNativeControls] destroy media notification');
      window.MusicControls.destroy();
    }
  };

  NativeControls.prototype.handleMusicControlAction = function (action) {
    var parsedAction = this.parseMusicControlAction(action);
    console.log('[ReaderNativeControls] media command received', parsedAction);

    if (this.shuttingDownMusicControls || !this.initializedMusicControls) {
      return;
    }

    if (parsedAction === 'music-controls-stop-listening') {
      return;
    }

    if (parsedAction === 'music-controls-next' || parsedAction === 'music-controls-media-button-next') {
      this.readerControl.nextPage('notification');
    } else if (parsedAction === 'music-controls-previous' || parsedAction === 'music-controls-media-button-previous') {
      this.readerControl.previousPage('notification');
    } else if (parsedAction === 'music-controls-destroy') {
      this.destroyMusicControls();
    }

    if (window.MusicControls && parsedAction !== 'music-controls-destroy') {
      setTimeout(function () {
        if (this.shuttingDownMusicControls || !this.initializedMusicControls) {
          return;
        }

        window.MusicControls.updateIsPlaying(true);
      }.bind(this), 0);
    }
  };

  NativeControls.prototype.parseMusicControlAction = function (action) {
    if (typeof action === 'string') {
      try {
        var parsed = JSON.parse(action);
        return parsed.message || parsed.action || action;
      } catch (error) {
        return action;
      }
    }

    if (action && action.message) {
      return action.message;
    }

    if (action && action.action) {
      return action.action;
    }

    return '';
  };

  window.ReaderNativeControls = NativeControls;
  window.ENABLE_VOLUME_PAGE_CONTROLS = ENABLE_VOLUME_PAGE_CONTROLS;
})(window, document);
