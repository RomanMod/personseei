// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();

// Language translations
const translations = {
    uk: {
        title: "Вгадай Особу",
        alive: "Жив",
        dead: "Мерт",
        male: "Чоловік",
        female: "Жінка",
        check: "Перевірити",
        stats: "Статистика",
        correct: "Правильні відповіді",
        total: "Загалом питань",
        day: "День",
        night: "Ніч",
        easier: "Попроще",
        easy: "Просто",
    },
    ru: {
        title: "Угадай Личность",
        alive: "Жив",
        dead: "Мертв",
        male: "Мужчина",
        female: "Женщина",
        check: "Проверить",
        stats: "Статистика",
        correct: "Правильные ответы",
        total: "Всего вопросов",
        day: "День",
        night: "Ночь",
        easier: "Поп проще",
        easy: "Просто",
    },
    en: {
        title: "Guess the Person",
        alive: "Alive",
        dead: "Dead",
        male: "Male",
        female: "Female",
        check: "Check",
        stats: "Statistics",
        correct: "Correct Answers",
        total: "Total Questions",
        day: "Day",
        night: "Night",
        easier: "Easier",
        easy: "Easy",
    },
    alien: {
        title: "👽 Zx'qrth V'lorn",
        alive: "🌟 V'vax",
        dead: "💫 M'rtz",
        male: "♂ Z'kron",
        female: "♀ V'lyra",
        check: "🔍 X'plorr",
        stats: "📊 Q'vantz",
        correct: "✅ Y'zarth",
        total: "🌌 T'zall",
        day: "☀️ L'umin",
        night: "🌙 N'octz",
        easier: "🪐 E'zrr",
        easy: "🌠 S'mpl",
    }
};

// Game state
let currentPerson = null;
let correctAnswers = 0;
let totalQuestions = 0;
let difficulty = 'easier';
let language = 'uk';
let isNight = true;

// DOM elements
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

// Update UI based on language
function updateLanguage() {
    const t = translations[language];
    gameTitle.textContent = t.title;
    document.querySelectorAll('#easier-options .option')[0].textContent = t.alive;
    document.querySelectorAll('#easier-options .option')[1].textContent = t.dead;
    document.querySelectorAll('#easy-options .radio-group label')[0].textContent = ` ${t.alive}`;
    document.querySelectorAll('#easy-options .radio-group label')[1].textContent = ` ${t.dead}`;
    document.querySelectorAll('#easy-options .option')[0].textContent = t.male;
    document.querySelectorAll('#easy-options .option')[1].textContent = t.female;
    checkAnswerBtn.textContent = t.check;
    document.querySelector('#statistics h2').textContent = t.stats;
    document.querySelector('#statistics p:nth-child(2)').childNodes[0].textContent = `${t.correct}: `;
    document.querySelector('#statistics p:nth-child(3)').childNodes[0].textContent = `${t.total}: `;
    themeToggle.textContent = isNight ? t.night : t.day;
}

// Theme toggle
themeToggle.addEventListener('click', () => {
    isNight = !isNight;
    document.body.classList.toggle('day', !isNight);
    document.body.classList.toggle('night', isNight);
    themeToggle.textContent = translations[language][isNight ? 'night' : 'day'];
    gtag('event', 'theme_toggle', { theme: isNight ? 'night' : 'day' });
});

// Language change
languageSelect.addEventListener('change', (e) => {
    language = e.target.value;
    updateLanguage();
    gtag('event', 'language_change', { language });
});

// Difficulty change
difficultySelect.addEventListener('change', (e) => {
    difficulty = e.target.value;
    easierOptions.style.display = difficulty === 'easier' ? 'block' : 'none';
    easyOptions.style.display = difficulty === 'easy' ? 'block' : 'none';
    photoDisplay.style.display = difficulty === 'easier' ? 'block' : 'none';
    resetGame();
    loadNewPerson();
    gtag('event', 'difficulty_change', { difficulty });
});

