// Инициализация Telegram Web Apps API
window.Telegram.WebApp.ready();
const user = window.Telegram.WebApp.initDataUnsafe.user;
document.getElementById('player-name').textContent = user ? user.first_name : 'Player';

// Переводы
const translations = {
    uk: {
        alive: 'Жив',
        dead: 'Мерт',
        male: 'Чоловік',
        female: 'Жінка',
        check: 'Перевірити',
        night: '🌙 Ніч',
        day: '☀️ День',
        correct: 'Правильних відповідей',
        total: 'Загалом питань'
    },
    ru: {
        alive: 'Жив',
        dead: 'Мертв',
        male: 'Мужчина',
        female: 'Женщина',
        check: 'Проверить',
        night: '🌙 Ночь',
        day: '☀️ День',
        correct: 'Правильных ответов',
        total: 'Всего вопросов'
    },
    en: {
        alive: 'Alive',
        dead: 'Dead',
        male: 'Man',
        female: 'Woman',
        check: 'Check',
        night: '🌙 Night',
        day: '☀️ Day',
        correct: 'Correct answers',
        total: 'Total questions'
    },
    alien: {
        alive: '👾',
        dead: '💀',
        male: '👨‍🚀',
        female: '👩‍🚀',
        check: '🛸',
        night: '🌌 Ніч',
        day: '🪐 День',
        correct: '✅',
        total: '📊'
    }
};

// Глобальные переменные
let currentPerson = null;
let correctAnswers = 0;
let totalQuestions = 0;
let language = 'uk';
let difficulty = 'easy';
let theme = 'night';

// Элементы DOM
const languageSelect = document.getElementById('language');
const themeToggle = document.getElementById('theme-toggle');
const difficultySelect = document.getElementById('difficulty');
const personImage = document.getElementById('person-image');
const loadingProgress = document.getElementById('loading-progress');
const nextPhotoBtn = document.getElementById('next-photo');
const statusQuestion = document.getElementById('status-question');
const genderQuestion = document.getElementById('gender-question');
const checkAnswerBtn = document.getElementById('check-answer');
const resultDiv = document.getElementById('result');
const personInfo = document.getElementById('person-info');
const wikiLink = document.getElementById('wiki-link');
const correctAnswersSpan = document.getElementById('correct-answers');
const totalQuestionsSpan = document.getElementById('total-questions');

// Логирование
function log(message) {
    console.log(`[Game Log] ${message}`);
}

// Обновление интерфейса
function updateInterface() {
    const t = translations[language];
    document.querySelectorAll('#status-question label')[0].textContent = t.alive;
    document.querySelectorAll('#status-question label')[1].textContent = t.dead;
    document.querySelectorAll('.gender-btn')[0].textContent = t.male;
    document.querySelectorAll('.gender-btn')[1].textContent = t.female;
    checkAnswerBtn.textContent = t.check;
    themeToggle.textContent = theme === 'night' ? t.night : t.day;
    document.querySelector('#statistics p:nth-child(1)').textContent = `${t.correct}: `;
    document.querySelector('#statistics p:nth-child(2)').textContent = `${t.total}: `;
}

// Переключение темы
themeToggle.addEventListener('click', () => {
    theme = theme === 'night' ? 'day' : 'night';
    document.body.classList.toggle('day', theme === 'day');
    updateInterface();
    log(`Theme switched to ${theme}`);
});

// Выбор языка
languageSelect.addEventListener('change', (e) => {
    language = e.target.value;
    updateInterface();
    log(`Language changed to ${language}`);
});

// Выбор сложности
difficultySelect.addEventListener('change', (e) => {
    difficulty = e.target.value;
    genderQuestion.classList.toggle('hidden', difficulty === 'easy');
    personImage.style.display = difficulty === 'easy' ? 'block' : 'none';
    loadNewPerson();
    log(`Difficulty changed to ${difficulty}`);
});

