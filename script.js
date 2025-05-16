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
let userGuess = null;

// Переводы
const translations = {
    uk: {
        title: 'Гра: Випадкова людина з Wikidata',
        themeNight: '🌙 Ніч',
        themeDay: '☀ День',
        modeOpen: 'Відкритий',
        modeClosed: 'Закритий',
        nextPhoto: '🔄 Знайти нове фото',
        male: 'Чоловік',
        female: 'Жінка',
        alive: 'Живий',
        deceased: 'Мерц',
        unknown: 'Невідомо',
        testPerson: 'Тестовий персонаж'
    },
    ru: {
        title: 'Игра: Случайный человек из Wikidata',
        themeNight: '🌙 Ночь',
        themeDay: '☀ День',
        modeOpen: 'Открытый',
        modeClosed: 'Закрытый',
        nextPhoto: '🔄 Найти новое фото',
        male: 'Мужчина',
        female: 'Женщина',
        alive: 'Жив',
        deceased: 'Мертв',
        unknown: 'Неизвестно',
        testPerson: 'Тестовый персонаж'
    },
    en: {
        title: 'Game: Random Person from Wikidata',
        themeNight: '🌙 Night',
        themeDay: '☀ Day',
        modeOpen: 'Open',
        modeClosed: 'Closed',
        nextPhoto: '🔄 Find New Photo',
        male: 'Male',
        female: 'Female',
        alive: 'Alive',
        deceased: 'Deceased',
        unknown: 'Unknown',
        testPerson: 'Test Person'
    },
    alien: {
        title: '👾 ⊸⍟⊸: ⊸⍟⊸ ⊸⍟⊸⊸ ⊸⍟ Wikidata',
        themeNight: '🌙 ⊸⍟⊸',
        themeDay: '☀ ⊸⍟⊸',
        modeOpen: '⊸⍟⊸',
        modeClosed: '⊸⍟⊸⊸',
        nextPhoto: '🔄 ⊸⍟⊸ ⊸⍟⊸',
        male: '⊸⍟⊸',
        female: '⊸⍟⊸⊸',
        alive: '⊸⍟⊸',
        deceased: '⊸⍟⊸⊸',
        unknown: '⊸⍟⊸⊸⊸',
        testPerson: '⊸⍟⊸ ⊸⍟⊸'
    }
};

// Инициализация настроек
let isNight = localStorage.getItem('theme') !== 'day';
let selectedLanguage = localStorage.getItem('language') || 'uk';
let gameMode = localStorage.getItem('mode') || 'open';

document.body.classList.toggle('day', !isNight);
document.getElementById('language-select').value = selectedLanguage;
document.getElementById('mode-select').value = gameMode;

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
    document.getElementById('alive-btn').textContent = texts.alive;
    document.getElementById('dead-btn').textContent = texts.deceased;
    updateModeSelect();
}

// Обновление текста режима
function updateModeSelect() {
    const modeSelect = document.getElementById('mode-select');
    modeSelect.innerHTML = `
        <option value="open">${translations[selectedLanguage].modeOpen}</option>
        <option value="closed">${translations[selectedLanguage].modeClosed}</option>
    `;
    modeSelect.value = gameMode;
}

// Переключение темы
document.getElementById('theme-toggle').addEventListener('click', () => {
    isNight = !isNight;
    document.body.classList.toggle('day', !isNight);
    localStorage.setItem('theme', isNight ? 'night' : 'day');
    updateLanguage();
    console.log('Тема изменена на: ' + (isNight ? 'ночь' : 'день'));
});

// Смена языка
document.getElementById('language-select').addEventListener('change', (e) => {
    selectedLanguage = e.target.value;
    localStorage.setItem('language', selectedLanguage);
    updateLanguage();
    console.log('Выбран язык: ' + selectedLanguage);
});

// Смена режима
document.getElementById('mode-select').addEventListener('change', (e) => {
    gameMode = e.target.value;
    localStorage.setItem('mode', gameMode);
    console.log('Выбран режим: ' + gameMode);
});

// Логирование состояния загрузки
function logPhotoStatus() {
    console.log(`Загружено фото: ${loadedPhotos}, Осталось непросмотренных: ${sessionList.length}`);
}

