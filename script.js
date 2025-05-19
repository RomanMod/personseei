// Настройки приложения
const settings = {
    superRandomPeople: true,
    dynamicOffset: true,
    maxOffset: 2000,
    maxPeople: 300,
    sessionPeople: 10,
    genderRatio: { male: 50, female: 50 },
    statusRatio: { alive: 50, deceased: 50 },
    birthYearFilter: 1950,
    excludeBlackAndWhite: false,
    selectedCountries: ['ua', 'us'],
    countryMap: {
        'ua': 'Q212',
        'us': 'Q30',
        'ru': 'Q159',
        'de': 'Q183',
        'gb': 'Q145'
    },
    strictCountryFilter: false
};

// Кэш и состояние
const rgbHslCache = JSON.parse(localStorage.getItem('rgbHslCache')) || {};
const wikidataCache = JSON.parse(localStorage.getItem('wikidataCache')) || {};
let sessionList = [];
let loadedPhotos = 0;
let currentPerson = null;
let userGenderGuess = null;
let userStatusGuess = null;
let totalGuesses = parseInt(localStorage.getItem('totalGuesses')) || 0;
let successfulGuesses = parseInt(localStorage.getItem('successfulGuesses')) || 0;
let failedGuesses = parseInt(localStorage.getItem('failedGuesses')) || 0;
let hasChecked = false;
let currentAttempts = parseInt(localStorage.getItem('currentAttempts')) || 0;
const maxAttempts = 10;

// Переводы
const translations = {
    uk: {
        title: 'Гра: Випадкова людина з Wikidata',
        themeNight: '🌙 Ніч',
        themeDay: '☀ День',
        modeOpen: 'Відкритий',
        modeClosed: 'Закритий',
        nextPhoto: '🔄 Знайти нове фото',
        nextPerson: 'Наступне фото',
        unknown: 'Невідомо',
        testPerson: 'Тестовий персонаж',
        statsSuccess: 'Успішні',
        statsFailure: 'Невдалі',
        statsSuccessRate: 'Відсоток успішних',
        checkBtn: 'Перевірити',
        male: 'Чоловік',
        female: 'Жінка',
        alive: 'Живий',
        deceased: 'Померлий',
        birth: 'Народження',
        death: 'Смерть',
        newGame: 'Нова гра',
        attempts: 'Спроби'
    },
    ru: {
        title: 'Игра: Случайный человек из Wikidata',
        themeNight: '🌙 Ночь',
        themeDay: '☀ День',
        modeOpen: 'Открытый',
        modeClosed: 'Закрытый',
        nextPhoto: '🔄 Найти новое фото',
        nextPerson: 'Следующее фото',
        unknown: 'Неизвестно',
        testPerson: 'Тестовый персонаж',
        statsSuccess: 'Успешные',
        statsFailure: 'Неуспешные',
        statsSuccessRate: 'Процент успешных',
        checkBtn: 'Проверить',
        male: 'Мужчина',
        female: 'Женщина',
        alive: 'Жив',
        deceased: 'Мертв',
        birth: 'Рождение',
        death: 'Смерть',
        newGame: 'Новая игра',
        attempts: 'Попытки'
    },
    en: {
        title: 'Game: Random Person from Wikidata',
        themeNight: '🌙 Night',
        themeDay: '☀ Day',
        modeOpen: 'Open',
        modeClosed: 'Closed',
        nextPhoto: '🔄 Find New Photo',
        nextPerson: 'Next Photo',
        unknown: 'Unknown',
        testPerson: 'Test Person',
        statsSuccess: 'Successful',
        statsFailure: 'Unsuccessful',
        statsSuccessRate: 'Success Rate',
        checkBtn: 'Check',
        male: 'Male',
        female: 'Female',
        alive: 'Alive',
        deceased: 'Deceased',
        birth: 'Birth',
        death: 'Death',
        newGame: 'New Game',
        attempts: 'Attempts'
    },
    alien: {
        title: '👾 ⊸⍟⊸: ⊸⍟⊸ ⊸⍟⊸⊸ ⊸⍟ Wikidata',
        themeNight: '🌙 ⊸⍟⊸',
        themeDay: '☀ ⊸⍟⊸',
        modeOpen: '⊸⍟⊸',
        modeClosed: '⊸⍟⊸⊸',
        nextPhoto: '🔄 ⊸⍟⊸ ⊸⍟⊸',
        nextPerson: '⊸⍟⊸ ⊸⍟⊸',
        unknown: '⊸⍟⊸⊸⊸',
        testPerson: '⊸⍟⊸ ⊸⍟⊸',
        statsSuccess: '⊸⍟⊸⊸',
        statsFailure: '⊸⍟⊸⊸⊸',
        statsSuccessRate: '⊸⍟⊸⊸⊸⊸',
        checkBtn: '⊸⍟⊸',
        male: '⊸⍟⊸',
        female: '⊸⍟⊸⊸',
        alive: '⊸⍟⊸',
        deceased: '⊸⍟⊸⊸',
        birth: '⊸⍟⊸',
        death: '⊸⍟⊸⊸',
        newGame: '⊸⍟⊸ ⊸⍟⊸',
        attempts: '⊸⍟⊸⊸'
    }
};

