const fs = require('fs');
const path = require('path');

const files = ['**/*', 'icon.png'];
if (fs.existsSync(path.join(__dirname, '.env'))) {
  files.push('.env');
}

module.exports = {
  appId: 'com.vapeshop.printagent',
  productName: 'Pod e Mais',
  artifactName: 'print-agent-setup.exe',
  files,
  publish: [
    {
      provider: 'github',
      owner: 'thiekokumagai',
      repo: 'print-agent',
      releaseType: 'release',
    },
  ],
  win: {
    target: 'nsis',
    icon: 'icon.ico',
    requestedExecutionLevel: 'asInvoker',
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Pod e Mais',
    installerIcon: 'icon.ico',
    uninstallerIcon: 'icon.ico',
    deleteAppDataOnUninstall: true,
    include: 'installer.nsh',
  },
};