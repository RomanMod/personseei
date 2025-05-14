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
}

// Update UI based on difficulty
function updateDifficulty() {
    difficulty = difficultySelect.value;
    console.log(`Difficulty changed to: ${difficulty}`);
    document.getElementById('alive-question').style.display = difficulty === 'easy' ? 'block' : 'none';
    document.getElementById('gender-question').style.display = difficulty === 'easy' ? 'block' : 'none';
    document.getElementById('easier-question').style.display = difficulty === 'easier' ? 'block' : 'none';
    personImage.style.display = difficulty === 'easier' ? 'block' : 'none';
    result.style.display = 'none';
    retryCount = 0;
    loadNewPerson();
}

// Sync theme with Telegram
function syncTheme() {
    const isDark = tg.colorScheme === 'dark';
    const theme = isDark ? 'night' : 'day';
    console.log(`Syncing theme with Telegram: ${theme} (colorScheme: ${tg.colorScheme})`);
    document.body.className = theme;
    themeSelect.value = theme;
    tg.setHeaderColor(isDark ? '#1c2526' : '#f5f5f5');
    tg.setBottomBarColor(isDark ? '#1c2526' : '#ffffff');
}

// Theme switch
themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value;
    console.log(`Theme selected: ${theme}`);
    document.body.className = theme;
    tg.setHeaderColor(theme === 'night' ? '#1c2526' : '#f5f5f5');
    tg.setBottomBarColor(theme === 'night' ? '#1c2526' : '#ffffff');
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

// Получение прямой ссылки на изображение из Commons
async function getCommonsImageUrl(fileName) {
    try {
        console.log(`Fetching image URL for: ${fileName}`);
        const cleanFileName = fileName.replace(/^File:/i, '');
        const encodedFileName = encodeURIComponent(`File:${cleanFileName}`);
        const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodedFileName}&prop=imageinfo&iiprop=url&format=json&origin=*`;
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'GuessWhoGame/1.0 (https://example.com; contact@example.com)'
            }
        });
        console.log(`Commons API status: ${response.status}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId === '-1' || !pages[pageId].imageinfo) {
            throw new Error('Image not found in Commons');
        }
        const imageUrl = pages[pageId].imageinfo[0].url;
        console.log(`Direct image URL: ${imageUrl}`);
        return imageUrl;
    } catch (e) {
        console.error(`Error fetching Commons image URL: ${e.message}`);
        return null;
    }
}

