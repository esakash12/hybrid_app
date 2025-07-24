// ==============================================================================
//  শুরু করার আগে এই কাজগুলো করুন (যদি না করে থাকেন):
//  ১. Cordova এবং প্রয়োজনীয় প্লাগইন ইনস্টল করুন (টার্মিনালে প্রজেক্ট ফোল্ডারে গিয়ে):
//     - cordova platform add android
//     - cordova plugin add cordova-plugin-file
//     - cordova plugin add cordova-plugin-file-transfer
//     - cordova plugin add cordova-plugin-media
// ==============================================================================

// --- Cordova ডিভাইস রেডি ইভেন্ট ---
document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
    console.log('Cordova is ready. Running the app...');
    initializeApp();
}

// --- ব্রাউজারে টেস্ট করার জন্য ফলব্যাক ---
if (typeof window.cordova === 'undefined') {
    console.log('Cordova not found. Running in browser mode...');
    document.addEventListener('DOMContentLoaded', initializeApp);
}

// ==============================================================================
//  আপনার Firebase Web SDK কনফিগারেশন (এটি সঠিক আছে)
// ==============================================================================
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
const subjectListContainer = document.getElementById('subject-list');
const chapterListContainer = document.getElementById('chapter-list');
const subjectTitle = document.getElementById('subject-title');
const backButton = document.getElementById('back-to-home');
const audioPlayer = document.getElementById('audio-player');
const nowPlaying = document.getElementById('now-playing');

// --- মূল অ্যাপ ইনিশিয়ালাইজেশন ---
function initializeApp() {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        console.log("Firebase initialized successfully.");
    } catch (e) {
        console.error("Firebase initialization failed:", e);
        loadingView.innerHTML = `<p>Firebase could not be initialized. Please check your configuration.</p>`;
        return;
    }

    if (typeof window.cordova !== 'undefined') {
        window.resolveLocalFileSystemURL(cordova.file.dataDirectory, fs => {
            fileSystem = fs;
            console.log('File system loaded successfully:', fs.name);
        }, err => {
            console.error('Error loading file system:', err);
        });
    }

    loadDataAndRender();

    backButton.addEventListener('click', () => {
        navigateTo('home-view');
        stopAudio();
    });
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
        loadingView.innerHTML = `<p>Error loading data. Please check your internet connection and try again.</p>`;
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
    if (chapters.length === 0) {
        chapterListContainer.innerHTML = '<p>এই বিষয়ে কোনো অধ্যায় নেই।</p>';
        return;
    }

    const chapterHtmlPromises = chapters.map(chapter => renderChapterItem(chapter, subject.audio_options_template));
    const chapterHtmls = await Promise.all(chapterHtmlPromises);
    
    chapterListContainer.innerHTML = chapterHtmls.join('');
}

async function renderChapterItem(chapter, audioOptions) {
    const optionItemsPromises = (audioOptions || []).map(option => renderOptionItem(chapter, option));
    const optionItemsHtml = await Promise.all(optionItemsPromises);

    return `
        <div class="chapter-item">
            <div class="chapter-header" onclick="toggleChapterOptions(this)">
                <span>${chapter.chapterName}</span>
                <span class="arrow">▾</span>
            </div>
            <div class="chapter-options">
                ${optionItemsHtml.join('')}
            </div>
        </div>
    `;
}

async function renderOptionItem(chapter, option) {
    const audioUrl = (chapter.options && chapter.options[option.key]) ? chapter.options[option.key] : null;
    if (!audioUrl) return '';

    const filename = getFilenameFromUrl(audioUrl);
    const isDownloaded = await checkFileExists(filename);

    return `
        <div class="option-item" id="option-${filename.replace(/[.\/]/g, '-')}" data-url="${audioUrl}" data-label="${option.label}">
            <span class="play-button" onclick="handlePlay(this.parentElement)">${option.label}</span>
            <button class="download-button ${isDownloaded ? 'downloaded' : ''}" onclick="handleDownload(this, event)">
                <span class="icon">${isDownloaded ? '✓' : '⇩'}</span>
                <div class="spinner spinner-small"></div>
            </button>
        </div>
    `;
}

