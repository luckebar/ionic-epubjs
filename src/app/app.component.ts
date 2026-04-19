
import { Component } from '@angular/core';
import { Platform } from 'ionic-angular';
import { StatusBar } from '@ionic-native/status-bar';
import { SplashScreen } from '@ionic-native/splash-screen';

import { HomePage } from '../pages/home/home';
import { ReaderControlService } from '../providers/reader/reader-control.service';
import { ReaderNativeControlsService } from '../providers/reader/reader-native-controls.service';
import { UsbSerialTransport } from '../providers/eink/external-transport';

@Component({
  templateUrl: 'app.html'
})
export class MyApp {
  rootPage:any = HomePage;

  constructor(
    platform: Platform,
    statusBar: StatusBar,
    splashScreen: SplashScreen,
    readerControl: ReaderControlService,
    readerNativeControls: ReaderNativeControlsService
  ) {
    platform.ready().then(() => {
      // Okay, so the platform is ready and our plugins are available.
      // Here you can do any higher level native things you might need.
      statusBar.styleDefault();
      splashScreen.hide();
      readerControl.attachExternalTransport(new UsbSerialTransport());
      readerNativeControls.initialize();
    });
  }
}

