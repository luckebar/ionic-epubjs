const fs = require('fs');
const path = require('path');

module.exports = function (context) {
  const projectRoot = context.opts.projectRoot;
  const manifestPath = path.join(projectRoot, 'platforms', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

  if (!fs.existsSync(manifestPath)) {
    return;
  }

  let manifest = fs.readFileSync(manifestPath, 'utf8');
  if (manifest.includes('android:usesCleartextTraffic=')) {
    manifest = manifest.replace(/android:usesCleartextTraffic="[^"]*"/, 'android:usesCleartextTraffic="true"');
  } else {
    manifest = manifest.replace('<application ', '<application android:usesCleartextTraffic="true" ');
  }

  fs.writeFileSync(manifestPath, manifest);
};
