// File: scripts/notarize.js
const { notarize } = require('electron-notarize');
const path = require('path');
const fs = require('fs');

// Read package.json to get app ID
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const appId = packageJson.build.appId;

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization for non-macOS platform');
    return;
  }

  // Get the app name from context
  const appName = context.packager.appInfo.productFilename;

  console.log(`Notarizing ${appId} in ${appOutDir}/${appName}.app`);

  // Check if environment variables are set
  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD) {
    console.warn('Skipping notarization: APPLE_ID and/or APPLE_ID_PASSWORD environment variables not set');
    return;
  }

  try {
    await notarize({
      appBundleId: appId,
      appPath: `${appOutDir}/${appName}.app`,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    });
    
    console.log(`Successfully notarized ${appName}`);
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};