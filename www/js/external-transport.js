(function (window) {
  'use strict';

  function UsbSerialTransport() {
    this.name = 'UsbSerialTransport';
    this.inputCallback = null;
  }

  UsbSerialTransport.prototype.connect = function () {
    console.log('[UsbSerialTransport] connect placeholder');
    return Promise.resolve();
  };

  UsbSerialTransport.prototype.disconnect = function () {
    console.log('[UsbSerialTransport] disconnect placeholder');
    return Promise.resolve();
  };

  UsbSerialTransport.prototype.sendFrame = function (frame) {
    console.log('[UsbSerialTransport] sendFrame placeholder', frame);
    return Promise.resolve();
  };

  UsbSerialTransport.prototype.sendCommand = function (command) {
    console.log('[UsbSerialTransport] sendCommand placeholder', command);
    return Promise.resolve();
  };

  UsbSerialTransport.prototype.onExternalInput = function (callback) {
    console.log('[UsbSerialTransport] onExternalInput registered');
    this.inputCallback = callback;
  };

  UsbSerialTransport.prototype.simulateInput = function (command) {
    console.log('[UsbSerialTransport] simulateInput', command);
    if (this.inputCallback) {
      this.inputCallback(command);
    }
  };

  window.ExternalTransports = {
    UsbSerialTransport: UsbSerialTransport
  };
})(window);
