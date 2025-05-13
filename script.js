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
const imageError = document.getElementById('image-error');

if (!imageError) {
    console.warn('Element #image-error not found in index.html. Errors will display in #progress.');
}

let correctAnswers = 0;
let totalQuestions = 0;
let currentPerson = null;
let difficulty = 'easier';
let isLoading = false;
let retryCount = 0;
const maxRetries = 3;

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
        imageError: 'Зображення недоступне',
        loading: 'Завантаження...',
        timeout: 'Час очікування вичерпано',
        sparqlError: 'Помилка запиту до бази даних',
        mockData: 'Не вдалося завантажити дані, використовується тестовий персонаж'
    },
    ru: {
        alive: 'Жив',
        dead: 'Мертв',
        male: 'Мужчина',
        female: 'Женщина',
        check: 'Проверить',
        correct: 'Правильно!',
        incorrect: 'Неправильно!',
        imageError: 'Изображение недоступно',
        loading: 'Загрузка...',
        timeout: 'Время ожидания истекло',
        sparqlError: 'Ошибка запроса к базе данных',
        mockData: 'Не удалось загрузить данные, используется тестовый персонаж'
    },
    en: {
        alive: 'Alive',
        dead: 'Dead',
        male: 'Male',
        female: 'Female',
        check: 'Check',
        correct: 'Correct!',
        incorrect: 'Incorrect!',
        imageError: 'Image unavailable',
        loading: 'Loading...',
        timeout: 'Request timed out',
        sparqlError: 'Database query error',
        mockData: 'Failed to load data, using test character'
    },
    alien: {
        alive: '👽 Живий',
        dead: '💀 Мертвий',
        male: '👨 Чоловік',
        female: '👩 Жінка',
        check: '🛸 Перевірити',
        correct: '🌟 Правильно!',
        incorrect: '🪐 Неправильно!',
        imageError: '🖼️ Зображення недоступне',
        loading: '🛸 Завантаження...',
        timeout: '⏰ Час вичерпано',
        sparqlError: '🪐 Помилка запиту до бази',
        mockData: '🪐 Не вдалося завантажити дані, використовується тестовий персонаж'
    }
};

// Update UI based on language
function updateLanguage() {
    const lang = languageSelect.value;
    console.log(`Language changed to: ${lang}`);
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
    if (imageError) imageError.textContent = translations[lang].imageError;
}

// Update UI based on difficulty
function updateDifficulty() {
    difficulty = difficultySelect.value;
    console.log(`Difficulty changed to: ${difficulty}`);
    document.querySelectorAll('.correct').forEach(el => el.classList.remove('correct'));
    document.querySelectorAll('input[name="alive"]').forEach(input => input.checked = false);
    document.getElementById('alive-question').style.display = difficulty === 'easy' ? 'block' : 'none';
    document.getElementById('gender-question').style.display = difficulty === 'easy' ? 'block' : 'none';
    document.getElementById('easier-question').style.display = difficulty === 'easier' ? 'block' : 'none';
    personImage.style.display = difficulty === 'easier' ? 'block' : 'none';
    if (imageError) imageError.style.display = 'none';
    result.style.display = 'none';
    loadNewPerson();
}

// Sync theme with Telegram
function syncTheme() {
    const isDark = tg.colorScheme === 'dark';
    const theme = isDark ? 'night' : 'day';
    console.log(`Syncing theme with Telegram: ${theme} (colorScheme: ${tg.colorScheme})`);
    document.body.className = theme;
    document.querySelector('h1').setAttribute('data-theme', theme);
    themeSelect.value = theme;
    tg.setHeaderColor(isDark ? '#1c2526' : '#f5f5f5');
    tg.setBottomBarColor(isDark ? '#1c2526' : '#ffffff');
    const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-color').trim();
    console.log(`Theme applied: ${theme}, body class: ${document.body.className}, --bg-color: ${bgColor}, h1 animation: themeChange`);
}

