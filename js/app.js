// --- Cordova এবং ব্রাউজার ইনিশিয়ালাইজেশন ---
document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
    console.log('Cordova is ready. Running the app...');
    initializeApp();
}

if (typeof window.cordova === 'undefined') {
    console.log('Cordova not found. Running in browser mode...');
    document.addEventListener('DOMContentLoaded', initializeApp);
}

// --- Firebase কনফিগারেশন ---
const firebaseConfig = {
  apiKey: "AIzaSyCWel5NlnffPZH6t2JWp95F6hFsaM21Fcg",
  authDomain: "shrutipaath-app-c3db2.firebaseapp.com",
  projectId: "shrutipaath-app-c3db2",
  storageBucket: "shrutipaath-app-c3db2.firebasestorage.app",
  messagingSenderId: "865008210308",
  appId: "1:865008210308:web:b50766858064cf92f18dd1",
  measurementId: "G-TJRSWGGJFR"
};

// --- গ্লোবাল ভ্যারিয়েবল ---
let db;
let allSubjects = [];
let currentSubject = null;
let fileSystem = null;
let currentPlayingAudio = null;

// --- DOM এলিমেন্ট ---
const loadingView = document.getElementById('loading-view');
const homeView = document.getElementById('home-view');
const subjectView = document.getElementById('subject-view');
const downloadsView = document.getElementById('downloads-view');
const subjectListContainer = document.getElementById('subject-list');
const chapterListContainer = document.getElementById('chapter-list');
const downloadListContainer = document.getElementById('download-list');
const subjectTitle = document.getElementById('subject-title');
const audioPlayer = document.getElementById('audio-player');
const nowPlaying = document.getElementById('now-playing');
const backButton = document.getElementById('back-to-home');
const backButtonFromDownloads = document.getElementById('back-to-home-from-downloads');
const downloadsButton = document.getElementById('downloads-button');

// --- মূল অ্যাপ ইনিশিয়ালাইজেশন ---
function initializeApp() {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();

        // === Firestore অফলাইন পারসিস্টেন্স চালু করা ===
        db.enablePersistence({synchronizeTabs:true})
          .then(() => {
              console.log("Firebase offline persistence enabled.");
              // পারসিস্টেন্স চালু হওয়ার পর ডেটা লোড করা
              loadDataAndRender();
          })
          .catch((err) => {
              console.warn("Firebase offline persistence failed:", err.code);
              // পারসিস্টেন্স ফেইল করলেও অ্যাপ চালানো চালিয়ে যাওয়া
              loadDataAndRender();
          });

    } catch (e) {
        console.error("Firebase initialization failed:", e);
        loadingView.innerHTML = `<p>Firebase init failed.</p>`;
        if (navigator.splashscreen) navigator.splashscreen.hide();
    }

    if (typeof window.cordova !== 'undefined') {
        window.resolveLocalFileSystemURL(cordova.file.dataDirectory, fs => {
            fileSystem = fs;
            console.log('File system loaded successfully.');
        }, err => console.error('FS load error:', err));
    }
    
    setupEventListeners();
}

// --- ডেটা লোডিং এবং রেন্ডারিং ---
async function loadDataAndRender() {
    navigateTo('loading-view');
    try {
        allSubjects = await fetchSubjectsFromFirestore();
        renderHomeView();
        navigateTo('home-view');
    } catch (error) {
        console.error("Error loading data:", error);
        loadingView.innerHTML = `<p>Error loading data. Please connect to the internet once to sync.</p>`;
    } finally {
        // ডেটা লোড সফল হোক বা ব্যর্থ, সবশেষে স্প্ল্যাশ স্ক্রিন হাইড করা
        if (navigator.splashscreen) {
            navigator.splashscreen.hide();
        }
    }
}

async function fetchSubjectsFromFirestore() {
    const subjects = [];
    const snapshot = await db.collection("subjects")
        .where("is_active", "==", true)
        .orderBy("order")
        .get();
    snapshot.forEach(doc => {
        subjects.push({ id: doc.id, ...doc.data() });
    });
    console.log('Subjects fetched:', subjects.length);
    return subjects;
}

function renderHomeView() {
    subjectListContainer.innerHTML = '';
    allSubjects.forEach(subject => {
        const card = document.createElement('div');
        card.className = 'subject-card';
        card.innerHTML = `<h3>${subject.subjectName}</h3>`;
        card.onclick = () => {
            currentSubject = subject;
            renderSubjectView(subject);
            navigateTo('subject-view');
        };
        subjectListContainer.appendChild(card);
    });
}

async function renderSubjectView(subject) {
    subjectTitle.textContent = subject.subjectName;
    chapterListContainer.innerHTML = '<div class="spinner"></div>';
    const chapters = subject.chapters || [];
    if (!chapters.length) { chapterListContainer.innerHTML = '<p>এই বিষয়ে কোনো অধ্যায় নেই।</p>'; return; }
    const chapterHtmls = await Promise.all(chapters.map(ch => renderChapterItem(ch)));
    chapterListContainer.innerHTML = chapterHtmls.join('');
}

async function renderChapterItem(chapter) {
    const audioOptions = currentSubject.audio_options_template || [];
    const optionItemsHtml = await Promise.all(audioOptions.map(opt => renderOptionItem(chapter, opt)));
    return `
        <div class="chapter-item">
            <div class="chapter-header" onclick="this.nextElementSibling.classList.toggle('open')">
                <span>${chapter.chapterName}</span>
                <span class="arrow">▾</span>
            </div>
            <div class="chapter-options">${optionItemsHtml.join('')}</div>
        </div>
    `;
}

