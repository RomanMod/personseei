// Telegram Web Apps API initialization
const tg = window.Telegram.WebApp;
tg.ready();
document.getElementById('player-name').textContent = tg.initDataUnsafe.user ? 
    `${tg.initDataUnsafe.user.first_name} ${tg.initDataUnsafe.user.last_name || ''}` : 'Player';

// Settings
const themeSelect = document.getElementById('theme-select');
const languageSelect = document.getElementById('language-select');
const difficultySelect = document.getElementById('difficulty-select');
const nextPhotoBtn = document.getElementById('next-photo');
const checkAnswerBtn = document.getElementById('check-answer');
const personImage = document.getElementById('person-image');
const progress = document.getElementById('progress');
const result = document.getElementById('result');
const personInfo = document.getElementById('person-info');
const wikiLink = document.getElementById('wiki-link');
const correctAnswersSpan = document.getElementById('correct-answers');
const totalQuestionsSpan = document.getElementById('total-questions');

let correctAnswers = 0;
let totalQuestions = 0;
let currentPerson = null;
let difficulty = 'easier';

// Language translations
const translations = {
    uk: {
        alive: 'Живий',
        dead: 'Мертвий',
        male: 'Чоловік',
        female: 'Жінка',
        check: 'Перевірити',
        correct: 'Правильно!',
        incorrect: 'Неправильно!',
    },
    ru: {
        alive: 'Жив',
        dead: 'Мертв',
        male: 'Мужчина',
        female: 'Женщина',
        check: 'Проверить',
        correct: 'Правильно!',
        incorrect: 'Неправильно!',
    },
    en: {
        alive: 'Alive',
        dead: 'Dead',
        male: 'Male',
        female: 'Female',
        check: 'Check',
        correct: 'Correct!',
        incorrect: 'Incorrect!',
    },
    alien: {
        alive: '👽 Живий',
        dead: '💀 Мертвий',
        male: '👨 Чоловік',
        female: '👩 Жінка',
        check: '🛸 Перевірити',
        correct: '🌟 Правильно!',
        incorrect: '🪐 Неправильно!',
    }
};

// Update UI based on language
function updateLanguage() {
    const lang = languageSelect.value;
    document.querySelectorAll('#alive-question label').forEach((label, i) => {
        label.textContent = i === 0 ? translations[lang].alive : translations[lang].dead;
    });
    document.querySelectorAll('.gender-btn').forEach((btn, i) => {
        btn.textContent = i === 0 ? translations[lang].male : translations[lang].female;
    });
    document.querySelectorAll('.status-btn').forEach((btn, i) => {
        btn.textContent = i === 0 ? translations[lang].alive : translations[lang].dead;
    });
    checkAnswerBtn.textContent = translations[lang].check;
}

// Update UI based on difficulty
function updateDifficulty() {
    difficulty = difficultySelect.value;
    document.getElementById('alive-question').style.display = difficulty === 'easy' ? 'block' : 'none';
    document.getElementById('gender-question').style.display = difficulty === 'easy' ? 'block' : 'none';
    document.getElementById('easier-question').style.display = difficulty === 'easier' ? 'block' : 'none';
    personImage.style.display = difficulty === 'easier' ? 'block' : 'none';
    result.style.display = 'none';
    loadNewPerson();
}

// Theme switch
themeSelect.addEventListener('change', () => {
    document.body.className = themeSelect.value;
});

// Language switch
languageSelect.addEventListener('change', updateLanguage);

// Difficulty switch
difficultySelect.addEventListener('change', updateDifficulty);