// Theme switch
themeSelect.addEventListener('change', () => {
    const lang = languageSelect.value;
    const theme = themeSelect.value;
    console.log(`Theme selected: ${theme}`);
    document.body.className = theme;
    document.querySelector('h1').setAttribute('data-theme', theme);
    tg.setHeaderColor(theme === 'night' ? '#1c2526' : '#f5f5f5');
    tg.setBottomBarColor(theme === 'night' ? '#1c2526' : '#ffffff');
    const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-color').trim();
    console.log(`Theme applied: ${theme}, body class: ${document.body.className}, --bg-color: ${bgColor}, h1 animation: themeChange`);
    if (imageError) imageError.textContent = translations[lang].imageError;
});

// Language switch
languageSelect.addEventListener('change', updateLanguage);

// Difficulty switch
difficultySelect.addEventListener('change', updateDifficulty);

// Telegram theme change
tg.onEvent('themeChanged', () => {
    console.log('Telegram theme changed');
    syncTheme();
});

// Check cache
function getCachedPerson() {
    const cached = localStorage.getItem('cachedPerson');
    if (cached) {
        console.log('Using cached person');
        return JSON.parse(cached);
    }
    console.log('No cached person found');
    return null;
}

function setCachedPerson(person) {
    console.log('Caching person:', person.name);
    localStorage.setItem('cachedPerson', JSON.stringify(person));
}

// Mock data for testing
const mockPerson = {
    name: 'Test Person',
    alive: 'alive',
    gender: 'male',
    image: 'https://via.placeholder.com/300',
    wiki: 'https://en.wikipedia.org/wiki/Test'
};

// Convert Wikimedia Commons URL to direct image URL
function convertCommonsUrl(url) {
    if (url.includes('commons.wikimedia.org/wiki/Special:FilePath')) {
        try {
            const fileName = decodeURIComponent(url.split('/').pop());
            const encodedFileName = encodeURIComponent(fileName);
            const firstChar = fileName[0].toLowerCase();
            const secondChar = fileName[1] ? fileName[1].toLowerCase() : firstChar;
            const directUrl = `https://upload.wikimedia.org/wikipedia/commons/${firstChar}/${firstChar}${secondChar}/${encodedFileName}`;
            console.log(`Converted Commons URL: ${url} -> ${directUrl}`);
            return directUrl;
        } catch (e) {
            console.error(`Error converting Commons URL: ${url}, error: ${e.message}`);
            return url;
        }
    }
    return url;
}