async function renderOptionItem(chapter, option) {
    const url = (chapter.options && chapter.options[option.key]) || null;
    if (!url) return '';
    const filename = getFilenameFromUrl(url);
    const isDownloaded = await checkFileExists(filename);
    return `
        <div class="option-item" id="option-${filename.replace(/\./g, '-')}">
            <span class="play-button" onclick="playAudio('${url}', '${option.label}', this)">${option.label}</span>
            <button class="download-button ${isDownloaded ? 'downloaded' : ''}" onclick="downloadAudio(this, '${url}', '${option.label}')">
                <span class="icon">${isDownloaded ? '✓' : '⇩'}</span>
                <div class="spinner spinner-small"></div>
            </button>
        </div>
    `;
}

// --- ডাউনলোড পেজ ---
async function renderDownloadsView() {
    const downloads = getDownloadsFromStorage();
    if (downloads.length === 0) {
        downloadListContainer.innerHTML = '<p>কোনো ফাইল ডাউনলোড করা হয়নি।</p>';
        return;
    }
    downloadListContainer.innerHTML = downloads.map(item => `
        <div class="download-item">
            <div class="info" onclick="playAudio('${item.localURL}', '${item.label}')">
                <h4>${item.label}</h4>
                <small>${item.subjectName} - ${item.chapterName}</small>
            </div>
            <button class="delete-button" onclick="deleteDownloadedFile('${item.filename}', this)">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
        </div>
    `).join('');
}

// --- ডাউনলোড ম্যানেজমেন্ট ---
function getDownloadsFromStorage() { return JSON.parse(localStorage.getItem('shrutipaath_downloads') || '[]'); }
function saveDownloadToStorage(fileInfo) {
    const downloads = getDownloadsFromStorage();
    downloads.unshift(fileInfo);
    localStorage.setItem('shrutipaath_downloads', JSON.stringify(downloads));
}
function removeDownloadFromStorage(filename) {
    let downloads = getDownloadsFromStorage();
    downloads = downloads.filter(item => item.filename !== filename);
    localStorage.setItem('shrutipaath_downloads', JSON.stringify(downloads));
}

function downloadAudio(button, url, label) {
    if (typeof FileTransfer === 'undefined') return alert('Download not available in browser.');
    if (button.classList.contains('downloaded') || button.classList.contains('downloading')) return;
    button.classList.add('downloading');
    const filename = getFilenameFromUrl(url);
    const fileURL = fileSystem.root.toURL() + filename;
    new FileTransfer().download(encodeURI(url), fileURL,
        entry => {
            button.classList.remove('downloading');
            button.classList.add('downloaded');
            button.querySelector('.icon').innerHTML = '✓';
            saveDownloadToStorage({
                filename: filename, label: label, localURL: entry.toURL(),
                subjectName: currentSubject.subjectName,
                chapterName: button.closest('.chapter-item').querySelector('.chapter-header span').textContent
            });
        },
        error => {
            console.error("Download error:", error);
            button.classList.remove('downloading');
            alert('Download failed.');
        }
    );
}
function deleteDownloadedFile(filename, button) {
    if (!fileSystem) return;
    fileSystem.root.getFile(filename, {create: false}, fileEntry => {
        fileEntry.remove(() => {
            removeDownloadFromStorage(filename);
            button.closest('.download-item').remove();
        }, err => console.error('Error deleting file:', err));
    });
}

// --- অডিও প্লেব্যাক ---
function playAudio(url, label) {
    nowPlaying.textContent = `Playing: ${label}`;
    const isLocal = url.startsWith('cdvfile:') || url.startsWith('file:');
    
    if (isLocal || (typeof Media === 'undefined')) {
        // Use HTML5 audio for local files or in browser
        audioPlayer.src = url;
        audioPlayer.play();
        return;
    }
    
    // Use Media plugin for remote streaming in Cordova for better background support
    checkFileExists(getFilenameFromUrl(url)).then(exists => {
        let path = url;
        if (exists && fileSystem) {
            path = fileSystem.root.toURL() + getFilenameFromUrl(url);
        }
        
        stopAudio();
        currentPlayingAudio = new Media(path,
            () => { nowPlaying.textContent = "Nothing playing"; },
            (err) => { console.error("Playback error:", err); }
        );
        currentPlayingAudio.play();
    });
}
function stopAudio() {
    if (currentPlayingAudio) {
        currentPlayingAudio.stop();
        currentPlayingAudio.release();
        currentPlayingAudio = null;
    }
    audioPlayer.pause();
    audioPlayer.src = '';
    nowPlaying.textContent = "Nothing playing";
}

// --- ইউটিলিটি এবং ইভেন্ট লিসেনার ---
function setupEventListeners() {
    backButton.addEventListener('click', () => navigateTo('home-view'));
    backButtonFromDownloads.addEventListener('click', () => navigateTo('home-view'));
    downloadsButton.addEventListener('click', () => {
        renderDownloadsView();
        navigateTo('downloads-view');
    });
}
function navigateTo(viewId) {
    stopAudio();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}
function getFilenameFromUrl(url) {
    if (!url) return '';
    return url.split('/').pop().split('?')[0].replace(/%20/g, '_');
}
function checkFileExists(filename) {
    return new Promise(resolve => {
        if (!fileSystem || !filename) return resolve(false);
        fileSystem.root.getFile(filename, { create: false }, () => resolve(true), () => resolve(false));
    });
}