// Инициализация настроек
let isNight = localStorage.getItem('theme') !== 'day';
let selectedLanguage = localStorage.getItem('language') || 'uk';
let gameMode = localStorage.getItem('mode') || 'open';

document.body.classList.toggle('day', !isNight);
document.querySelector('#language-select .selected-option').textContent = selectedLanguage === 'uk' ? 'Українська' : selectedLanguage === 'ru' ? 'Русский' : selectedLanguage === 'en' ? 'English' : '👽 ⊸⍟⊸';
document.querySelector('#mode-select .selected-option').textContent = translations[selectedLanguage][`mode${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)}`];

// Логирование инициализации
console.log('Инициализация стиля Space Gray (Шаг 3)');
console.log('Скрыты старые элементы интерфейса (кнопки, статистика, сообщения)');
console.log('Дисплей с фиксированным соотношением сторон 4:3');
console.log('Прогресс-бар в нижней части дисплея');
console.log('Кнопка "Найти новое фото" над дисплеем');
console.log('Тема: ' + (isNight ? 'ночь' : 'день'));
console.log('Выбран язык: ' + selectedLanguage);
console.log('Выбран режим: ' + gameMode);

// Обновление интерфейса по языку
function updateLanguage() {
    const texts = translations[selectedLanguage];
    document.getElementById('title').textContent = texts.title;
    document.getElementById('theme-toggle').textContent = isNight ? texts.themeNight : texts.themeDay;
    document.getElementById('next-photo').textContent = texts.nextPhoto;
    document.getElementById('next-person').textContent = texts.nextPerson;
    document.getElementById('check-btn').textContent = texts.checkBtn;
    document.getElementById('new-game').textContent = texts.newGame;
    document.getElementById('stats-attempts-label').textContent = texts.attempts;
    document.getElementById('stats-success-label').textContent = texts.statsSuccess;
    document.getElementById('stats-failure-label').textContent = texts.statsFailure;
    document.getElementById('stats-success-rate-label').textContent = texts.statsSuccessRate;
    document.getElementById('male-btn').textContent = texts.male;
    document.getElementById('female-btn').textContent = texts.female;
    document.getElementById('alive-btn').textContent = texts.alive;
    document.getElementById('dead-btn').textContent = texts.deceased;
    updateModeSelect();
    updateLanguageSelect();
    if (currentPerson) {
        updateUI(currentPerson);
    }
}

// Обновление текста режима
function updateModeSelect() {
    const modeSelectOptions = document.querySelector('#mode-select .options');
    modeSelectOptions.innerHTML = `
        <li data-value="open">${translations[selectedLanguage].modeOpen}</li>
        <li data-value="closed">${translations[selectedLanguage].modeClosed}</li>
    `;
    document.querySelector('#mode-select .selected-option').textContent = translations[selectedLanguage][`mode${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)}`];
}

// Обновление текста языка
function updateLanguageSelect() {
    const languageSelectOptions = document.querySelector('#language-select .options');
    languageSelectOptions.innerHTML = `
        <li data-value="uk">Українська</li>
        <li data-value="ru">Русский</li>
        <li data-value="en">English</li>
        <li data-value="alien">👽 ⊸⍟⊸</li>
    `;
    document.querySelector('#language-select .selected-option').textContent = selectedLanguage === 'uk' ? 'Українська' : selectedLanguage === 'ru' ? 'Русский' : selectedLanguage === 'en' ? 'English' : '👽 ⊸⍟⊸';
}

