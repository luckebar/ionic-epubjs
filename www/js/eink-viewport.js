(function (window) {
  'use strict';

  var profiles = {
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

  function getProfile(orientation) {
    return orientation === 'landscape' ? profiles.landscape800x480 : profiles.portrait480x800;
  }

  function resizeToTarget(sourceWidth, sourceHeight, orientation) {
    var target = getProfile(orientation);
    var scale = Math.min(target.width / sourceWidth, target.height / sourceHeight);

    return {
      width: Math.round(sourceWidth * scale),
      height: Math.round(sourceHeight * scale),
      targetWidth: target.width,
      targetHeight: target.height,
      scale: scale
    };
  }

  function exportCurrentPageBitmapPlaceholder(state) {
    var profile = getProfile('portrait');

    return {
      width: profile.width,
      height: profile.height,
      orientation: profile.orientation,
      locator: state.locator,
      pageIndex: state.pageIndex,
      data: null
    };
  }

  window.EinkViewport = {
    profiles: profiles,
    getProfile: getProfile,
    resizeToTarget: resizeToTarget,
    exportCurrentPageBitmapPlaceholder: exportCurrentPageBitmapPlaceholder
  };
})(window);
