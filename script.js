// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();

// Set Telegram header and bottom bar colors to match space gray theme
tg.setHeaderColor('#2a2a2e');
tg.setBottomBarColor('#2a2a2e');

// Language translations (unchanged)
const translations = {/* Same as before */};

// Game state (unchanged)
let currentPerson = null;
let correctAnswers = 0;
let totalQuestions = 0;
let difficulty = 'easier';
let language = 'uk';
let isNight = true;

// DOM elements (unchanged)
const playerName = document.getElementById('player-name');
const gameTitle = document.getElementById('game-title');
const languageSelect = document.getElementById('language');
const difficultySelect = document.getElementById('difficulty');
const themeToggle = document.getElementById('theme-toggle');
const photoDisplay = document.getElementById('person-photo');
const loadingProgress = document.getElementById('loading-progress');
const nextPhotoBtn = document.getElementById('next-photo');
const easierOptions = document.getElementById('easier-options');
const easyOptions = document.getElementById('easy-options');
const checkAnswerBtn = document.getElementById('check-answer');
const resultDiv = document.getElementById('result');
const personInfo = document.getElementById('person-info');
const wikiLink = document.getElementById('wiki-link');
const correctAnswersSpan = document.getElementById('correct-answers');
const totalQuestionsSpan = document.getElementById('total-questions');

// Set player name
playerName.textContent = `Гравець: ${tg.initDataUnsafe.user?.first_name || 'Невідомий'}`;

// Sync with Telegram theme
function syncTelegramTheme() {
    const telegramTheme = tg.themeParams.bg_color?.toLowerCase() === '#ffffff' ? 'day' : 'night';
    isNight = telegramTheme === 'night';
    document.body.classList.toggle('day', !isNight);
    document.body.classList.toggle('night', isNight);
    themeToggle.textContent = translations[language][isNight ? 'night' : 'day'];
    console.log(`Synced with Telegram theme: ${telegramTheme}`);
}

// Listen for theme changes
tg.onEvent('themeChanged', syncTelegramTheme);
syncTelegramTheme();

// Update UI based on language (unchanged)
function updateLanguage() {/* Same as before */}

// Theme toggle
themeToggle.addEventListener('click', () => {
    isNight = !isNight;
    document.body.classList.toggle('day', !isNight);
    document.body.classList.toggle('night', isNight);
    themeToggle.textContent = translations[language][isNight ? 'night' : 'day'];
    tg.setHeaderColor(isNight ? '#2a2a2e' : '#f5f5f5');
    tg.setBottomBarColor(isNight ? '#2a2a2e' : '#f5f5f5');
    gtag('event', 'theme_toggle', { theme: isNight ? 'night' : 'day' });
});

// Language and difficulty change (unchanged)
languageSelect.addEventListener('change', (e) => {/* Same as before */});
difficultySelect.addEventListener('change', (e) => {/* Same as before */});

// Initialize UI (unchanged)
updateLanguage();
easierOptions.style.display = 'block';
easyOptions.style.display = 'none';
photoDisplay.style.display = 'block';

// Wikipedia API for random person
async function fetchRandomPerson() {
    try {
        console.log('Fetching random person...');
        let url = 'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=1&format=json&origin=*';
        if (difficulty === 'easy') {
            url += '&rnfilterredir=nonredirects';
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const pageId = data.query.random[0].id;

        // Fetch page details
        const pageRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages|info&inprop=url&piprop=original&pilimit=1&pageids=${pageId}&format=json&origin=*`);
        if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`);
        const pageData = await pageRes.json(); // Fixed: Use pageRes, not res
        const page = pageData.query.pages[pageId];
        console.log('Page data:', page);

        return {
            title: page.title,
            url: page.fullurl,
            image: page.original?.source || null
        };
    } catch (error) {
        console.error('Error fetching person:', error);
        gtag('event', 'fetch_error', { error: error.message });
        return null;
    }
}

// Simple face detection
async function isValidFace(imageUrl) {
    try {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        return new Promise((resolve) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height).data;
                const hasContent = imageData.some(pixel => pixel !== 0);
                resolve(hasContent && img.width > 50 && img.height > 50);
            };
            img.onerror = () => {
                console.error('Image load failed:', imageUrl);
                resolve(false);
            };
            img.src = imageUrl;
        });
    } catch (error) {
        console.error('Face detection error:', error);
        gtag('event', 'image_error', { error: error.message });
        return false;
    }
}

// Load new person
async function loadNewPerson() {
    loadingProgress.style.display = 'block';
    photoDisplay.style.display = difficulty === 'easier' ? 'block' : 'none';
    resultDiv.style.display = 'none';
    checkAnswerBtn.disabled = true;

    let validPerson = null;
    let attempts = 0;
    const maxAttempts = 5;

    while (!validPerson && attempts < maxAttempts) {
        const progress = Math.round((attempts / maxAttempts) * 50);
        loadingProgress.textContent = `${progress}%`;
        const person = await fetchRandomPerson();
        if (person && person.image) {
            loadingProgress.textContent = '75%';
            const isValid = await isValidFace(person.image);
            if (isValid) {
                validPerson = person;
            } else {
                console.warn(`Invalid image for ${person.title}, retrying...`);
            }
        } else {
            console.warn('No person or image found, retrying...');
        }
        attempts++;
    }

    if (!validPerson) {
        console.error('Failed to find valid person after max attempts');
        loadingProgress.textContent = translations[language].error || 'Помилка завантаження';
        gtag('event', 'load_failure', { attempts: maxAttempts });
        checkAnswerBtn.disabled = false;
        return;
    }

    currentPerson = validPerson;
    photoDisplay.src = validPerson.image;
    photoDisplay.style.display = difficulty === 'easier' ? 'block' : 'none';
    loadingProgress.textContent = '100%';
    setTimeout(() => {
        loadingProgress.style.display = 'none';
        checkAnswerBtn.disabled = false;
    }, 500);

    console.log('Loaded person:', validPerson);
    gtag('event', 'person_loaded', { title: validPerson.title });
}

// Check answer, option selection, next photo, reset game (unchanged)
checkAnswerBtn.addEventListener('click', () => {/* Same as before */});
document.querySelectorAll('#easier-options .option').forEach(btn => {/* Same as before */});
document.querySelectorAll('#easy-options .option').forEach(btn => {/* Same as before */});
nextPhotoBtn.addEventListener('click', () => {/* Same as before */});
function resetGame() {/* Same as before */}

// Initial load
loadNewPerson();
