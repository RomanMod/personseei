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
        attempts: 'Спроби',
        error: 'Помилка'
    },
    ru: {
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
        attempts: 'Попытки',
        error: 'Ошибка'
    },
    en: {
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
        attempts: 'Attempts',
        error: 'Error'
    },
    alien: {
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
        attempts: '⊸⍟⊸⊸',
        error: '⊸⍟⊸⊸!'
    }
};

// Инициализация настроек
let isNight = localStorage.getItem('theme') !== 'day';
let selectedLanguage = localStorage.getItem('language') || 'uk';
let gameMode = localStorage.getItem('mode') || 'open';

// Google Analytics 4 Event Sender
function sendGAEvent(eventName, eventParams = {}) {
    if (typeof gtag === 'function') {
        gtag('event', eventName, eventParams);
        console.log(`GA Event: ${eventName}`, eventParams);
    } else {
        console.warn(`gtag is not defined. GA Event not sent: ${eventName}`, eventParams);
    }
}


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
        updateUI(currentPerson); // Make sure this is using person object not just personLabel
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
                const oldLanguage = selectedLanguage;
                selectedLanguage = value;
                localStorage.setItem('language', selectedLanguage);
                if (oldLanguage !== selectedLanguage) {
                    sendGAEvent('language_changed', { new_language: selectedLanguage });
                }
                updateLanguage();
            } else if (select.id === 'mode-select') {
                const oldMode = gameMode;
                gameMode = value;
                localStorage.setItem('mode', gameMode);
                if (oldMode !== gameMode) {
                    sendGAEvent('game_mode_changed', { new_game_mode: gameMode });
                }
                updateModeVisibility();
                updateCheckButtonState();
                updateModeSelect();
            }
            selectedOption.textContent = e.target.textContent;
            options.style.display = 'none';
        }
    });

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
    sendGAEvent('theme_changed', { new_theme: isNight ? 'night' : 'day' });
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
            if (personImage.src && personImage.src !== 'placeholder.jpg' && personImage.src !== 'https://via.placeholder.com/300') {
                 personImage.classList.add('loaded');
            }
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
                if (isImageLoading) progressPercentage.classList.add('hidden'); // Only hide percentage if it was for image loading
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
            progress = Math.min((elapsed / duration) * 90, 90); // Cap at 90% until final load
            updateProgressBar(progress, true);
            if (progress < 90) {
                setTimeout(update, interval);
            } else {
                resolve(); // Resolve when simulation reaches 90%
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

                const [, sVal] = rgbToHsl(r, g, b);
                saturationSum += sVal;
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
        img.src = imageUrl;
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
            element.classList.add('loaded'); // Still mark as loaded to unblock UI
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
    const maxQueryAttempts = 5; // Renamed for clarity

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
    const birthDateFilter = `FILTER(?birthDate >= "${settings.birthYearFilter}-01-01T00:00:00Z"^^xsd:dateTime).`; // Ensure correct dateTime format
    const countryFilter = settings.selectedCountries === 'all' ? '' :
                         `FILTER(?country IN (${settings.selectedCountries
                             .map(code => `wd:${settings.countryMap[code]}`)
                             .filter(id => id)
                             .join(', ')})).`;

    while (attempts < maxQueryAttempts) {
        const offset = settings.dynamicOffset ? Math.floor(Math.random() * settings.maxOffset) : 0;
        query = `
            SELECT ?person ?personLabel ?image ?country ?gender ?deathDate ?birthDate
            WHERE {
                ?person wdt:P31 wd:Q5;
                        wdt:P18 ?image;
                        wdt:P21 ?gender;
                        wdt:P569 ?birthDate.
                ${settings.strictCountryFilter ? '' : 'OPTIONAL'} { ?person wdt:P27 ?country }.
                ${genderFilter}
                ${statusFilter}
                ${birthDateFilter}
                ${settings.selectedCountries !== 'all' && settings.strictCountryFilter ? countryFilter : ''}
                ?person rdfs:label ?personLabel.
                FILTER (LANG(?personLabel) = "en").
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

            wikidataCache[cacheKey] = (wikidataCache[cacheKey] || []).concat(list).slice(-100); // Keep cache size manageable
            localStorage.setItem('wikidataCache', JSON.stringify(wikidataCache));

            return list[Math.floor(Math.random() * list.length)];
        } catch (error) {
            console.error(`Wikidata query failed: ${error.message}`);
            attempts++;
            if (attempts === maxQueryAttempts) {
                throw new Error(`No person found after ${maxQueryAttempts} query attempts`);
            }
        }
    }
    throw new Error(`No person found after ${maxQueryAttempts} query attempts`);
}

async function loadPersonFromData(personData, category = null) { // Renamed person to personData to avoid conflict with currentPerson
    const personImage = document.getElementById('person-image');
    const progressPercentage = document.getElementById('progress-percentage');

    requestAnimationFrame(() => {
        personImage.src = ''; // Clear previous image
        personImage.classList.remove('loaded');
        progressPercentage.classList.remove('hidden');
        progressPercentage.textContent = '0%';
        document.getElementById('progress-bar').style.width = '0%'; // Reset progress bar
        document.getElementById('progress-bar').classList.remove('hidden');
    });

    const progressPromise = simulateImageProgress(2000);
    let currentPersonCandidate = personData; // Use a mutable variable for retries

    let attempts = 0;
    const maxImageLoadAttempts = 3; // Max attempts to load an image for *different* persons if one fails B&W or load

    while (attempts < maxImageLoadAttempts) {
        try {
            if (!currentPersonCandidate || !currentPersonCandidate.image || !currentPersonCandidate.image.value) {
                 console.warn(`Invalid person data or image for attempt ${attempts + 1}, fetching new person.`);
                 currentPersonCandidate = await fetchPersonData(true, category); // Fetch a completely new random person
                 attempts++;
                 continue;
            }

            const fileName = decodeURIComponent(currentPersonCandidate.image.value.split('/').pop());
            console.log(`Fetching image for file: ${fileName}`);
            const imageUrl = await getCommonsImageUrl(fileName);
            if (!imageUrl) {
                 console.warn(`No Commons URL for ${fileName}, fetching new person.`);
                 currentPersonCandidate = await fetchPersonData(true, category);
                 attempts++;
                 continue;
            }

            if (settings.excludeBlackAndWhite) {
                const isBW = await isBlackAndWhite(imageUrl);
                if (isBW) {
                    console.warn(`Skipping black-and-white image for ${currentPersonCandidate.personLabel.value}, fetching new person.`);
                    currentPersonCandidate = await fetchPersonData(true, category);
                    attempts++;
                    continue;
                }
            }
            // At this point, progressPromise is for the *first* image attempt.
            // If we retry, we don't want to wait for the old promise.
            // However, simulateImageProgress updates global UI, so it's tricky.
            // For simplicity, we let the initial progress simulation run its course.
            // Ideally, progress simulation should be cancellable or tied to the current image.

            await loadImageWithFallback(imageUrl, personImage); // This can throw
            await progressPromise; // Wait for the initial simulation to complete
            updateProgressBar(100, true); // Ensure it hits 100%
            
            // Successfully loaded an image
            currentPerson = { // Set the global currentPerson here
                personLabel: currentPersonCandidate.personLabel,
                gender: currentPersonCandidate.gender,
                deathDate: currentPersonCandidate.deathDate,
                birthDate: currentPersonCandidate.birthDate,
                person: currentPersonCandidate.person // Keep the full person object if needed elsewhere
            };
            updateUI(currentPerson); // Pass the now confirmed currentPerson
            sendGAEvent('photo_loaded', {
                person_id: currentPerson.person.value.split('/').pop(),
                person_name: currentPerson.personLabel.value,
                language: selectedLanguage,
                game_mode: gameMode
            });
            return; // Exit after successful load

        } catch (error) { // Catches errors from getCommonsImageUrl, isBlackAndWhite, loadImageWithFallback
            console.error(`Error processing person/image (attempt ${attempts + 1}/${maxImageLoadAttempts}): ${error.message}`);
            attempts++;
            if (attempts < maxImageLoadAttempts) {
                 console.log("Fetching a new person due to error.");
                 currentPersonCandidate = await fetchPersonData(true, category); // Fetch a new person for the next attempt
                 // Reset visual progress for the new attempt
                 requestAnimationFrame(() => {
                    personImage.src = '';
                    personImage.classList.remove('loaded');
                    progressPercentage.textContent = '0%';
                    document.getElementById('progress-bar').style.width = '0%';
                 });
            } else {
                console.error(`Max image load attempts reached for this slot.`);
                await progressPromise; // Ensure initial simulation completes
                updateProgressBar(100, true); // Visually complete progress
                handleError(); // Show general error
                return;
            }
        }
    }
}


function updateUI(personToDisplay) { // Changed param name for clarity
    // currentPerson is already set by loadPersonFromData before calling updateUI
    const personInfo = document.getElementById('person-info');
    const personDetails = document.getElementById('person-details');
    const texts = translations[selectedLanguage];
    
    requestAnimationFrame(() => {
        personInfo.style.display = 'none';
        personInfo.classList.remove('correct', 'incorrect');
        
        if (personToDisplay && personToDisplay.personLabel && personToDisplay.gender) {
             personDetails.textContent = `${personToDisplay.personLabel.value}, ${personToDisplay.gender.value.split('/').pop() === 'Q6581097' ? texts.male : texts.female}, ${personToDisplay.deathDate ? texts.deceased : texts.alive}, ${texts.birth}: ${personToDisplay.birthDate ? new Date(personToDisplay.birthDate.value).toLocaleDateString('uk-UA') : texts.unknown}${personToDisplay.deathDate ? `, ${texts.death}: ${new Date(personToDisplay.deathDate.value).toLocaleDateString('uk-UA')}` : ''}`;
        } else {
            personDetails.textContent = texts.unknown; // Fallback for missing data
        }

        document.getElementById('next-person').style.display = 'none';
        updateModeVisibility(); // This will correctly show/hide overlay and image
        loadedPhotos++;
        logPhotoStatus();
    });
}

function handleError() {
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');
    const progressPercentage = document.getElementById('progress-percentage');

    requestAnimationFrame(() => {
        personImage.src = 'https://via.placeholder.com/300'; // Placeholder for error
        personImage.classList.add('loaded'); // Ensure placeholder is visible
        
        if (gameMode === 'closed') {
            overlay.classList.remove('hidden'); // Keep overlay if closed mode for consistency
        } else {
            overlay.classList.add('hidden');
        }
        progressPercentage.classList.remove('hidden');
        progressPercentage.textContent = translations[selectedLanguage].error || 'Error';
        
        setTimeout(() => {
            progressPercentage.classList.add('hidden');
        }, 2000);
        logPhotoStatus();
    });
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

    updateProgressBar(0, false); // Progress for session loading, not image

    try {
        // Simplified: aim for settings.sessionPeople, fetch one by one for better category distribution if needed
        // For now, fetch enough to fill sessionPeople, distributing among categories
        const peoplePerCategory = Math.ceil(settings.sessionPeople / categories.length);
        let fetchedCount = 0;

        const promises = [];
        for (const category of categories) {
            for (let j = 0; j < peoplePerCategory && sessionList.length < settings.sessionPeople; j++) {
                promises.push(
                    fetchPersonData(false, category).then(person => {
                        if (person) {
                            sessionList.push({ person, category }); // Store original category for potential retry logic
                        }
                        fetchedCount++;
                        updateProgressBar((fetchedCount / (peoplePerCategory * categories.length)) * 100, false);
                        return person;
                    }).catch(error => {
                        console.error(`Error fetching for category ${category.gender}/${category.status}:`, error);
                        fetchedCount++;
                        updateProgressBar((fetchedCount / (peoplePerCategory * categories.length)) * 100, false);
                        return null; // Allow Promise.all to complete
                    })
                );
            }
        }
        
        await Promise.all(promises);
        sessionList = sessionList.filter(p => p !== null).slice(0, settings.sessionPeople); // Ensure not null and cap at sessionPeople

        console.log(`Загружен новый список: ${sessionList.length} человек`);
        logPhotoStatus();
        updateProgressBar(100, false);

        if (sessionList.length > 0) {
            hasChecked = false;
            const { person, category } = sessionList.shift();
            await loadPersonFromData(person, category); // Pass the fetched person data and its original category
            requestAnimationFrame(() => {
                document.getElementById('male-btn').disabled = false;
                document.getElementById('female-btn').disabled = false;
                document.getElementById('alive-btn').disabled = false;
                document.getElementById('dead-btn').disabled = false;
                document.getElementById('alive-btn').style.display = 'inline-block';
                document.getElementById('dead-btn').style.display = 'inline-block';
                document.getElementById('check-btn').style.display = 'inline-block';
                document.getElementById('check-btn').disabled = true; // Should be re-enabled by guess
                document.getElementById('next-person').style.display = 'none';
                document.getElementById('next-photo').disabled = false;
                updateCheckButtonState(); // Initial state
            });
        } else {
            handleError();
        }
    } catch (error) {
        console.error('Session data loading failed:', error);
        handleError();
        updateProgressBar(0, false); // Reset session progress on major failure
    }
    console.timeEnd('loadSession');
    console.log(`Total session time: ${(performance.now() - startTime).toFixed(0)}ms`);
}

async function loadNextPerson(triggerButton = 'unknown') {
    sendGAEvent('next_photo_requested', {
        trigger_button: triggerButton,
        language: selectedLanguage,
        game_mode: gameMode
    });

    if (sessionList.length === 0) {
        console.log('Список пуст, загружаем новый');
        await loadSession();
        return;
    }

    userGenderGuess = null;
    userStatusGuess = null;
    hasChecked = false;
    document.getElementById('male-btn').classList.remove('active');
    document.getElementById('female-btn').classList.remove('active');
    document.getElementById('alive-btn').classList.remove('active');
    document.getElementById('dead-btn').classList.remove('active');

    const { person, category } = sessionList.shift();
    if (person) {
        await loadPersonFromData(person, category);
    } else {
        // If a null was somehow in sessionList, or person fetch failed earlier
        console.warn("Encountered null person in session list, trying next or reloading session.");
        await loadNextPerson(triggerButton); // Try the next one, or it will reload session
        return;
    }
    requestAnimationFrame(() => {
        updateCheckButtonState(); // Reset check button based on new state
        document.getElementById('male-btn').disabled = false;
        document.getElementById('female-btn').disabled = false;
        document.getElementById('alive-btn').disabled = false;
        document.getElementById('dead-btn').disabled = false;
        document.getElementById('alive-btn').style.display = 'inline-block';
        document.getElementById('dead-btn').style.display = 'inline-block';
        document.getElementById('check-btn').style.display = 'inline-block';
        document.getElementById('next-person').style.display = 'none';
        document.getElementById('next-photo').disabled = currentAttempts >= maxAttempts; // Disable if game over
         document.getElementById('person-info').style.display = 'none'; // Hide previous info
         document.getElementById('person-info').classList.remove('correct', 'incorrect');

    });
}

function startNewGame() {
    currentAttempts = 0;
    totalGuesses = 0; // Reset for the new game session
    successfulGuesses = 0;
    failedGuesses = 0;
    // Keep global stats in localStorage, but reset session stats
    localStorage.setItem('currentAttempts', currentAttempts);
    // Optionally reset global stats or have separate global/session stats
    // For now, we are resetting the displayed stats which are session-based

    sendGAEvent('new_game_started', {
        language: selectedLanguage,
        game_mode: gameMode
    });

    document.getElementById('stats-attempts').textContent = `0/${maxAttempts}`;
    document.getElementById('stats-success').textContent = '0';
    document.getElementById('stats-failure').textContent = '0';
    document.getElementById('stats-success-rate').textContent = '0%';

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
    updateCheckButtonState(); // Will disable if no guesses
    document.getElementById('person-info').style.display = 'none';
    document.getElementById('next-person').style.display = 'none';
    document.getElementById('next-photo').disabled = false; // Re-enable for new game
    
    document.getElementById('alive-btn').style.display = 'inline-block';
    document.getElementById('dead-btn').style.display = 'inline-block';
    document.getElementById('check-btn').style.display = 'inline-block';

    loadSession(); // Start loading a fresh session

    console.log('Новая игра начата');
}

document.getElementById('next-photo').addEventListener('click', () => {
    console.log('Нажата кнопка "Найти новое фото"');
    loadNextPerson('find_new');
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
    totalGuesses++; // This is session total guesses
    
    const actualGender = currentPerson.gender.value.split('/').pop() === 'Q6581097' ? 'male' : 'female';
    const actualStatus = currentPerson.deathDate ? 'dead' : 'alive';

    const isGenderCorrect = gameMode === 'closed' ? userGenderGuess === actualGender : true;
    const isStatusCorrect = userStatusGuess === actualStatus;
    const isOverallCorrect = isGenderCorrect && isStatusCorrect;
    
    const personInfo = document.getElementById('person-info');
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');

    sendGAEvent('guess_made', {
        person_id: currentPerson.person.value.split('/').pop(),
        game_mode: gameMode,
        guessed_gender: gameMode === 'closed' ? userGenderGuess : undefined,
        actual_gender: actualGender,
        guessed_status: userStatusGuess,
        actual_status: actualStatus,
        is_gender_correct: gameMode === 'closed' ? isGenderCorrect : undefined,
        is_status_correct: isStatusCorrect,
        is_overall_correct: isOverallCorrect,
        attempt_number: currentAttempts,
        language: selectedLanguage
    });
    
    requestAnimationFrame(() => {
        personInfo.style.display = 'block';
        if (gameMode === 'closed') {
            overlay.classList.add('hidden'); // Show image after guess in closed mode
            personImage.classList.add('loaded');
        }
        if (isOverallCorrect) {
            personInfo.classList.add('correct');
            personInfo.classList.remove('incorrect');
            successfulGuesses++;
        } else {
            personInfo.classList.add('incorrect');
            personInfo.classList.remove('correct');
            failedGuesses++;
        }
        document.getElementById('next-person').style.display = 'block';
        
        // Hide guess-related buttons, show only next person
        document.getElementById('alive-btn').style.display = 'none';
        document.getElementById('dead-btn').style.display = 'none';
        document.getElementById('check-btn').style.display = 'none';
        if (gameMode === 'closed') {
            document.querySelector('.gender-buttons').style.display = 'none';
        }
        
        // Disable buttons that were active for guessing
        document.getElementById('male-btn').disabled = true;
        document.getElementById('female-btn').disabled = true;
        // No need to disable alive/dead/check as they are hidden

        // Update stats
        document.getElementById('stats-attempts').textContent = `${currentAttempts}/${maxAttempts}`;
        document.getElementById('stats-success').textContent = successfulGuesses;
        document.getElementById('stats-failure').textContent = failedGuesses;
        const successRate = totalGuesses > 0 ? ((successfulGuesses / totalGuesses) * 100).toFixed(1) : 0;
        document.getElementById('stats-success-rate').textContent = `${successRate}%`;
        
        // Save session stats to localStorage (or could be global if desired)
        localStorage.setItem('currentAttempts', currentAttempts);
        localStorage.setItem('totalGuesses', totalGuesses); // Persist session total
        localStorage.setItem('successfulGuesses', successfulGuesses);
        localStorage.setItem('failedGuesses', failedGuesses);

        if (currentAttempts >= maxAttempts) {
            document.getElementById('next-photo').disabled = true;
            document.getElementById('next-person').style.display = 'none'; // No more next people
            sendGAEvent('game_over', {
                total_attempts: maxAttempts,
                successful_guesses: successfulGuesses,
                failed_guesses: failedGuesses,
                success_rate: `${successRate}%`,
                language: selectedLanguage,
                game_mode: gameMode
            });
        }
    });
    console.log(`Проверка: Пол ${isGenderCorrect ? 'верно' : 'неверно'}, Статус ${isStatusCorrect ? 'верно' : 'неверно'}`);
});

document.getElementById('next-person').addEventListener('click', () => {
    console.log('Нажата кнопка "Следующее фото"');
     requestAnimationFrame(() => { // Ensure UI updates before loading next
        if (gameMode === 'closed') {
             document.querySelector('.gender-buttons').style.display = 'flex'; // Re-show gender buttons
        }
        document.getElementById('male-btn').disabled = false;
        document.getElementById('female-btn').disabled = false;
    });
    loadNextPerson('next_after_check');
});

document.getElementById('new-game').addEventListener('click', () => {
    console.log('Нажата кнопка "Новая игра"');
    if (gameMode === 'closed') {
        document.querySelector('.gender-buttons').style.display = 'flex'; // Ensure gender buttons are visible for new game in closed mode
    }
    startNewGame();
});

window.onload = () => {
    // Retrieve session stats from localStorage or default to 0
    currentAttempts = parseInt(localStorage.getItem('currentAttempts')) || 0;
    totalGuesses = parseInt(localStorage.getItem('totalGuesses')) || 0;
    successfulGuesses = parseInt(localStorage.getItem('successfulGuesses')) || 0;
    failedGuesses = parseInt(localStorage.getItem('failedGuesses')) || 0;


    updateLanguage();
    updateLanguageSelect();
    updateModeSelect();
    updateModeVisibility(); // Initial setup of visibility based on mode
    
    if (currentAttempts >= maxAttempts) {
        // Game was over, show stats, disable further play until new game
        document.getElementById('stats-attempts').textContent = `${currentAttempts}/${maxAttempts}`;
        document.getElementById('stats-success').textContent = successfulGuesses;
        document.getElementById('stats-failure').textContent = failedGuesses;
        const successRate = totalGuesses > 0 ? ((successfulGuesses / totalGuesses) * 100).toFixed(1) : 0;
        document.getElementById('stats-success-rate').textContent = `${successRate}%`;
        
        document.getElementById('next-photo').disabled = true;
        document.getElementById('next-person').style.display = 'none';
        document.getElementById('check-btn').style.display = 'none';
        document.getElementById('alive-btn').style.display = 'none';
        document.getElementById('dead-btn').style.display = 'none';
        if (gameMode === 'closed') {
            document.querySelector('.gender-buttons').style.display = 'none';
        }
        // Display last person's info if available (optional, could be cleared)
        // For now, don't load a new session, just wait for "New Game"
         console.log("Game was previously over. Press 'New Game' to start.");
    } else {
        // Game is not over, or it's a fresh start
        document.getElementById('stats-attempts').textContent = `${currentAttempts}/${maxAttempts}`;
        document.getElementById('stats-success').textContent = successfulGuesses;
        document.getElementById('stats-failure').textContent = failedGuesses;
        const successRate = totalGuesses > 0 ? ((successfulGuesses / totalGuesses) * 100).toFixed(1) : 0;
        document.getElementById('stats-success-rate').textContent = `${successRate}%`;
        
        // If there are attempts left but no current session data, or to resume
        // a game, we'd typically load a session.
        // For simplicity, if there are attempts left but no active person,
        // it implies a refresh or returning to a game in progress.
        // We'll start a new session to ensure fresh data.
        // A more complex resume logic would be needed to restore exact person.
        if (!currentPerson) { // If no person is loaded (e.g. after refresh)
             loadSession();
        }
    }

    document.getElementById('new-game').style.display = 'block';
    updateCheckButtonState(); // Set initial state of check button
};