// Кастомные выпадающие списки
document.querySelectorAll('.custom-select').forEach(select => {
    const selectedOption = select.querySelector('.selected-option');
    const options = select.querySelector('.options');

    selectedOption.addEventListener('click', () => {
        options.style.display = options.style.display === 'none' ? 'block' : 'none';
    });

    options.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const value = e.target.getAttribute('data-value');
            if (select.id === 'language-select') {
                selectedLanguage = value;
                localStorage.setItem('language', selectedLanguage);
                updateLanguage();
            } else if (select.id === 'mode-select') {
                gameMode = value;
                localStorage.setItem('mode', gameMode);
                updateModeVisibility();
                updateCheckButtonState();
                updateModeSelect();
            }
            selectedOption.textContent = e.target.textContent;
            options.style.display = 'none';
        }
    });

    // Закрытие при клике вне
    document.addEventListener('click', (e) => {
        if (!select.contains(e.target)) {
            options.style.display = 'none';
        }
    });
});

// Переключение темы
document.getElementById('theme-toggle').addEventListener('click', () => {
    isNight = !isNight;
    document.body.classList.toggle('day', !isNight);
    localStorage.setItem('theme', isNight ? 'night' : 'day');
    updateLanguage();
    console.log('Тема изменена на: ' + (isNight ? 'ночь' : 'день'));
});

// Обновление видимости элементов в зависимости от режима
function updateModeVisibility() {
    const overlay = document.getElementById('overlay');
    const genderButtons = document.querySelector('.gender-buttons');
    const personImage = document.getElementById('person-image');
    
    requestAnimationFrame(() => {
        if (gameMode === 'closed') {
            overlay.classList.remove('hidden');
            genderButtons.style.display = 'flex';
            personImage.classList.remove('loaded');
        } else {
            overlay.classList.add('hidden');
            genderButtons.style.display = 'none';
            if (personImage.src) personImage.classList.add('loaded');
        }
    });
}

// Управление состоянием кнопки "Проверить"
function updateCheckButtonState() {
    const checkBtn = document.getElementById('check-btn');
    if (gameMode === 'closed') {
        checkBtn.disabled = !userGenderGuess || !userStatusGuess;
    } else {
        checkBtn.disabled = !userStatusGuess;
    }
}

// Логирование состояния загрузки
function logPhotoStatus() {
    console.log(`Загружено фото: ${loadedPhotos}, Осталось непросмотренных: ${sessionList.length}`);
}

// Обновление прогресс-бара
function updateProgressBar(percentage, isImageLoading = false) {
    const progressBar = document.getElementById('progress-bar');
    const progressPercentage = document.getElementById('progress-percentage');
    
    requestAnimationFrame(() => {
        progressBar.classList.remove('hidden');
        progressBar.style.width = `${percentage}%`;
        
        if (isImageLoading) {
            progressPercentage.classList.remove('hidden');
            progressPercentage.textContent = `${Math.round(percentage)}%`;
        }
        
        console.log(`Прогрес-бар (${isImageLoading ? 'изображение' : 'сессия'}): ${percentage}%`);
        if (percentage >= 100) {
            setTimeout(() => {
                progressBar.classList.add('hidden');
                progressPercentage.classList.add('hidden');
                console.log('Прогрес-бар і відсоток приховані');
            }, 500);
        }
    });
}

// Имитация прогресса для загрузки изображения
function simulateImageProgress(duration = 2000) {
    return new Promise((resolve) => {
        const startTime = performance.now();
        const interval = 100;
        let progress = 0;

        const update = () => {
            const elapsed = performance.now() - startTime;
            progress = Math.min((elapsed / duration) * 90, 90);
            updateProgressBar(progress, true);
            if (progress < 90) {
                setTimeout(update, interval);
            } else {
                resolve();
            }
        };
        update();
    });
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}

