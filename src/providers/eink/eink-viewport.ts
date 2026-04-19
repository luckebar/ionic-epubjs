import { FramePayload } from './external-transport';
import { ReaderState } from '../reader/reader-control.service';

export interface EinkViewportProfile {
  name: string;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
}

export const EINK_VIEWPORT_PROFILES: {[key: string]: EinkViewportProfile} = {
  portrait480x800: {
    name: 'portrait480x800',
    width: 480,
    height: 800,
    orientation: 'portrait'
  },
  landscape800x480: {
    name: 'landscape800x480',
    width: 800,
    height: 480,
    orientation: 'landscape'
  }
};

export function getEinkViewportProfile(orientation: 'portrait' | 'landscape' = 'portrait'): EinkViewportProfile {
  return orientation === 'landscape'
    ? EINK_VIEWPORT_PROFILES.landscape800x480
    : EINK_VIEWPORT_PROFILES.portrait480x800;
}

export function resizeToEinkTarget(sourceWidth: number, sourceHeight: number, orientation: 'portrait' | 'landscape' = 'portrait') {
  let target = getEinkViewportProfile(orientation);
  let ratio = Math.min(target.width / sourceWidth, target.height / sourceHeight);

  return {
    width: Math.round(sourceWidth * ratio),
    height: Math.round(sourceHeight * ratio),
    targetWidth: target.width,
    targetHeight: target.height,
    scale: ratio
  };
}

export function exportCurrentPageBitmapPlaceholder(state: ReaderState): FramePayload {
  let profile = getEinkViewportProfile('portrait');

  return {
    width: profile.width,
    height: profile.height,
    orientation: profile.orientation,
    locator: state.locator,
    pageIndex: state.pageIndex,
    data: null
  };
}