// Wikipedia API to fetch random person
async function loadNewPerson() {
    progress.textContent = '0%';
    result.style.display = 'none';
    personImage.style.display = difficulty === 'easier' ? 'block' : 'none';
    personImage.src = '';
    console.log('Loading new person...');

    try {
        progress.textContent = '20%';
        // Fetch random article
        let url = 'https://en.wikipedia.org/w/api.php?' +
            'action=query&format=json&list=random&rnnamespace=0&rnlimit=1';
        if (difficulty === 'easy') {
            url += '&rnfilterredir=nonredirects';
        }
        const res = await fetch(url, { mode: 'cors' });
        const data = await res.json();
        const title = data.query.random[0].title;
        console.log(`Selected article: ${title}`);

        progress.textContent = '40%';
        // Fetch article details
        const pageRes = await fetch(`https://en.wikipedia.org/w/api.php?` +
            `action=query&format=json&prop=info|pageimages&inprop=url&titles=${encodeURIComponent(title)}&piprop=original`);
        const pageData = await res.json();
        const page = Object.values(pageData.query.pages)[0];
        const imageUrl = page.original ? page.original.source : null;

        progress.textContent = '60%';
        // Basic face detection simulation (placeholder)
        if (!imageUrl || !(await isValidImage(imageUrl))) {
            console.warn('Invalid image, retrying...');
            return loadNewPerson();
        }

        progress.textContent = '80%';
        // Fetch person info (simplified)
        currentPerson = {
            name: title,
            alive: Math.random() > 0.5 ? 'alive' : 'dead',
            gender: Math.random() > 0.5 ? 'male' : 'female',
            image: imageUrl,
            wiki: page.fullurl
        };

        progress.textContent = '100%';
        personImage.src = currentPerson.image;
        console.log('Person loaded:', currentPerson);
    } catch (error) {
        console.error('Error loading person:', error);
        progress.textContent = 'Error';
        setTimeout(loadNewPerson, 2000);
    }
}

// Validate image (placeholder for face detection)
async function isValidImage(url) {
    try {
        const res = await fetch(url, { method: 'HEAD' });
        return res.ok;
    } catch {
        return false;
    }
}

// Check answer
checkAnswerBtn.addEventListener('click', () => {
    let isCorrect = true;
    const lang = languageSelect.value;

    if (difficulty === 'easy') {
        const selectedAlive = document.querySelector('input[name="alive"]:checked')?.value;
        const selectedGender = document.querySelector('.gender-btn.correct')?.dataset.gender;
        if (selectedAlive === currentPerson.alive) {
            document.querySelector(`input[value="${selectedAlive}"]`).parentElement.classList.add('correct');
        } else {
            isCorrect = false;
        }
        if (selectedGender === currentPerson.gender) {
            document.querySelector(`.gender-btn[data-gender="${selectedGender}"]`).classList.add('correct');
        } else {
            isCorrect = false;
        }
    } else {
        const selectedStatus = document.querySelector('.status-btn.correct')?.dataset.status;
        if (selectedStatus === currentPerson.alive) {
            document.querySelector(`.status-btn[data-status="${selectedStatus}"]`).classList.add('correct');
        } else {
            isCorrect = false;
        }
    }

    personImage.style.display = 'block';
    result.style.display = 'block';
    personInfo.textContent = `${currentPerson.name} - ${translations[lang][currentPerson.alive]}, ${translations[lang][currentPerson.gender]}`;
    wikiLink.href = currentPerson.wiki;

    totalQuestions++;
    if (isCorrect) correctAnswers++;
    correctAnswersSpan.textContent = correctAnswers;
    totalQuestionsSpan.textContent = totalQuestions;

    // Send to GA4
    gtag('event', 'check_answer', {
        difficulty,
        is_correct: isCorrect,
        person: currentPerson.name
    });

    console.log(`Answer checked: Correct=${isCorrect}, Total=${totalQuestions}, Correct=${correctAnswers}`);
});

// Gender button selection
document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('correct'));
        btn.classList.add('correct');
    });
});

// Status button selection
document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('correct'));
        btn.classList.add('correct');
    });
});

// Next photo
nextPhotoBtn.addEventListener('click', () => {
    document.querySelectorAll('.correct').forEach(el => el.classList.remove('correct'));
    document.querySelectorAll('input[name="alive"]').forEach(input => input.checked = false);
    loadNewPerson();
});

// Initialize
document.body.className = 'night';
updateLanguage();
updateDifficulty();
loadNewPerson();