async function isBlackAndWhite(imageUrl) {
    if (!settings.excludeBlackAndWhite) return false;

    if (rgbHslCache[imageUrl] !== undefined) {
        console.log(`Using cached RGB+HSL result for ${imageUrl}: ${rgbHslCache[imageUrl] ? 'black-and-white' : 'color'}`);
        return rgbHslCache[imageUrl];
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 100, 100);

            const imageData = ctx.getImageData(0, 0, 100, 100).data;
            let rSum = 0, gSum = 0, bSum = 0;
            let rSquareSum = 0, gSquareSum = 0, bSquareSum = 0;
            let saturationSum = 0;
            let count = 0;

            for (let i = 0; i < imageData.length; i += 4) {
                const r = imageData[i];
                const g = imageData[i + 1];
                const b = imageData[i + 2];
                rSum += r;
                gSum += g;
                bSum += b;
                rSquareSum += r * r;
                gSquareSum += g * g;
                bSquareSum += b * b;

                const [, s] = rgbToHsl(r, g, b);
                saturationSum += s;
                count++;
            }

            const rMean = rSum / count;
            const gMean = gSum / count;
            const bMean = bSum / count;
            const rStdDev = Math.sqrt((rSquareSum / count) - (rMean * rMean));
            const gStdDev = Math.sqrt((gSquareSum / count) - (gMean * gMean));
            const bStdDev = Math.sqrt((bSquareSum / count) - (bMean * bMean));
            const meanSaturation = saturationSum / count;

            const isBW = rStdDev < 20 && gStdDev < 20 && bStdDev < 20 && meanSaturation < 0.2;
            console.log(`Image ${imageUrl} is ${isBW ? 'black-and-white' : 'color'} ` +
                        `(R:${rStdDev.toFixed(2)}, G:${gStdDev.toFixed(2)}, B:${bStdDev.toFixed(2)}, Saturation:${(meanSaturation * 100).toFixed(2)}%)`);
            
            rgbHslCache[imageUrl] = isBW;
            localStorage.setItem('rgbHslCache', JSON.stringify(rgbHslCache));
            
            resolve(isBW);
        };
        img.onerror = () => {
            console.error(`Failed to load image for RGB+HSL analysis: ${imageUrl}`);
            resolve(false);
        };
        img.src = büyüklük;
    });
}

async function getCommonsImageUrl(fileName) {
    const start = performance.now();
    try {
        const response = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url&format=json&origin=*`);
        if (!response.ok) throw new Error(`Commons API error: ${response.status}`);
        const data = await response.json();
        const pages = data.query.pages;
        const page = pages[Object.keys(pages)[0]];
        console.log(`Commons API time: ${(performance.now() - start).toFixed(0)}ms`);
        if (!page.imageinfo) {
            console.error(`No imageinfo for file: ${fileName}`);
            return null;
        }
        return page.imageinfo[0].url;
    } catch (error) {
        console.error(`Failed to fetch Commons image for ${fileName}:`, error.message);
        return null;
    }
}

async function loadImageWithFallback(url, element) {
    return new Promise((resolve, reject) => {
        element.classList.remove('loaded');
        const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
        console.log(`Attempting to load image via proxy: ${proxyUrl}`);
        
        const cleanup = () => {
            element.onload = null;
            element.onerror = null;
        };

        element.onload = () => {
            console.log(`Image loaded successfully via proxy: ${proxyUrl}`);
            element.classList.add('loaded');
            cleanup();
            resolve();
        };
        element.onerror = () => {
            console.error(`Proxy image load failed: ${proxyUrl}`);
            element.src = 'https://via.placeholder.com/300';
            element.classList.add('loaded');
            cleanup();
            reject(new Error(`Proxy image load failed: ${proxyUrl}`));
        };
        
        element.src = proxyUrl;
    });
}

async function fetchPersonData(useRandom = false, category = null) {
    const start = performance.now();
    let query;
    let attempts = 0;
    const maxAttempts = 5;

    const cacheKey = `${useRandom}-${category?.gender || 'any'}-${category?.status || 'any'}`;
    if (wikidataCache[cacheKey] && wikidataCache[cacheKey].length > 0) {
        console.log(`Using cached data for ${cacheKey}`);
        return wikidataCache[cacheKey][Math.floor(Math.random() * wikidataCache[cacheKey].length)];
    }

    const genderFilter = category?.gender === 'male' ? 'FILTER(?gender = wd:Q6581097)' :
                        category?.gender === 'female' ? 'FILTER(?gender = wd:Q6581072)' :
                        'FILTER(?gender IN (wd:Q6581097, wd:Q6581072))';
    const statusFilter = category?.status === 'alive' ? 'FILTER NOT EXISTS { ?person wdt:P570 ?deathDate }' :
                        category?.status === 'deceased' ? '?person wdt:P570 ?deathDate' :
                        'OPTIONAL { ?person wdt:P570 ?deathDate }';
    const birthDateFilter = `FILTER(?birthDate >= "${settings

.birthYearFilter}-01-01"^^xsd:dateTime).`;
    const countryFilter = settings.selectedCountries === 'all' ? '' :
                         `FILTER(?country IN (${settings.selectedCountries
                             .map(code => `wd:${settings.countryMap[code]}`)
                             .filter(id => id)
                             .join(', ')})).`;

    while (attempts < maxAttempts) {
        const offset = settings.dynamicOffset ? Math.floor(Math.random() * settings.maxOffset) : 0;
        query = `
            SELECT ?person ?personLabel ?image ?country ?gender ?deathDate ?birthDate ?sitelink
            WHERE {
                ?person wdt:P31 wd:Q5;
                        wdt:P18 ?image;
                        wdt:P21 ?gender;
                        wdt:P569 ?birthDate.
                ${settings.strictCountryFilter ? '' : 'OPTIONAL'} { ?person wdt:P27 ?country }.
                ${genderFilter}.
                ${statusFilter}.
                ${birthDateFilter}
                ${settings.selectedCountries !== 'all' && settings.strictCountryFilter ? countryFilter : ''}
                ?person rdfs:label ?personLabel.
                FILTER (LANG(?personLabel) = "en").
                OPTIONAL {
                    ?sitelink schema:about ?person;
                              schema:isPartOf <https://${selectedLanguage}.wikipedia.org/> .
                }
            }
            OFFSET ${offset}
            LIMIT ${settings.maxPeople}
        `;

        const endpoint = 'https://query.wikidata.org/sparql';
        const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json&nocache=${Date.now()}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/sparql-results+json',
                    'User-Agent': 'SimplePhotoApp/1.0 (https://romanmod.github.io/personseei/; krv.mod@gmail.com)',
                },
                signal: controller.signal
            });

            clearTimeout(timeout);
            const data = await response.json();
            const list = data.results.bindings;

            console.log(`Wikidata query time: ${(performance.now() - start).toFixed(0)}ms`);

            if (!list.length) {
                console.warn(`No results for category ${category?.gender || 'any'}/${category?.status || 'any'}, attempt ${attempts + 1}`);
                attempts++;
                continue;
            }

            wikidataCache[cacheKey] = (wikidataCache[cacheKey] || []).concat(list).slice(-100);
            localStorage.setItem('wikidataCache', JSON.stringify(wikidataCache));

            return list[Math.floor(Math.random() * list.length)];
        } catch (error) {
            console.error(`Wikidata query failed: ${error.message}`);
            attempts++;
            if (attempts === maxAttempts) {
                throw new Error(`No person found after ${maxAttempts} attempts`);
            }
        }
    }
    throw new Error(`No person found after ${maxAttempts} attempts`);
}

