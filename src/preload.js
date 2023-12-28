const {
    ipcRenderer
} = require("electron");
const showLogCheckbox = document.querySelector('#show');
const boxLog = document.getElementById('fieldLog')
const logTextarea = document.getElementById('log')
const progs = document.getElementById('prog')
const files = document.getElementById('txt');
const cookies = document.getElementById('json');
const visibleToggle = document.getElementById('visible')
const dom = document.getElementById('domain');
const start = document.getElementById('start');
const stop = document.getElementById('stop');
const version = document.getElementById('version')
const warp = document.getElementById('warp');
const message = document.getElementById('message');
const restartButton = document.getElementById('restart-button');
const loaderDownload = document.getElementById('warp-loader')

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('head').style.webkitAppRegion = 'drag'

    showLogCheckbox.addEventListener('change', function () {
        if (showLogCheckbox.checked) {
            boxLog.classList.remove('hidden')
            logTextarea.scrollTop = logTextarea.scrollHeight
        } else {
            boxLog.classList.add('hidden')
        }
    });

    document.addEventListener('change', function () {
        const files = document.getElementById('txt').files[0]?.path;
        const cookies = document.getElementById('json').files[0]?.path;
        const dom = document.getElementById('domain').value;
        if (dom == null || dom == "") {
            start.setAttribute('disabled', true);
        } else if (files != "" && cookies != null && dom != null) {
            start.removeAttribute('disabled');
        }
    })

    start.addEventListener('click', () => {
        const data = {
            files: files.files[0]?.path,
            cookies: cookies.files[0]?.path,
            dom: dom.value,
            visible: visibleToggle.checked ? false : 'new'
        }
        progs.innerText = '0%'
        progs.style.width = '0%'
        ipcRenderer.send('main', data)
    })

    ipcRenderer.on('run', () => {
        start.classList.add('hidden')
        stop.classList.remove('hidden')
        dom.disabled = true
        files.disabled = true
        cookies.disabled = true
        visibleToggle.disabled = true
    })

    ipcRenderer.on('force', () => {
        start.classList.remove('hidden')
        stop.classList.add('hidden')
        dom.disabled = false
        files.disabled = false
        cookies.disabled = false
        visibleToggle.disabled = false
    })

    ipcRenderer.on('log', (event, logs) => {
        logTextarea.value = logs;
        logTextarea.scrollTop = logTextarea.scrollHeight;
    });

    function proggress(prog) {
        progs.style.width = `${prog}%`;
        progs.innerHTML = `${prog}%`;
    }

    ipcRenderer.on('proggress', (event, prog) => {
        for (const pros of prog) {
            proggress(pros);
        }
    });

    let updateProgress = 0;

    ipcRenderer.send('app_version');
    ipcRenderer.on('app_version', (event, arg) => {
        version.innerText = 'v' + arg.version;
    });

    ipcRenderer.on('update_available', () => {
        ipcRenderer.removeAllListeners('update_available');
        message.innerText = 'A new update is available. Downloading now...';
        warp.classList.remove('hidden');
        loaderDownload.classList.remove('hidden');
    });

    ipcRenderer.on('update_progress', (event, progress) => {
        updateProgress = progress;
        const progsDown = document.getElementById('download-progress')
        progsDown.style.width = updateProgress + '%'
        progsDown.setAttribute('aria-valuenow', updateProgress)
    });

    ipcRenderer.on('update_downloaded', () => {
        ipcRenderer.removeAllListeners('update_downloaded');
        message.innerText = 'Update Downloaded. It will be installed on restart. Restart now?';
        restartButton.classList.remove('hidden');
        warp.classList.remove('hidden');

        loaderDownload.classList.add('hidden');
    });

    restartButton.addEventListener("click", (e) => {
        ipcRenderer.send('restart_app');
    })

    stop.addEventListener('click', () => {
        if (confirm("Realy want to stop the proccess ?") == true) {
            start.classList.remove("hidden")
            stop.classList.add("hidden")
            ipcRenderer.send('stop');
        }
    });
});