// Wikidata API to fetch random person
async function loadNewPerson(useFallback = false) {
    if (isLoading) {
        console.log('loadNewPerson skipped: already loading');
        return;
    }
    if (retryCount >= maxRetries) {
        console.error('Max retries reached, stopping load');
        progress.textContent = 'Помилка: не вдалося завантажити дані. Натисніть "Далі" для повтору.';
        progress.classList.add('error');
        progress.classList.remove('loading');
        gtag('event', 'load_person_failed', {
            source: 'wikidata',
            reason: 'max_retries',
            retries: retryCount
        });
        nextPhotoBtn.style.display = 'block';
        isLoading = false;
        return;
    }
    isLoading = true;
    retryCount++;
    progress.textContent = '0%';
    progress.classList.add('loading');
    result.style.display = 'none';
    personImage.style.display = difficulty === 'easier' ? 'block' : 'none';
    personImage.src = '';
    console.log(`Loading new person from Wikidata (attempt ${retryCount}/${maxRetries})...`);

    try {
        progress.textContent = '20%';
        console.log('Sending SPARQL query to Wikidata...');
        let query = `
            SELECT ?person ?personLabel ?genderLabel ?birth ?death ?image WHERE {
                ?person wdt:P31 wd:Q5; # Человек
                        wdt:P21 ?gender; # Пол
                        wdt:P569 ?birth; # Дата рождения
                        wdt:P18 ?image. # Изображение
                OPTIONAL { ?person wdt:P570 ?death. } # Дата смерти (если есть)
                SERVICE wikibase:label { bd:serviceParam wikibase:language "uk,en". }
                ${difficulty === 'easy' ? 'FILTER EXISTS { ?person wdt:P1651 ?youtube. }' : ''}
            } ${useFallback ? '' : 'ORDER BY RAND()'} LIMIT 1
        `;
        if (useFallback) {
            console.log('Using fallback query:', query);
        } else {
            console.log('Using main query:', query);
        }

        const endpoint = 'https://query.wikidata.org/sparql';
        const encodedQuery = encodeURIComponent(query);
        const url = `${endpoint}?query=${encodedQuery}&format=json&nocache=${Date.now()}`;
        console.log('Request URL:', url);

        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
            console.error('Request timed out');
        }, 15000);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/sparql-results+json',
                'User-Agent': 'GuessWhoGame/1.0 (https://example.com; contact@example.com)'
            },
            signal: controller.signal
        });

        clearTimeout(timeout);
        console.log(`Wikidata response status: ${response.status}`);
        if (!response.ok) {
            console.error('Response text:', await response.text());
            if (response.status === 400 && !useFallback) {
                console.warn('Bad request, trying fallback query...');
                isLoading = false;
                return await loadNewPerson(true);
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        progress.textContent = '60%';
        console.log('Wikidata data received:', data);

        const person = data.results.bindings[0];
        if (!person) {
            throw new Error('No person found');
        }

        currentPerson = {
            name: person.personLabel.value,
            alive: person.death ? 'dead' : 'alive',
            gender: person.genderLabel.value.toLowerCase().includes('male') ? 'male' : 'female',
            image: person.image.value,
            wiki: person.person.value.replace('http://www.wikidata.org/entity/', 'https://en.wikipedia.org/wiki/')
        };
        console.log('Person data parsed:', currentPerson);

        progress.textContent = '80%';
        console.log(`Fetching image for: ${currentPerson.image}`);
        const fileName = decodeURIComponent(currentPerson.image.split('/').pop());
        let imageUrl = await getCommonsImageUrl(fileName);
        if (!imageUrl) {
            throw new Error('Invalid image URL');
        }

        // Попытка загрузки изображения
        personImage.src = imageUrl;
        personImage.onerror = () => {
            console.error(`Failed to load image: ${imageUrl}`);
            const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}`;
            console.log(`Trying proxy URL: ${proxyUrl}`);
            personImage.src = proxyUrl;
            personImage.onerror = () => {
                console.error(`Proxy image failed: ${proxyUrl}`);
                progress.textContent = 'Не вдалося завантажити зображення';
                progress.classList.add('error');
                progress.classList.remove('loading');
                personImage.src = 'https://via.placeholder.com/300';
                nextPhotoBtn.style.display = 'block';
                gtag('event', 'load_person_failed', {
                    source: 'wikidata',
                    reason: 'image_load_failed',
                    retries: retryCount
                });
                isLoading = false;
                loadNewPerson();
            };
        };
        personImage.onload = () => {
            progress.textContent = 'Фото завантажено!';
            progress.classList.remove('loading', 'error');
            console.log('Image successfully loaded:', imageUrl);
            retryCount = 0; // Сброс счетчика
            gtag('event', 'load_person', {
                source: 'wikidata',
                success: true,
                person: currentPerson.name,
                retries: retryCount
            });
        };
    } catch (error) {
        console.error('Error loading person from Wikidata:', error);
        let errorMessage = 'Помилка завантаження';
        if (error.message.includes('Timeout')) {
            errorMessage = 'Тайм-аут запиту до Wikidata';
        } else if (error.message.includes('HTTP 400')) {
            errorMessage = 'Некоректний SPARQL-запит';
        } else if (error.message.includes('No person found')) {
            errorMessage = 'Не знайдено даних про людину';
        } else if (error.message.includes('Invalid image')) {
            errorMessage = 'Не вдалося отримати зображение';
        }

        progress.textContent = errorMessage;
        progress.classList.add('error');
        progress.classList.remove('loading');
        personImage.src = 'https://via.placeholder.com/300';
        nextPhotoBtn.style.display = 'block';
        gtag('event', 'load_person_failed', {
            source: 'wikidata',
            reason: error.message,
            retries: retryCount
        });

        if (!useFallback) {
            console.warn('Retrying with fallback query...');
            isLoading = false;
            loadNewPerson(true);
        } else {
            isLoading = false;
        }
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