function updateUI({ personLabel, gender, deathDate, birthDate, person, sitelink }) {
    currentPerson = { personLabel, gender, deathDate, birthDate, person, sitelink };
    const personInfo = document.getElementById('person-info');
    const personDetails = document.getElementById('person-details');
    const wikiLink = document.getElementById('wiki-link');
    const texts = translations[selectedLanguage];
    
    requestAnimationFrame(() => {
        personInfo.style.display = 'none';
        personInfo.classList.remove('correct', 'incorrect');
        personDetails.textContent = `${personLabel.value}, ${gender.value.split('/').pop() === 'Q6581097' ? texts.male : texts.female}, ${deathDate ? texts.deceased : texts.alive}, ${texts.birth}: ${birthDate ? new Date(birthDate.value).toLocaleDateString('uk-UA') : texts.unknown}${deathDate ? `, ${texts.death}: ${new Date(deathDate.value).toLocaleDateString('uk-UA')}` : ''}`;
        wikiLink.href = sitelink?.value || `https://${selectedLanguage}.wikipedia.org/w/index.php?search=${encodeURIComponent(personLabel.value)}`;
        wikiLink.style.pointerEvents = sitelink ? 'auto' : 'auto';
        wikiLink.style.opacity = sitelink ? '1' : '0.8';
        console.log(`Wiki link set to: ${wikiLink.href}`);
        document.getElementById('next-person').style.display = 'none';
        updateModeVisibility();
        loadedPhotos++;
        logPhotoStatus();
    });
}