// Wikidata API to fetch random person
async function loadNewPerson(useMock = false) {
    const lang = languageSelect.value;
    if (isLoading) {
        console.log('loadNewPerson skipped: already loading');
        return;
    }
    isLoading = true;
    retryCount++;
    progress.textContent = translations[lang].loading;
    progress.classList.add('loading');
    progress.classList.remove('error', 'mock');
    if (imageError) imageError.style.display = 'none';
    result.style.display = 'none';
    personImage.style.display = difficulty === 'easier' ? 'block' : 'none';
    personImage.src = '';
    console.log(`Loading new person from Wikidata (attempt ${retryCount}/${maxRetries}, mock: ${useMock})...`);

    // Timeout for entire load process
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            console.error('loadNewPerson timed out');
            resolve({ error: 'Timeout' });
        }, 15000); // 15 seconds
    });

    // Try cache first
    if (retryCount === 1 && !useMock) {
        const cachedPerson = getCachedPerson();
        if (cachedPerson) {
            currentPerson = cachedPerson;
            progress.textContent = '100%';
            progress.classList.remove('loading');
            personImage.src = currentPerson.image;
            console.log('Person loaded from cache:', currentPerson);
            gtag('event', 'load_person', {
                source: 'cache',
                success: true,
                person: currentPerson.name,
                retries: retryCount
            });
            retryCount = 0;
            isLoading = false;
            return;
        }
    }

    // Use mock data if max retries reached or useMock is true
    if (useMock || retryCount > maxRetries) {
        console.warn('Max retries reached or mock requested, using mock data');
        currentPerson = mockPerson;
        progress.textContent = translations[lang].mockData;
        progress.classList.add('mock');
        progress.classList.remove('loading', 'error');
        if (imageError) imageError.style.display = 'none';
        personImage.src = currentPerson.image;
        console.log('Person loaded from mock:', currentPerson);
        gtag('event', 'load_person', {
            source: 'mock',
            success: true,
            person: currentPerson.name,
            retries: retryCount
        });
        retryCount = 0;
        isLoading = false;
        return;
    }

    const loadPromise = (async () => {
        try {
            console.log('Starting Wikidata request...');
            progress.textContent = translations[lang].loading + ' 20%';
            let query = `
                SELECT ?person ?personLabel ?genderLabel ?birth ?death ?image
                WHERE {
                    ?person wdt:P31 wd:Q5;
                            wdt:P21 ?gender;
                            wdt:P569 ?birth;
                            wdt:P18 ?image.
                    OPTIONAL { ?person wdt:P570 ?death. }
                    ?person rdfs:label ?personLabel.
                    ?gender rdfs:label ?genderLabel.
                    FILTER (LANG(?personLabel) = "en").
                    FILTER (LANG(?genderLabel) = "en").
                    FILTER (REGEX(STR(?image), "\\.jpg$|\\.png$", "i")).
                }
                ORDER BY RAND()
                LIMIT 1
            `;
            console.log('SPARQL query:', query);
            const endpoint = 'https://query.wikidata.org/sparql';
            const encodedQuery = encodeURIComponent(query);
            const url = `${endpoint}?query=${encodedQuery}&format=json`;
            console.log('Request URL:', url);
            console.log('Decoded URL:', decodeURIComponent(url));
            let response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/sparql-results+json',
                    'User-Agent': 'GuessWhoMiniApp/1.0 (https://romanmod.github.io/personseei/; krv.mod@gmail.com)'
                }
            });
            console.log(`Wikidata response status: ${response.status}, headers:`, Object.fromEntries(response.headers));
            let responseText = await response.text();
            console.log(`Response body: ${responseText || 'Empty response'}`);
            if (response.status === 429) {
                throw new Error('Too Many Requests');
            }
            if (!response.ok) {
                // Try fallback query without REGEX if SPARQL error
                if (responseText.includes('MalformedQueryException')) {
                    console.warn('Malformed SPARQL query detected, trying fallback query...');
                    query = `
                        SELECT ?person ?personLabel ?genderLabel ?birth ?death ?image
                        WHERE {
                            ?person wdt:P31 wd:Q5;
                                    wdt:P21 ?gender;
                                    wdt:P569 ?birth;
                                    wdt:P18 ?image.
                            OPTIONAL { ?person wdt:P570 ?death. }
                            ?person rdfs:label ?personLabel.
                            ?gender rdfs:label ?genderLabel.
                            FILTER (LANG(?personLabel) = "en").
                            FILTER (LANG(?genderLabel) = "en").
                        }
                        ORDER BY RAND()
                        LIMIT 1
                    `;
                    console.log('Fallback SPARQL query:', query);
                    const fallbackEncodedQuery = encodeURIComponent(query);
                    const fallbackUrl = `${endpoint}?query=${fallbackEncodedQuery}&format=json`;
                    console.log('Fallback Request URL:', fallbackUrl);
                    response = await fetch(fallbackUrl, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/sparql-results+json',
                            'User-Agent': 'GuessWhoMiniApp/1.0 (https://romanmod.github.io/personseei/; krv.mod@gmail.com)'
                        }
                    });
                    responseText = await response.text();
                    console.log(`Fallback response status: ${response.status}, headers:`, Object.fromEntries(response.headers));
                    console.log(`Fallback response body: ${responseText || 'Empty response'}`);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${responseText}`);
                    }
                } else {
                    throw new Error(`HTTP ${response.status}: ${responseText}`);
                }
            }
            const data = JSON.parse(responseText);
            progress.textContent = translations[lang].loading + ' 60%';
            console.log('Wikidata data received:', data);

            const person = data.results.bindings[0];
            if (!person) {
                throw new Error('No person found');
            }

            const rawImageUrl = person.image.value;
            const imageUrl = convertCommonsUrl(rawImageUrl);
            currentPerson = {
                name: person.personLabel.value,
                alive: person.death ? 'dead' : 'alive',
                gender: person.genderLabel.value.toLowerCase().includes('male') ? 'male' : 'female',
                image: imageUrl,
                wiki: person.person.value.replace('http://www.wikidata.org/entity/', 'https://en.wikipedia.org/wiki/')
            };
            console.log('Person data parsed:', currentPerson);

            progress.textContent = translations[lang].loading + ' 80%';
            console.log(`Validating image: ${currentPerson.image}`);
            const isImageValid = await isValidImage(currentPerson.image);
            if (!isImageValid) {
                console.warn('Invalid image, retrying...');
                throw new Error('Invalid image');
            }

            progress.textContent = '100%';
            progress.classList.remove('loading');
            personImage.src = currentPerson.image;
            console.log('Person successfully loaded:', currentPerson);
            console.log('Photo displayed at:', currentPerson.image);
            setCachedPerson(currentPerson);
            retryCount = 0;

            gtag('event', 'load_person', {
                source: 'wikidata',
                success: true,
                person: currentPerson.name,
                retries: retryCount
            });
            return { success: true };
        } catch (error) {
            console.error('Error loading person from Wikidata:', error.message);
            const errorMessage = error.message.includes('Malformed SPARQL query') ? translations[lang].sparqlError : `${translations[lang].timeout}: ${error.message}`;
            progress.textContent = errorMessage;
            progress.classList.add('error');
            progress.classList.remove('loading', 'mock');
            if (imageError) {
                imageError.textContent = errorMessage;
                imageError.style.display = 'block';
            }
            gtag('event', 'load_person_failed', {
                source: 'wikidata',
                reason: error.message,
                retries: retryCount
            });
            return { error: error.message };
        }
    })();

    // Handle timeout or error
    const result = await Promise.race([loadPromise, timeoutPromise]);
    isLoading = false;
    console.log('loadNewPerson completed, isLoading reset to false');
    if (result.error) {
        if (retryCount <= maxRetries) {
            setTimeout(() => loadNewPerson(), 3000);
        } else {
            loadNewPerson(true); // Force mock data
        }
    }
}

// Validate image with timeout
async function isValidImage(url) {
    const lang = languageSelect.value;
    try {
        console.log(`Checking image: ${url}`);
        const img = new Image();
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
                console.error(`Image validation timeout: ${url}`);
                resolve(false);
            }, 10000); // 10 seconds timeout
        });
        const loadPromise = new Promise((resolve) => {
            img.onload = () => {
                console.log(`Image loaded: ${url}, width: ${img.width}, height: ${img.height}`);
                resolve(img.width >= 100 && img.height >= 100);
            };
            img.onerror = (err) => {
                console.error(`Image load failed: ${url}, error: ${err.type}`);
                resolve(false);
            };
            img.src = url;
        });
        const isValid = await Promise.race([loadPromise, timeoutPromise]);
        console.log(`Image validation result: ${isValid}`);
        if (!isValid && url !== 'https://via.placeholder.com/300') {
            console.log('Using fallback image');
            return isValidImage('https://via.placeholder.com/300');
        }
        return isValid;
    } catch (error) {
        console.error(`Image validation error: ${url}, error: ${error.message}`);
        progress.textContent = translations[lang].imageError;
        progress.classList.add('error');
        return false;
    }
}

// Check answer
checkAnswerBtn.addEventListener('click', () => {
    let isCorrect = true;
    const lang = languageSelect.value;
    console.log('Checking answer...');

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
        console.log(`Gender selected: ${btn.dataset.gender}`);
    });
});

// Status button selection
document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('correct'));
        btn.classList.add('correct');
        console.log(`Status selected: ${btn.dataset.status}`);
    });
});

// Next photo
nextPhotoBtn.addEventListener('click', () => {
    console.log('Next photo requested');
    document.querySelectorAll('.correct').forEach(el => el.classList.remove('correct'));
    document.querySelectorAll('input[name="alive"]').forEach(input => input.checked = false);
    retryCount = 0;
    loadNewPerson();
});

// Initialize
console.log('Initializing app...');
syncTheme();
updateLanguage();
updateDifficulty();
