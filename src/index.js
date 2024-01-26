const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog
} = require('electron');
const path = require('path');
const {
  mainProccess,
  stopProccess,
  link
} = require('./bot/main');
const {
  autoUpdater
} = require('electron-updater');
const fs = require('fs')

if (require('electron-squirrel-startup')) {
  app.quit();
}

let updateCheckInProgress = false;

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#124F6A',
      symbolColor: '#fff'
    },
    icon: path.join(__dirname, './assets/logo.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: !app.isPackaged
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  app.isPackaged && Menu.setApplicationMenu(null)
  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update_progress', progress.percent);
  });

  autoUpdater.checkForUpdatesAndNotify();
  autoUpdater.on('update-available', () => {
    updateCheckInProgress = false;
    mainWindow.webContents.send('update_available');
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update_downloaded');
  });
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

let domain;

ipcMain.on('main', async (event, data) => {
  const logs = [];
  const prog = [];

  const logToTextarea = (message) => {
    logs.push(message);
    event.sender.send('log', logs.join('\n'));
  };

  const proggress = (pros) => {
    prog.push(pros);
    event.sender.send('proggress', prog);
  };

  try {
    logToTextarea('[INFO] Process started...');
    event.sender.send("run");
    domain = data.dom
    await mainProccess(logToTextarea, proggress, data)
    logToTextarea('[INFO] Process completed successfully.');
    event.sender.send("force");
  } catch (error) {
    event.sender.send("force");
    logToTextarea('[ERROR] ' + error.message);
  }
});

ipcMain.on('stop', (event) => {
  const logs = [];

  const logToTextarea = (message) => {
    logs.push(message);
    event.sender.send('log', logs.join('\n'));
  };

  stopProccess(logToTextarea);
  event.sender.send("force");
});

ipcMain.on('app_version', (event) => {
  event.sender.send('app_version', {
    version: app.getVersion()
  });
});

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.on('save', (event) => {
  const options = {
    title: `Save a Permalink File from domain ${domain}`,
    defaultPath: `${domain}.txt`,
    filters: [{
      name: '.txt',
      extensions: ['txt']
    }]
  };

  dialog.showSaveDialog(options).then(result => {
    if (!result.canceled) {
      const content = link.join("\n")
      fs.writeFileSync(result.filePath, content);
      dialog.showMessageBox({
        type: 'info',
        title: 'Alert',
        message: 'Successfully saved the text file',
        buttons: ['OK']
      });
    } else {
      dialog.showMessageBox({
        type: 'info',
        title: 'Alert',
        message: 'Failed to save the text file',
        buttons: ['OK']
      });
    }
  }).catch(err => {
    console.error(err);
  });
});