function handleError() {
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');
    const progressPercentage = document.getElementById('progress-percentage');

    requestAnimationFrame(() => {
        personImage.src = 'https://via.placeholder.com/300';
        if (gameMode === 'closed') {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
        progressPercentage.textContent = translations[selectedLanguage].error || 'Помилка';
        setTimeout(() => {
            progressPercentage.classList.add('hidden');
        }, 2000);
        logPhotoStatus();
    });
}

async function loadPersonFromData(person, category = null) {
    const personImage = document.getElementById('person-image');
    const progressPercentage = document.getElementById('progress-percentage');

    requestAnimationFrame(() => {
        personImage.src = '';
        personImage.classList.remove('loaded');
        progressPercentage.classList.remove('hidden');
        progressPercentage.textContent = '0%';
    });

    const progressPromise = simulateImageProgress(2000);

    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
        try {
            const fileName = decodeURIComponent(person.image.value.split('/').pop());
            console.log(`Fetching image for file: ${fileName}`);
            const imageUrl = await getCommonsImageUrl(fileName);
            if (!imageUrl) throw new Error(`Invalid image: ${fileName}`);

            if (settings.excludeBlackAndWhite) {
                const isBW = await isBlackAndWhite(imageUrl);
                if (isBW) {
                    console.warn(`Skipping black-and-white image for ${person.personLabel.value}`);
                    const newPerson = await fetchPersonData(false, category);
                    person = newPerson;
                    attempts++;
                    continue;
                }
            }

            try {
                await loadImageWithFallback(imageUrl, personImage);
                await progressPromise;
                updateProgressBar(100, true);
                updateUI({ ...person, person, sitelink: person.sitelink });
                return;
            } catch (imageError) {
                console.error(`Image load error: ${imageError.message}`);
                attempts++;
                const newPerson = await fetchPersonData(false, category);
                person = newPerson;
                continue;
            }
        } catch (error) {
            console.error('Ошибка:', error.message);
            attempts++;
            if (attempts === maxAttempts) {
                await progressPromise;
                updateProgressBar(100, true);
                handleError();
                return;
            }
        }
    }
}

async function loadSession() {
    const startTime = performance.now();
    console.time('loadSession');
    sessionList = [];
    const categories = [
        { gender: 'male', status: 'alive' },
        { gender: 'male', status: 'deceased' },
        { gender: 'female', status: 'alive' },
        { gender: 'female', status: 'deceased' }
    ];

    updateProgressBar(0);

    try {
        const totalCategories = categories.reduce((sum, _, i) => sum + (i % 2 === 0 ? 3 : 2), 0);
        let loadedCategories = 0;

        const promises = categories.map(async (category, i) => {
            const count = i % 2 === 0 ? 3 : 2;
            const results = [];
            for (let j = 0; j < count; j++) {
                try {
                    const person = await fetchPersonData(false, category);
                    results.push(person);
                    loadedCategories++;
                    updateProgressBar((loadedCategories / totalCategories) * 100);
                } catch (error) {
                    console.error(`Error in category ${category.gender}/${category.status}:`, error);
                    results.push(null);
                    loadedCategories++;
                    updateProgressBar((loadedCategories / totalCategories) * 100);
                }
            }
            return results;
        });
        const results = await Promise.all(promises);
        results.flat().forEach(person => {
            if (person) sessionList.push({ person, category: categories[Math.floor(sessionList.length / 2.5)] });
        });

        console.log(`Загружен новый список: ${sessionList.length} человек`);
        logPhotoStatus();
        updateProgressBar(100);

        if (sessionList.length > 0) {
            hasChecked = false;
            const { person, category } = sessionList.shift();
            await loadPersonFromData(person, category);
            requestAnimationFrame(() => {
                document.getElementById('male-btn').disabled = false;
                document.getElementById('female-btn').disabled = false;
                document.getElementById('alive-btn').disabled = false;
                document.getElementById('dead-btn').disabled = false;
                document.getElementById('alive-btn').style.display = 'inline-block';
                document.getElementById('dead-btn').style.display = 'inline-block';
                document.getElementById('check-btn').style.display = 'inline-block';
                document.getElementById('check-btn').disabled = true;
                document.getElementById('next-person').style.display = 'none';
                document.getElementById('new-game').style.display = 'none';
                document.getElementById('next-photo').disabled = false;
            });
        } else {
            handleError();
        }
    } catch (error) {
        console.error('Session data loading failed:', error);
        handleError();
        updateProgressBar(0);
    }
    console.timeEnd('loadSession');
    console.log(`Total session time: ${(performance.now() - startTime).toFixed(0)}ms`);
}

