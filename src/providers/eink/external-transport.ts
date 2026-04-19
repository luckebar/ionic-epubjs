export type ExternalInputCommand = 'ROT_LEFT' | 'ROT_RIGHT' | 'BTN_CLICK';

export interface FramePayload {
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  locator: string;
  pageIndex: number;
  data?: any;
}

export interface ExternalTransport {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendFrame(frame: FramePayload): Promise<void>;
  sendCommand(command: string): Promise<void>;
  onExternalInput(callback: (command: ExternalInputCommand) => void): void;
}

export class UsbSerialTransport implements ExternalTransport {
  name: string = 'UsbSerialTransport';
  private inputCallback: (command: ExternalInputCommand) => void;

  connect(): Promise<void> {
    console.log('[UsbSerialTransport] connect placeholder');
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    console.log('[UsbSerialTransport] disconnect placeholder');
    return Promise.resolve();
  }

  sendFrame(frame: FramePayload): Promise<void> {
    console.log('[UsbSerialTransport] sendFrame placeholder', frame);
    return Promise.resolve();
  }

  sendCommand(command: string): Promise<void> {
    console.log('[UsbSerialTransport] sendCommand placeholder', command);
    return Promise.resolve();
  }

  onExternalInput(callback: (command: ExternalInputCommand) => void): void {
    console.log('[UsbSerialTransport] onExternalInput registered');
    this.inputCallback = callback;
  }

  simulateInput(command: ExternalInputCommand) {
    console.log('[UsbSerialTransport] simulateInput', command);
    if (this.inputCallback) {
      this.inputCallback(command);
    }
  }
}
