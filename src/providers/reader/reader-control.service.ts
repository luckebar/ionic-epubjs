import { Injectable } from '@angular/core';
import { ExternalInputCommand, ExternalTransport, FramePayload } from '../eink/external-transport';
import { exportCurrentPageBitmapPlaceholder } from '../eink/eink-viewport';

export type ReaderCommand = 'NEXT_PAGE' | 'PREVIOUS_PAGE' | 'CUSTOM_ACTION';
export type ReaderCommandSource = 'ui' | 'notification' | 'volume' | 'external' | 'test';

export interface ReaderState {
  pageIndex: number;
  locator: string;
  lastCommand: ReaderCommand;
  lastCommandSource: ReaderCommandSource;
}

export interface ReaderPageCallbacks {
  nextPage: () => void;
  previousPage: () => void;
  customAction?: () => void;
}

@Injectable()
export class ReaderControlService {
  private callbacks: ReaderPageCallbacks;
  private transport: ExternalTransport;

  state: ReaderState = {
    pageIndex: 1,
    locator: '',
    lastCommand: null,
    lastCommandSource: null
  };

  registerPageCallbacks(callbacks: ReaderPageCallbacks): () => void {
    console.log('[ReaderControl] register page callbacks');
    this.callbacks = callbacks;

    return () => {
      if (this.callbacks === callbacks) {
        console.log('[ReaderControl] unregister page callbacks');
        this.callbacks = null;
      }
    };
  }

  setCurrentLocation(pageIndex: number, locator?: string) {
    this.state.pageIndex = pageIndex || 1;
    this.state.locator = locator || '';
    console.log('[ReaderControl] location updated', this.state);
  }

  nextPage(source: ReaderCommandSource = 'ui') {
    this.runPageCommand('NEXT_PAGE', source);
  }

  previousPage(source: ReaderCommandSource = 'ui') {
    this.runPageCommand('PREVIOUS_PAGE', source);
  }

  customAction(source: ReaderCommandSource = 'external') {
    this.runPageCommand('CUSTOM_ACTION', source);
  }

  renderCurrentPageForEink(): FramePayload {
    console.log('[ReaderControl] renderCurrentPageForEink placeholder', this.state);
    return exportCurrentPageBitmapPlaceholder(this.state);
  }

  sendCurrentPageToExternalDisplay() {
    let frame = this.renderCurrentPageForEink();
    console.log('[ReaderControl] sendCurrentPageToExternalDisplay placeholder', frame);

    if (this.transport) {
      this.transport.sendFrame(frame);
    }
  }

  attachExternalTransport(transport: ExternalTransport) {
    this.transport = transport;
    this.transport.onExternalInput((command) => this.handleExternalInput(command));
    console.log('[ReaderControl] external transport attached', transport.name);
  }

  handleExternalInput(command: ExternalInputCommand) {
    console.log('[ReaderControl] external input received', command);

    if (command === 'ROT_LEFT') {
      this.previousPage('external');
    } else if (command === 'ROT_RIGHT') {
      this.nextPage('external');
    } else if (command === 'BTN_CLICK') {
      this.customAction('external');
    }
  }

  simulateExternalInput(command: ExternalInputCommand) {
    console.log('[ReaderControl] simulate external input', command);
    this.handleExternalInput(command);
  }

  private runPageCommand(command: ReaderCommand, source: ReaderCommandSource) {
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

    this.sendCurrentPageToExternalDisplay();
  }
}