async function loadNextPerson() {
    if (sessionList.length === 0) {
        console.log('Список пуст, загружаем новый');
        await loadSession();
        return;
    }

    userGenderGuess = null;
    userStatusGuess = null;
    hasChecked = false;
    const { person, category } = sessionList.shift();
    if (person) {
        await loadPersonFromData(person, category);
    } else {
        handleError();
    }
    requestAnimationFrame(() => {
        document.getElementById('check-btn').disabled = true;
        document.getElementById('male-btn').disabled = false;
        document.getElementById('female-btn').disabled = false;
        document.getElementById('alive-btn').disabled = false;
        document.getElementById('dead-btn').disabled = false;
        document.getElementById('alive-btn').style.display = 'inline-block';
        document.getElementById('dead-btn').style.display = 'inline-block';
        document.getElementById('check-btn').style.display = 'inline-block';
        document.getElementById('next-person').style.display = 'none';
        document.getElementById('new-game').style.display = 'none';
        document.getElementById('next-photo').disabled = false;
    });
}

function startNewGame() {
    currentAttempts = 0;
    totalGuesses = 0;
    successfulGuesses = 0;
    failedGuesses = 0;
    localStorage.setItem('currentAttempts', currentAttempts);
    localStorage.setItem('totalGuesses', totalGuesses);
    localStorage.setItem('successfulGuesses', successfulGuesses);
    localStorage.setItem('failedGuesses', failedGuesses);

    document.getElementById('stats-attempts').textContent = `0/${maxAttempts}`;
    document.getElementById('stats-success').textContent = '0';
    document.getElementById('stats-failure').textContent = '0';
    document.getElementById('stats-success-rate').textContent = '0%';

    document.getElementById('new-game').style.display = 'none';

    userGenderGuess = null;
    userStatusGuess = null;
    hasChecked = false;
    document.getElementById('male-btn').classList.remove('active');
    document.getElementById('female-btn').classList.remove('active');
    document.getElementById('alive-btn').classList.remove('active');
    document.getElementById('dead-btn').classList.remove('active');
    document.getElementById('male-btn').disabled = false;
    document.getElementById('female-btn').disabled = false;
    document.getElementById('alive-btn').disabled = false;
    document.getElementById('dead-btn').disabled = false;
    document.getElementById('check-btn').disabled = true;
    document.getElementById('person-info').style.display = 'none';
    document.getElementById('next-person').style.display = 'none';
    document.getElementById('next-photo').disabled = false;
    document.getElementById('next-person').disabled = false;

    document.getElementById('alive-btn').style.display = 'inline-block';
    document.getElementById('dead-btn').style.display = 'inline-block';
    document.getElementById('check-btn').style.display = 'inline-block';

    if (sessionList.length > 0) {
        loadNextPerson();
    } else {
        loadSession();
    }

    console.log('Новая игра начата');
}

document.getElementById('next-photo').addEventListener('click', () => {
    console.log('Нажата кнопка "Найти новое фото"');
    userGenderGuess = null;
    userStatusGuess = null;
    document.getElementById('male-btn').classList.remove('active');
    document.getElementById('female-btn').classList.remove('active');
    document.getElementById('alive-btn').classList.remove('active');
    document.getElementById('dead-btn').classList.remove('active');
    loadNextPerson();
});

