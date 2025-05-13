// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Отображение имени игрока
const playerName = document.getElementById('player-name');
playerName.textContent = `Гравець: ${tg.initDataUnsafe.user ? tg.initDataUnsafe.user.first_name : 'Анонім'}`;

// Элементы интерфейса
const themeToggle = document.getElementById('theme-toggle');
const languageSelect = document.getElementById('language-select');
const modeSelect = document.getElementById('mode-select');
const personImage = document.getElementById('person-image');
const loadingProgress = document.getElementById('loading-progress');
const nextPhotoButton = document.getElementById('next-photo');
const hardModeQuestions = document.getElementById('hard-mode-questions');
const easyModeQuestions = document.getElementById('easy-mode-questions');
const checkAnswerButton = document.getElementById('check-answer');
const resultDiv = document.getElementById('result');
const personInfo = document.getElementById('person-info');
const wikiLink = document.getElementById('wiki-link');
const correctAnswersSpan = document.getElementById('correct-answers');
const totalQuestionsSpan = document.getElementById('total-questions');

// Переводы
const translations = {
    uk: {
        title: 'Вікторина: Хто це?',
        alive: 'Живий',
        dead: 'Мертвий',
        male: 'Чоловік',
        female: 'Жінка',
        check: 'Перевірити',
        stats: 'Статистика',
        correct: 'Правильні відповіді',
        total: 'Всього питань',
        loading: 'Завантаження',
        next: 'Наступне фото'
    },
    ru: {
        title: 'Викторина: Кто это?',
        alive: 'Жив',
        dead: 'Мертв',
        male: 'Мужчина',
        female: 'Женщина',
        check: 'Проверить',
        stats: 'Статистика',
        correct: 'Правильные ответы',
        total: 'Всего вопросов',
        loading: 'Загрузка',
        next: 'Следующее фото'
    },
    en: {
        title: 'Quiz: Who is it?',
        alive: 'Alive',
        dead: 'Dead',
        male: 'Male',
        female: 'Female',
        check: 'Check',
        stats: 'Statistics',
        correct: 'Correct answers',
        total: 'Total questions',
        loading: 'Loading',
        next: 'Next photo'
    },
    alien: {
        title: '👾 Квіз: Хто це? 👾',
        alive: '🟢 Живий',
        dead: '💀 Мертвий',
        male: '👨 Чоловік',
        female: '👩 Жінка',
        check: '🛸 Перевірити',
        stats: '📊 Статистика',
        correct: '✅ Правильні відповіді',
        total: '🔢 Всього питань',
        loading: '⏳ Завантаження',
        next: '🚀 Наступне фото'
    }
};

// Состояние игры
let currentPerson = null;
let correctAnswers = 0;
let totalQuestions = 0;
let currentMode = 'easy';
let currentLanguage = 'uk';
let isDarkTheme = true;

// Переключение темы
themeToggle.addEventListener('click', () => {
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle('theme-light', !isDarkTheme);
    themeToggle.textContent = isDarkTheme ? translations[currentLanguage].night || 'Ніч' : translations[currentLanguage].day || 'День';
    gtag('event', 'theme_change', { theme: isDarkTheme ? 'dark' : 'light' });
});

// Переключение языка
languageSelect.addEventListener('change', () => {
    currentLanguage = languageSelect.value;
    updateUIText();
    gtag('event', 'language_change', { language: currentLanguage });
});

// Переключение режима
modeSelect.addEventListener('change', () => {
    currentMode = modeSelect.value;
    updateMode();
    loadNewPerson();
    gtag('event', 'mode_change', { mode: currentMode });
});

// Обновление текста интерфейса
function updateUIText() {
    const t = translations[currentLanguage];
    document.querySelector('h1').textContent = t.title;
    document.querySelectorAll('.status[data-status="alive"]').forEach(btn => btn.textContent = t.alive);
    document.querySelectorAll('.status[data-status="dead"]').forEach(btn => btn.textContent = t.dead);
    document.querySelectorAll('.gender[data-gender="male"]').forEach(btn => btn.textContent = t.male);
    document.querySelectorAll('.gender[data-gender="female"]').forEach(btn => btn.textContent = t.female);
    checkAnswerButton.textContent = t.check;
    document.querySelector('.stats h3').textContent = t.stats;
    document.querySelector('.stats p:nth-child(2)').childNodes[0].textContent = `${t.correct}: `;
    document.querySelector('.stats p:nth-child(3)').childNodes[0].textContent = `${t.total}: `;
}

// Обновление режима
function updateMode() {
    hardModeQuestions.style.display = currentMode === 'hard' ? 'block' : 'none';
    easyModeQuestions.style.display = currentMode === 'easy' ? 'block' : 'none';
    personImage.style.display = currentMode === 'easy' ? 'block' : 'none';
}

// Загрузка нового человека
async function loadNewPerson() {
    resetUI();
    loadingProgress.style.display = 'block';
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 10;
        loadingProgress.textContent = `${translations[currentLanguage].loading}: ${progress}%`;
        if (progress >= 80) clearInterval(progressInterval);
    }, 200);

    try {
        const person = await fetchRandomPerson();
        if (!person) throw new Error('Не удалось загрузить человека');
        currentPerson = person;
        personImage.src = person.image;
        personImage.style.display = currentMode === 'easy' ? 'block' : 'none';
        loadingProgress.textContent = `${translations[currentLanguage].loading}: 100%`;
        setTimeout(() => loadingProgress.style.display = 'none', 500);
        console.log('Загружен человек:', person); // Логи для отладки
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        loadingProgress.textContent = 'Помилка. Спробуйте ще раз.';
        setTimeout(loadNewPerson, 2000);
    }
}