// --- ইন্টারেকশন এবং হ্যান্ডলার ---
function toggleChapterOptions(headerElement) {
    const options = headerElement.nextElementSibling;
    const arrow = headerElement.querySelector('.arrow');
    if (options.classList.contains('open')) {
        options.classList.remove('open');
        arrow.style.transform = 'rotate(0deg)';
    } else {
        options.classList.add('open');
        arrow.style.transform = 'rotate(180deg)';
    }
}

function handlePlay(optionItemElement) {
    const url = optionItemElement.dataset.url;
    const label = optionItemElement.dataset.label;
    playAudio(url, label);
}

function handleDownload(buttonElement, event) {
    event.stopPropagation();
    const optionItemElement = buttonElement.parentElement;
    const url = optionItemElement.dataset.url;
    downloadAudio(buttonElement, url);
}

// --- অডিও এবং ডাউনলোড কার্যকারিতা ---
function playAudio(url, label) {
    nowPlaying.textContent = `বাজছে: ${label}`;
    const filename = getFilenameFromUrl(url);

    checkFileExists(filename).then(isLocal => {
        let path = url;
        if (isLocal && fileSystem) {
            path = fileSystem.root.toURL() + filename;
            console.log('File is local. Playing from:', path);
        } else {
            console.log('File is not local. Playing from remote URL.');
        }

        if (typeof Media !== 'undefined') {
            stopAudio();
            currentPlayingAudio = new Media(path,
                () => { console.log("Playback successful"); nowPlaying.textContent = "কিছু বাজছে না"; },
                (err) => { console.error("Playback error:", err); alert('অডিও চালাতে সমস্যা হয়েছে।'); }
            );
            currentPlayingAudio.play();
        } else {
            audioPlayer.src = path;
            audioPlayer.play();
        }
    });
}

function stopAudio() {
    if (currentPlayingAudio) {
        currentPlayingAudio.stop();
        currentPlayingAudio.release();
        currentPlayingAudio = null;
    }
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.src = '';
    }
}

function downloadAudio(button, url) {
    if (typeof FileTransfer === 'undefined') {
        alert('অ্যাপটি মোবাইল থেকে চালালে ডাউনলোড করা যাবে।');
        return;
    }
    if (button.classList.contains('downloaded') || button.classList.contains('downloading')) {
        return;
    }

    button.classList.add('downloading');
    const filename = getFilenameFromUrl(url);
    const fileURL = fileSystem.root.toURL() + filename;

    const fileTransfer = new FileTransfer();
    fileTransfer.download(encodeURI(url), fileURL,
        (entry) => {
            console.log("Download complete:", entry.toURL());
            button.classList.remove('downloading');
            button.classList.add('downloaded');
            button.querySelector('.icon').innerHTML = '✓';
        },
        (error) => {
            console.error("Download error:", error);
            button.classList.remove('downloading');
            alert('ডাউনলোড ব্যর্থ হয়েছে।');
            entry.remove(() => console.log('Partial file deleted.'));
        }
    );
}

// --- ইউটিলিটি ফাংশন ---
function navigateTo(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function getFilenameFromUrl(url) {
    if (!url) return '';
    try {
        return new URL(url).pathname.split('/').pop().split('?')[0].replace(/%20/g, '_');
    } catch (e) {
        return url.split('/').pop().split('?')[0].replace(/%20/g, '_');
    }
}

function checkFileExists(filename) {
    return new Promise(resolve => {
        if (!fileSystem || !filename) {
            return resolve(false);
        }
        fileSystem.root.getFile(filename, { create: false },
            () => resolve(true),
            () => resolve(false)
        );
    });
}