document.getElementById('male-btn').addEventListener('click', () => {
    userGenderGuess = 'male';
    document.getElementById('male-btn').classList.add('active');
    document.getElementById('female-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('Пользователь выбрал: Мужчина');
});

document.getElementById('female-btn').addEventListener('click', () => {
    userGenderGuess = 'female';
    document.getElementById('female-btn').classList.add('active');
    document.getElementById('male-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('Пользователь выбрал: Женщина');
});

document.getElementById('alive-btn').addEventListener('click', () => {
    userStatusGuess = 'alive';
    document.getElementById('alive-btn').classList.add('active');
    document.getElementById('dead-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('Пользователь выбрал: Жив');
});

document.getElementById('dead-btn').addEventListener('click', () => {
    userStatusGuess = 'dead';
    document.getElementById('dead-btn').classList.add('active');
    document.getElementById('alive-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('Пользователь выбрал: Мертв');
});

document.getElementById('check-btn').addEventListener('click', () => {
    if (!currentPerson || hasChecked) return;
    
    hasChecked = true;
    currentAttempts++;
    totalGuesses++;
    
    const isGenderCorrect = gameMode === 'closed' ? 
        userGenderGuess === (currentPerson.gender.value.split('/').pop() === 'Q6581097' ? 'male' : 'female') : true;
    const isStatusCorrect = (userStatusGuess === 'alive' && !currentPerson.deathDate) || 
                           (userStatusGuess === 'dead' && currentPerson.deathDate);
    
    const personInfo = document.getElementById('person-info');
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');
    
    requestAnimationFrame(() => {
        personInfo.style.display = 'block';
        if (gameMode === 'closed') {
            overlay.classList.add('hidden');
            personImage.classList.add('loaded');
        }
        if (isGenderCorrect && isStatusCorrect) {
            personInfo.classList.add('correct');
            successfulGuesses++;
        } else {
            personInfo.classList.add('incorrect');
            failedGuesses++;
        }
        document.getElementById('next-person').style.display = 'block';
        
        document.getElementById('alive-btn').style.display = 'none';
        document.getElementById('dead-btn').style.display = 'none';
        document.getElementById('check-btn').style.display = 'none';
        
        document.getElementById('male-btn').disabled = true;
        document.getElementById('female-btn').disabled = true;
        document.getElementById('alive-btn').disabled = true;
        document.getElementById('dead-btn').disabled = true;
        
        document.getElementById('male-btn').classList.remove('active');
        document.getElementById('female-btn').classList.remove('active');
        document.getElementById('alive-btn').classList.remove('active');
        document.getElementById('dead-btn').classList.remove('active');
        document.getElementById('check-btn').disabled = true;
        
        document.getElementById('stats-attempts').textContent = `${currentAttempts}/${maxAttempts}`;
        document.getElementById('stats-success').textContent = successfulGuesses;
        document.getElementById('stats-failure').textContent = failedGuesses;
        const successRate = totalGuesses > 0 ? ((successfulGuesses / totalGuesses) * 100).toFixed(1) : 0;
        document.getElementById('stats-success-rate').textContent = `${successRate}%`;
        
        localStorage.setItem('currentAttempts', currentAttempts);
        localStorage.setItem('totalGuesses', totalGuesses);
        localStorage.setItem('successfulGuesses', successfulGuesses);
        localStorage.setItem('failedGuesses', failedGuesses);

        if (currentAttempts >= maxAttempts) {
            document.getElementById('new-game').style.display = 'block';
            document.getElementById('next-photo').disabled = true;
            document.getElementById('next-person').style.display = 'none';
            document.getElementById('check-btn').style.display = 'none';
            document.getElementById('alive-btn').style.display = 'none';
            document.getElementById('dead-btn').style.display = 'none';
        }
    });
    console.log(`Проверка: Пол ${isGenderCorrect ? 'верно' : 'неверно'}, Статус ${isStatusCorrect ? 'верно' : 'неверно'}`);
});

document.getElementById('next-person').addEventListener('click', () => {
    console.log('Нажата кнопка "Следующее фото"');
    userGenderGuess = null;
    userStatusGuess = null;
    document.getElementById('male-btn').classList.remove('active');
    document.getElementById('female-btn').classList.remove('active');
    document.getElementById('alive-btn').classList.remove('active');
    document.getElementById('dead-btn').classList.remove('active');
    loadNextPerson();
});

document.getElementById('new-game').addEventListener('click', () => {
    console.log('Нажата кнопка "Новая игра"');
    startNewGame();
});

window.onload = () => {
    updateLanguage();
    updateLanguageSelect();
    updateModeSelect();
    updateModeVisibility();
    loadSession();
    document.getElementById('stats-attempts').textContent = `${currentAttempts}/${maxAttempts}`;
    document.getElementById('stats-success').textContent = successfulGuesses;
    document.getElementById('stats-failure').textContent = failedGuesses;
    const successRate = totalGuesses > 0 ? ((successfulGuesses / totalGuesses) * 100).toFixed(1) : 0;
    document.getElementById('stats-success-rate').textContent = `${successRate}%`;
    if (currentAttempts >= maxAttempts) {
        document.getElementById('new-game').style.display = 'block';
        document.getElementById('next-photo').disabled = true;
        document.getElementById('next-person').style.display = 'none';
        document.getElementById('check-btn').style.display = 'none';
        document.getElementById('alive-btn').style.display = 'none';
        document.getElementById('dead-btn').style.display = 'none';
    }
};
