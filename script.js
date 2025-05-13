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

// Wikidata API to fetch random person
async function loadNewPerson() {
    progress.textContent = '0%';
    result.style.display = 'none';
    personImage.style.display = difficulty === 'easier' ? 'block' : 'none';
    personImage.src = '';
    console.log('Loading new person from Wikidata...');

    try {
        progress.textContent = '20%';
        // SPARQL-запрос к Wikidata
        const query = `
            SELECT ?person ?personLabel ?genderLabel ?birth ?death ?image WHERE {
                ?person wdt:P31 wd:Q5; # Человек
                        wdt:P21 ?gender; # Пол
                        wdt:P569 ?birth; # Дата рождения
                        wdt:P18 ?image. # Изображение
                OPTIONAL { ?person wdt:P570 ?death. } # Дата смерти (если есть)
                SERVICE wikibase:label { bd:serviceParam wikibase:language "uk,en". }
                ${difficulty === 'easy' ? 'OPTIONAL { ?person wdt:P1651 ?youtube. }' : ''} # Фильтр популярности
            } LIMIT 1
        `;
        const response = await fetch('https://query.wikidata.org/sparql?query=' + encodeURIComponent(query) + '&format=json', {
            headers: { 'Accept': 'application/sparql-results+json' }
        });
        const data = await response.json();
        progress.textContent = '60%';

        const person = data.results.bindings[0];
        if (!person) throw new Error('No person found');

        currentPerson = {
            name: person.personLabel.value,
            alive: person.death ? 'dead' : 'alive',
            gender: person.genderLabel.value.toLowerCase().includes('male') ? 'male' : 'female',
            image: person.image.value,
            wiki: person.person.value.replace('http://www.wikidata.org/entity/', 'https://en.wikipedia.org/wiki/')
        };

        progress.textContent = '80%';
        if (!(await isValidImage(currentPerson.image))) {
            console.warn('Invalid image, retrying...');
            return loadNewPerson();
        }

        progress.textContent = '100%';
        personImage.src = currentPerson.image;
        console.log('Person loaded:', currentPerson);

        // Логирование в GA4
        gtag('event', 'load_person', {
            source: 'wikidata',
            success: true,
            person: currentPerson.name
        });
    } catch (error) {
        console.error('Error loading person from Wikidata:', error);
        progress.textContent = 'Error';
        gtag('event', 'load_person', {
            source: 'wikidata',
            success: false
        });
        setTimeout(loadNewPerson, 2000);
    }
}

// Validate image
async function isValidImage(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        const contentLength = response.headers.get('content-length');
        return response.ok && contentLength && parseInt(contentLength) > 10000; // Минимальный размер
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