// Обновление прогресс-бара
function updateProgressBar(percentage) {
    const progressBar = document.getElementById('progress-bar');
    requestAnimationFrame(() => {
        progressBar.style.width = `${percentage}%`;
        console.log(`Прогресс-бар: ${percentage}%`);
        if (percentage >= 100) {
            setTimeout(() => {
                progressBar.classList.add('hidden');
                console.log('Прогресс-бар скрыт');
            }, 500);
        }
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
    const birthDateFilter = `FILTER(?birthDate >= "${settings.birthYearFilter}-01-01"^^xsd:dateTime).`;
    const countryFilter = settings.selectedCountries === 'all' ? '' :
                         `FILTER(?country IN (${settings.selectedCountries
                             .map(code => `wd:${settings.countryMap[code]}`)
                             .filter(id => id)
                             .join(', ')})).`;

    while (attempts < maxAttempts) {
        const offset = settings.dynamicOffset ? Math.floor(Math.random() * settings.maxOffset) : 0;
        query = `
            SELECT ?person ?personLabel ?image ?country ?gender ?deathDate ?birthDate
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

function updateUI({ personLabel, gender, deathDate, birthDate, person }) {
    currentPerson = { personLabel, gender, deathDate, birthDate, person };
    const personInfo = document.getElementById('person-info');
    const personDetails = document.getElementById('person-details');
    const wikiLink = document.getElementById('wiki-link');
    
    requestAnimationFrame(() => {
        personInfo.style.display = 'none';
        personInfo.classList.remove('correct');
        personDetails.textContent = `${personLabel.value}, ${gender.value.split('/').pop() === 'Q6581097' ? translations[selectedLanguage].male : translations[selectedLanguage].female}, ${deathDate ? translations[selectedLanguage].deceased : translations[selectedLanguage].alive}, Народження: ${birthDate ? new Date(birthDate.value).toLocaleDateString('uk-UA') : translations[selectedLanguage].unknown}${deathDate ? `, Смерть: ${new Date(deathDate.value).toLocaleDateString('uk-UA')}` : ''}`;
        wikiLink.href = person.value;
        document.getElementById('next-person').style.display = 'none';
        document.getElementById('person-name').textContent = '';
        loadedPhotos++;
        logPhotoStatus();
    });
}

function handleError() {
    const personImage = document.getElementById('person-image');
    const personName = document.getElementById('person-name');

    requestAnimationFrame(() => {
        personImage.src = 'https://via.placeholder.com/300';
        personName.textContent = translations[selectedLanguage].testPerson;
        logPhotoStatus();
    });
}

async function loadPersonFromData(person, category = null) {
    const personImage = document.getElementById('person-image');
    const personName = document.getElementById('person-name');

    requestAnimationFrame(() => {
        personImage.src = '';
        personName.textContent = '';
        personImage.classList.remove('loaded');
    });

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
                updateUI({ ...person, person });
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
                handleError();
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
            const { person, category } = sessionList.shift();
            await loadPersonFromData(person, category);
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

    const { person, category } = sessionList.shift();
    if (person) {
        await loadPersonFromData(person, category);
    } else {
        handleError();
    }
}

// Обработчик кнопки "Найти новое фото"
document.getElementById('next-photo').addEventListener('click', () => {
    console.log('Нажата кнопка "Найти новое фото"');
    userGuess = null;
    loadNextPerson();
});

// Обработчики кнопок "Жив" и "Мертв"
document.getElementById('alive-btn').addEventListener('click', () => {
    userGuess = 'alive';
    console.log('Пользователь выбрал: Жив');
});

document.getElementById('dead-btn').addEventListener('click', () => {
    userGuess = 'dead';
    console.log('Пользователь выбрал: Мертв');
});

// Обработчик кнопки "Проверить"
document.getElementById('check-btn').addEventListener('click', () => {
    if (!currentPerson || !userGuess) return;
    
    const isCorrect = (userGuess === 'alive' && !currentPerson.deathDate) || 
                     (userGuess === 'dead' && currentPerson.deathDate);
    
    const personInfo = document.getElementById('person-info');
    requestAnimationFrame(() => {
        personInfo.style.display = 'block';
        if (isCorrect) {
            personInfo.classList.add('correct');
        }
        document.getElementById('next-person').style.display = 'block';
        document.getElementById('person-name').textContent = currentPerson.personLabel.value;
    });
    console.log(`Проверка: ${isCorrect ? 'Верно' : 'Неверно'}`);
});

// Обработчик кнопки "Следующее фото"
document.getElementById('next-person').addEventListener('click', () => {
    console.log('Нажата кнопка "Следующее фото"');
    userGuess = null;
    loadNextPerson();
});

window.onload = () => {
    updateLanguage();
    loadSession();
};