// Загрузка нового человека
async function loadNewPerson() {
    loadingProgress.style.display = 'block';
    personImage.style.display = 'none';
    resultDiv.classList.add('hidden');
    checkAnswerBtn.disabled = false;

    try {
        // Запрос к Википедии
        const lang = language === 'alien' ? 'en' : language;
        const response = await fetch(`https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
            action: 'query',
            list: 'random',
            rnnamespace: 0,
            rnlimit: 1,
            format: 'json',
            origin: '*'
        }));
        const data = await response.json();
        const page = data.query.random[0];

        // Получение информации о человеке
        const pageResponse = await fetch(`https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
            action: 'query',
            prop: 'extracts|pageimages',
            exintro: true,
            explaintext: true,
            pithumbsize: 300,
            titles: page.title,
            format: 'json',
            origin: '*'
        }));
        const pageData = await pageResponse.json();
        const pageId = Object.keys(pageData.query.pages)[0];
        const pageInfo = pageData.query.pages[pageId];

        // Проверка, является ли статья о человеке
        if (!pageInfo.extract.includes('born') && difficulty === 'hard') {
            log('Not a person or unpopular, retrying...');
            return loadNewPerson();
        }

        // Загрузка изображения
        let imageUrl = pageInfo.thumbnail?.source;
        if (!imageUrl) {
            log('No image, retrying...');
            return loadNewPerson();
        }

        // Проверка изображения
        const img = new Image();
        img.src = imageUrl;
        await new Promise((resolve, reject) => {
            img.onload = () => {
                if (img.width < 50 || img.height < 50) {
                    log('Image too small, retrying...');
                    reject();
                } else {
                    resolve();
                }
            };
            img.onerror = () => {
                log('Image load error, retrying...');
                reject();
            };
        });

        // Имитация прогресса загрузки
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 10;
            loadingProgress.textContent = `${progress}%`;
            if (progress >= 100) clearInterval(progressInterval);
        }, 200);

        // Сохранение данных о человеке
        currentPerson = {
            title: pageInfo.title,
            image: imageUrl,
            wikiUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pageInfo.title)}`,
            isAlive: !pageInfo.extract.includes('died'),
            gender: pageInfo.extract.includes('she ') ? 'female' : 'male' // Упрощенная логика
        };

        personImage.src = imageUrl;
        personImage.style.display = difficulty === 'easy' ? 'block' : 'none';
        loadingProgress.style.display = 'none';
        log(`Loaded person: ${currentPerson.title}`);
    } catch (error) {
        log(`Error loading person: ${error}`);
        loadNewPerson();
    }
}

// Проверка ответа
checkAnswerBtn.addEventListener('click', () => {
    if (!currentPerson) return;

    const selectedStatus = document.querySelector('input[name="status"]:checked')?.value;
    let isCorrect = true;

    if (!selectedStatus) {
        alert(translations[language].check);
        return;
    }

    // Проверка статуса
    const statusCorrect = (selectedStatus === 'alive') === currentPerson.isAlive;
    if (statusCorrect) {
        document.querySelector(`input[value="${selectedStatus}"]`).parentElement.classList.add('correct');
    } else {
        isCorrect = false;
    }

    // Проверка пола (только в режиме "Просто")
    let genderCorrect = true;
    if (difficulty === 'hard') {
        const selectedGender = genderQuestion.querySelector('.gender-btn.active')?.dataset.gender;
        genderCorrect = selectedGender === currentPerson.gender;
        if (genderCorrect) {
            genderQuestion.querySelector(`[data-gender="${selectedGender}"]`).classList.add('correct');
        } else {
            isCorrect = false;
        }
    }

    // Обновление статистики
    totalQuestions++;
    if (isCorrect) correctAnswers++;
    correctAnswersSpan.textContent = correctAnswers;
    totalQuestionsSpan.textContent = totalQuestions;

    // Отправка в GA4
    gtag('event', 'check_answer', {
        difficulty,
        status_correct: statusCorrect,
        gender_correct: genderCorrect,
        person: currentPerson.title
    });

    // Показ результата
    resultDiv.classList.remove('hidden');
    personInfo.textContent = currentPerson.title;
    wikiLink.href = currentPerson.wikiUrl;
    if (difficulty === 'hard') {
        personImage.style.display = 'block';
    }

    checkAnswerBtn.disabled = true;
    log(`Answer checked: ${isCorrect ? 'Correct' : 'Incorrect'}`);
});

// Следующее фото
nextPhotoBtn.addEventListener('click', () => {
    loadNewPerson();
    document.querySelectorAll('.correct').forEach(el => el.classList.remove('correct'));
    document.querySelectorAll('input[name="status"]').forEach(input => input.checked = false);
    document.querySelectorAll('.gender-btn').forEach(btn => btn.classList.remove('active'));
});

// Выбор пола
genderQuestion.querySelectorAll('.gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        genderQuestion.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// Инициализация
updateInterface();
loadNewPerson();
log('Game initialized');
