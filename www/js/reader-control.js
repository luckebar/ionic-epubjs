(function (window) {
  'use strict';

  function ReaderControl() {
    this.callbacks = null;
    this.transport = null;
    this.settings = null;
    this.state = {
      pageIndex: 1,
      locator: '',
      lastCommand: null,
      lastCommandSource: null
    };
  }

  ReaderControl.prototype.registerPageCallbacks = function (callbacks) {
    console.log('[ReaderControl] register page callbacks');
    this.callbacks = callbacks;

    return function () {
      if (this.callbacks === callbacks) {
        console.log('[ReaderControl] unregister page callbacks');
        this.callbacks = null;
      }
    }.bind(this);
  };

  ReaderControl.prototype.setCurrentLocation = function (pageIndex, locator) {
    this.state.pageIndex = pageIndex || 1;
    this.state.locator = locator || '';
    console.log('[ReaderControl] location updated', this.state);
  };

  ReaderControl.prototype.setSettings = function (settings) {
    this.settings = settings || null;
    console.log('[ReaderControl] settings updated', this.settings);
  };

  ReaderControl.prototype.nextPage = function (source) {
    this.runPageCommand('NEXT_PAGE', source || 'ui');
  };

  ReaderControl.prototype.previousPage = function (source) {
    this.runPageCommand('PREVIOUS_PAGE', source || 'ui');
  };

  ReaderControl.prototype.customAction = function (source) {
    this.runPageCommand('CUSTOM_ACTION', source || 'external');
  };

  ReaderControl.prototype.renderCurrentPageForEink = function () {
    console.log('[ReaderControl] renderCurrentPageForEink placeholder', this.state);
    return window.EinkViewport.exportCurrentPageBitmapPlaceholder(this.state);
  };

  ReaderControl.prototype.sendCurrentPageToExternalDisplay = function (force) {
    if (this.settings && this.settings.eink && !this.settings.eink.enabled) {
      console.log('[ReaderControl] e-ink send skipped; disabled in settings');
      return;
    }

    if (!force && this.settings && this.settings.eink && !this.settings.eink.autoSend) {
      console.log('[ReaderControl] e-ink send skipped; auto-send disabled');
      return;
    }

    var frame = this.renderCurrentPageForEink();
    console.log('[ReaderControl] sendCurrentPageToExternalDisplay placeholder', frame);

    if (this.transport) {
      this.transport.sendFrame(frame);
    }
  };

  ReaderControl.prototype.attachExternalTransport = function (transport) {
    this.transport = transport;
    this.transport.onExternalInput(this.handleExternalInput.bind(this));
    console.log('[ReaderControl] external transport attached', transport.name);
  };

  ReaderControl.prototype.handleExternalInput = function (command) {
    console.log('[ReaderControl] external input received', command);

    if (command === 'ROT_LEFT') {
      this.previousPage('external');
    } else if (command === 'ROT_RIGHT') {
      this.nextPage('external');
    } else if (command === 'BTN_CLICK') {
      this.customAction('external');
    }
  };

  ReaderControl.prototype.simulateExternalInput = function (command) {
    console.log('[ReaderControl] simulate external input', command);
    this.handleExternalInput(command);
  };

  ReaderControl.prototype.runPageCommand = function (command, source) {
    this.state.lastCommand = command;
    this.state.lastCommandSource = source;
    console.log('[ReaderControl] command', command, 'source', source);

    if (!this.callbacks) {
      console.log('[ReaderControl] no active reader callbacks; command ignored');
      return;
    }

    if (command === 'NEXT_PAGE') {
      this.callbacks.nextPage();
    } else if (command === 'PREVIOUS_PAGE') {
      this.callbacks.previousPage();
    } else if (this.callbacks.customAction) {
      this.callbacks.customAction();
    }

    this.sendCurrentPageToExternalDisplay(false);
  };

  window.ReaderControl = ReaderControl;
})(window);
