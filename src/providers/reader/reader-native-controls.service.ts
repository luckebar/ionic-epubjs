import { Injectable } from '@angular/core';
import { Platform } from 'ionic-angular';
import { ReaderControlService } from './reader-control.service';

declare var window: any;

export const ENABLE_VOLUME_PAGE_CONTROLS = true;

@Injectable()
export class ReaderNativeControlsService {
  private initializedMusicControls: boolean = false;
  private initializedVolumeControls: boolean = false;

  constructor(
    private platform: Platform,
    private readerControl: ReaderControlService
  ) {}

  initialize() {
    this.initializeMusicControls();
    this.initializeVolumeControls();
  }

  initializeMusicControls() {
    if (this.initializedMusicControls) {
      return;
    }

    if (!this.platform.is('cordova') || !window.MusicControls) {
      console.log('[ReaderNativeControls] MusicControls plugin not available');
      return;
    }

    this.initializedMusicControls = true;
    console.log('[ReaderNativeControls] creating persistent media notification');

    window.MusicControls.create({
      track: 'E-ink Reader',
      artist: 'Ionic EPUB reader',
      isPlaying: true,
      dismissable: false,
      hasPrev: true,
      hasNext: true,
      hasClose: false,
      hasSkipForward: false,
      hasSkipBackward: false,
      ticker: 'E-ink Reader',
      notificationIcon: 'icon'
    }, () => {
      console.log('[ReaderNativeControls] media notification ready');
      window.MusicControls.subscribe((action) => this.handleMusicControlAction(action));
      window.MusicControls.listen();
    }, (error) => {
      console.log('[ReaderNativeControls] media notification error', error);
    });
  }

  initializeVolumeControls() {
    if (this.initializedVolumeControls || !ENABLE_VOLUME_PAGE_CONTROLS) {
      return;
    }

    this.initializedVolumeControls = true;
    document.addEventListener('volumeupbutton', (event) => {
      console.log('[ReaderNativeControls] volume up -> previous page');
      event.preventDefault();
      this.readerControl.previousPage('volume');
    }, false);

    document.addEventListener('volumedownbutton', (event) => {
      console.log('[ReaderNativeControls] volume down -> next page');
      event.preventDefault();
      this.readerControl.nextPage('volume');
    }, false);
  }

  destroyMusicControls() {
    if (window.MusicControls) {
      console.log('[ReaderNativeControls] destroy media notification');
      window.MusicControls.destroy();
    }
  }

  private handleMusicControlAction(action) {
    let parsedAction = this.parseMusicControlAction(action);
    console.log('[ReaderNativeControls] media command received', parsedAction);

    if (parsedAction === 'music-controls-next') {
      this.readerControl.nextPage('notification');
    } else if (parsedAction === 'music-controls-previous') {
      this.readerControl.previousPage('notification');
    } else if (parsedAction === 'music-controls-destroy') {
      this.destroyMusicControls();
    }
  }

  private parseMusicControlAction(action): string {
    if (typeof action === 'string') {
      try {
        let parsed = JSON.parse(action);
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
  }
}