// Initialize UI
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
            url += '&rnfilterredir=nonredirects'; // Prefer non-obscure people
        }
        const res = await fetch(url);
        const data = await res.json();
        const pageId = data.query.random[0].id;

        // Fetch page details
        const pageRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages|info&inprop=url&piprop=original&pilimit=1&pageids=${pageId}&format=json&origin=*`);
        const pageData = await res.json();
        const page = pageData.query.pages[pageId];
        console.log('Page data:', page);

        return {
            title: page.title,
            url: page.fullurl,
            image: page.original?.source || null
        };
    } catch (error) {
        console.error('Error fetching person:', error);
        return null;
    }
}

// Simple face detection (basic check for image validity)
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
                // Basic check: non-empty image with reasonable size
                const hasContent = imageData.some(pixel => pixel !== 0);
                resolve(hasContent && img.width > 50 && img.height > 50);
            };
            img.onerror = () => resolve(false);
            img.src = imageUrl;
        });
    } catch (error) {
        console.error('Face detection error:', error);
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
        loadingProgress.textContent = `${Math.round((attempts / maxAttempts) * 50)}%`;
        const person = await fetchRandomPerson();
        if (person && person.image) {
            loadingProgress.textContent = '75%';
            const isValid = await isValidFace(person.image);
            if (isValid) {
                validPerson = person;
            }
        }
        attempts++;
    }

    if (!validPerson) {
        console.error('Failed to find valid person after max attempts');
        loadingProgress.textContent = 'Помилка завантаження';
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
}

// Check answer
checkAnswerBtn.addEventListener('click', () => {
    let isCorrect = false;
    if (difficulty === 'easier') {
        const selectedStatus = document.querySelector('#easier-options .option.selected')?.dataset.status;
        // Assume alive for simplicity (Wikipedia API doesn't provide status)
        isCorrect = selectedStatus === 'alive';
        if (isCorrect) {
            document.querySelector(`#easier-options .option[data-status="alive"]`).classList.add('correct');
        }
    } else {
        const selectedStatus = document.querySelector('input[name="status"]:checked')?.value;
        const selectedGender = document.querySelector('#easy-options .option.selected')?.dataset.gender;
        // Assume alive and male for simplicity
        const statusCorrect = selectedStatus === 'alive';
        const genderCorrect = selectedGender === 'male';
        isCorrect = statusCorrect && genderCorrect;
        if (statusCorrect) {
            document.querySelector(`input[value="alive"]`).parentElement.classList.add('correct');
        }
        if (genderCorrect) {
            document.querySelector(`#easy-options .option[data-gender="male"]`).classList.add('correct');
        }
    }

    totalQuestions++;
    if (isCorrect) {
        correctAnswers++;
    }

    // Update statistics
    correctAnswersSpan.textContent = correctAnswers;
    totalQuestionsSpan.textContent = totalQuestions;

    // Send to GA4
    gtag('event', 'answer', {
        difficulty,
        is_correct: isCorrect,
        correct_answers: correctAnswers,
        total_questions: totalQuestions
    });

    // Show result
    if (difficulty === 'easy') {
        photoDisplay.style.display = 'block';
    }
    personInfo.textContent = currentPerson.title;
    wikiLink.href = currentPerson.url;
    resultDiv.style.display = 'block';

    // Reset selections
    document.querySelectorAll('.option').forEach(btn => btn.classList.remove('selected'));
    document.querySelectorAll('.correct').forEach(el => el.classList.remove('correct'));
    document.querySelectorAll('input[name="status"]').forEach(radio => radio.checked = false);
});

// Option selection
document.querySelectorAll('#easier-options .option').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#easier-options .option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });
});

document.querySelectorAll('#easy-options .option').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#easy-options .option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });
});

// Next photo
nextPhotoBtn.addEventListener('click', () => {
    resetGame();
    loadNewPerson();
    gtag('event', 'next_photo', { difficulty });
});

// Reset game state
function resetGame() {
    photoDisplay.src = '';
    photoDisplay.style.display = difficulty === 'easier' ? 'block' : 'none';
    resultDiv.style.display = 'none';
    document.querySelectorAll('.option').forEach(btn => btn.classList.remove('selected'));
    document.querySelectorAll('input[name="status"]').forEach(radio => radio.checked = false);
}

// Initial load
loadNewPerson();