// Получение случайного человека через Wikipedia API
async function fetchRandomPerson() {
    const wikiLang = currentLanguage === 'uk' ? 'uk' : currentLanguage === 'ru' ? 'ru' : 'en';
    const endpoint = `https://${wikiLang}.wikipedia.org/w/api.php`;

    // Получение списка популярных страниц (для режима "Просто")
    const category = currentMode === 'hard' ? 'Category:Living_people' : 'Category:All_people';
    let queryParams = {
        action: 'query',
        list: 'categorymembers',
        cmtitle: category,
        cmlimit: 50,
        cmtype: 'page',
        format: 'json',
        origin: '*'
    };

    let response = await fetch(`${endpoint}?${new URLSearchParams(queryParams)}`);
    let data = await response.json();
    let pages = data.query.categorymembers;

    // Случайный выбор страницы
    let page;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
        page = pages[Math.floor(Math.random() * pages.length)];
        queryParams = {
            action: 'query',
            prop: 'pageimages|info|extracts',
            pageids: page.pageid,
            pithumbsize: 300,
            inprop: 'url',
            exintro: true,
            explaintext: true,
            format: 'json',
            origin: '*'
        };

        response = await fetch(`${endpoint}?${new URLSearchParams(queryParams)}`);
        data = await response.json();
        const pageData = data.query.pages[page.pageid];

        // Проверка изображения
        if (pageData.thumbnail && pageData.thumbnail.source) {
            const imageUrl = pageData.thumbnail.source;
            const isValidImage = await checkImage(imageUrl);
            if (isValidImage) {
                return {
                    name: pageData.title,
                    image: imageUrl,
                    wikiUrl: pageData.fullurl,
                    isAlive: pageData.extract.includes('died') ? 'dead' : 'alive',
                    gender: await guessGender(pageData.title, wikiLang) // Упрощенная логика
                };
            }
        }
        attempts++;
    }
    return null;
}

// Проверка изображения
async function checkImage(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        const contentType = response.headers.get('content-type');
        return response.ok && contentType.startsWith('image/');
    } catch {
        return false;
    }
}

// Упрощенная проверка пола (заглушка)
async function guessGender(name, lang) {
    const maleIndicators = lang === 'uk' ? ['ий', 'ов', 'ич'] : lang === 'ru' ? ['ов', 'ий', 'ич'] : ['son', 'man'];
    const femaleIndicators = lang === 'uk' ? ['на', 'ка', 'ія'] : lang === 'ru' ? ['на', 'ая', 'ия'] : ['woman', 'ia'];
    return maleIndicators.some(ind => name.toLowerCase().endsWith(ind)) ? 'male' :
           femaleIndicators.some(ind => name.toLowerCase().endsWith(ind)) ? 'female' : 'unknown';
}

// Проверка ответа
checkAnswerButton.addEventListener('click', () => {
    if (!currentPerson) return;

    let isCorrect = true;
    if (currentMode === 'hard') {
        const selectedStatus = document.querySelector('input[name="status"]:checked');
        const selectedGender = document.querySelector('.gender.correct');
        if (selectedStatus) {
            const statusCorrect = selectedStatus.value === currentPerson.isAlive;
            if (statusCorrect) selectedStatus.parentElement.style.backgroundColor = 'var(--highlight-color)';
            else isCorrect = false;
        } else isCorrect = false;

        if (selectedGender) {
            const genderCorrect = selectedGender.dataset.gender === currentPerson.gender;
            if (genderCorrect) selectedGender.classList.add('correct');
            else isCorrect = false;
        } else isCorrect = false;
    } else {
        const selectedStatus = document.querySelector('.status.correct');
        if (selectedStatus) {
            const statusCorrect = selectedStatus.dataset.status === currentPerson.isAlive;
            if (statusCorrect) selectedStatus.classList.add('correct');
            else isCorrect = false;
        } else isCorrect = false;
    }

    // Показ результата
    personImage.style.display = 'block';
    personInfo.textContent = currentPerson.name;
    wikiLink.href = currentPerson.wikiUrl;
    resultDiv.style.display = 'block';

    // Обновление статистики
    totalQuestions++;
    if (isCorrect) correctAnswers++;
    correctAnswersSpan.textContent = correctAnswers;
    totalQuestionsSpan.textContent = totalQuestions;

    // Отправка в GA4
    gtag('event', 'answer_submitted', {
        mode: currentMode,
        is_correct: isCorrect,
        person_name: currentPerson.name
    });

    console.log('Проверка ответа:', { isCorrect, person: currentPerson }); // Логи для отладки
});

// Следующее фото
nextPhotoButton.addEventListener('click', loadNewPerson);

// Сброс интерфейса
function resetUI() {
    resultDiv.style.display = 'none';
    personInfo.textContent = '';
    wikiLink.href = '#';
    personImage.src = '';
    personImage.style.display = currentMode === 'easy' ? 'block' : 'none';
    document.querySelectorAll('.correct').forEach(el => el.classList.remove('correct'));
    document.querySelectorAll('input[name="status"]').forEach(input => input.checked = false);
}

// Обработка кликов по кнопкам статуса и пола
document.querySelectorAll('.status, .gender').forEach(button => {
    button.addEventListener('click', () => {
        const group = button.classList.contains('status') ? '.status' : '.gender';
        document.querySelectorAll(group).forEach(btn => btn.classList.remove('correct'));
        button.classList.add('correct');
    });
});

// Инициализация
updateUIText();
updateMode();
loadNewPerson();
