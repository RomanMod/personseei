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
    document.querySelectorAll('.correct').forEach(el => el.classList.remove('correct'));
    document.querySelectorAll('input[name="alive"]').forEach(input => input.checked = false);
    document.getElementById('alive-question').style.display = difficulty === 'easy' ? 'block' : 'none';
    document.getElementById('gender-question').style.display = difficulty === 'easy' ? 'block' : 'none';
    document.getElementById('easier-question').style.display = difficulty === 'easier' ? 'block' : 'none';
    personImage.style.display = difficulty === 'easier' ? 'block' : 'none';
    result.style.display = 'none';
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
    console.log(`Theme applied: ${theme}, body class: ${document.body.className}`);
}

// Theme switch
themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value;
    console.log(`Theme selected: ${theme}`);
    document.body.className = theme;
    tg.setHeaderColor(theme === 'night' ? '#1c2526' : '#f5f5f5');
    tg.setBottomBarColor(theme === 'night' ? '#1c2526' : '#ffffff');
    console.log(`Theme applied: ${theme}, body class: ${document.body.className}`);
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

// Wikidata API to fetch random person
async function loadNewPerson(useAlternativeQuery = false) {
    if (isLoading) {
        console.log('loadNewPerson skipped: already loading');
        return;
    }
    if (retryCount >= maxRetries) {
        console.error('Max retries reached, stopping load');
        progress.textContent = 'Помилка: не вдалося завантажити. Спробуйте ще раз.';
        gtag('event', 'load_person_failed', {
            source: 'wikidata',
            reason: 'max_retries',
            retries: retryCount
        });
        return;
    }
    isLoading = true;
    retryCount++;
    progress.textContent = '0%';
    result.style.display = 'none';
    personImage.style.display = difficulty === 'easier' ? 'block' : 'none';
    personImage.src = '';
    console.log(`Loading new person from Wikidata (attempt ${retryCount}/${maxRetries}, alternative: ${useAlternativeQuery})...`);

    // Try cache first
    const cachedPerson = getCachedPerson();
    if (cachedPerson && retryCount === 1) {
        currentPerson = cachedPerson;
        progress.textContent = '100%';
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

    try {
        progress.textContent = '20%';
        console.log('Sending SPARQL query to Wikidata...');
        let query;
        if (useAlternativeQuery) {
            query = `
                SELECT ?person ?personLabel ?genderLabel ?birth ?death ?image WHERE {
                    ?person wdt:P31 wd:Q5;
                            wdt:P21 ?gender;
                            wdt:P569 ?birth;
                            wdt:P18 ?image.
                    OPTIONAL { ?person wdt:P570 ?death. }
                    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
                } LIMIT 1
            `;
        } else {
            query = `
                SELECT ?person ?personLabel ?genderLabel ?birth ?death ?image WHERE {
                    ?person wdt:P31 wd:Q5;
                            wdt:P21 ?gender;
                            wdt:P569 ?birth;
                            wdt:P18 ?image.
                    OPTIONAL { ?person wdt:P570 ?death. }
                    FILTER (regex(str(?image), "\\.(jpg|png)$", "i"))
                    SERVICE wikibase:label { bd:serviceParam wikibase:language "uk,en". }
                } LIMIT 1
            `;
        }
        console.log('SPARQL query:', query);
        const response = await fetch('https://query.wikidata.org/sparql?query=' + encodeURIComponent(query) + '&format=json', {
            headers: {
                'Accept': 'application/sparql-results+json',
                'User-Agent': 'GuessWhoMiniApp/1.0 (https://romanmod.github.io/personseei/; krv.mod@gmail.com)'
            }
        });
        console.log(`Wikidata response status: ${response.status}, headers:`, Object.fromEntries(response.headers));
        if (response.status === 429) {
            throw new Error('Too Many Requests');
        }
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error response body: ${errorText}`);
            if (response.status === 400 && !useAlternativeQuery) {
                console.warn('Retrying with alternative query...');
                isLoading = false;
                return loadNewPerson(true);
            }
            throw new Error(`HTTP ${response.status}: ${errorText}`);
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
        console.log(`Validating image: ${currentPerson.image}`);
        if (!(await isValidImage(currentPerson.image))) {
            console.warn('Invalid image, retrying...');
            isLoading = false;
            return loadNewPerson(useAlternativeQuery);
        }

        progress.textContent = '100%';
        personImage.src = currentPerson.image;
        console.log('Person successfully loaded:', currentPerson);
        setCachedPerson(currentPerson);
        retryCount = 0;

        // Логирование в GA4
        gtag('event', 'load_person', {
            source: 'wikidata',
            success: true,
            person: currentPerson.name,
            retries: retryCount
        });
    } catch (error) {
        console.error('Error loading person from Wikidata:', error.message);
        progress.textContent = `Помилка: ${error.message}`;
        gtag('event', 'load_person_failed', {
            source: 'wikidata',
            reason: error.message,
            retries: retryCount
        });
        setTimeout(() => {
            isLoading = false;
            loadNewPerson(useAlternativeQuery);
        }, 5000);
    } finally {
        isLoading = false;
    }
}

// Validate image
async function isValidImage(url) {
    try {
        console.log(`Checking image: ${url}`);
        const response = await fetch(url, { method: 'HEAD' });
        const contentLength = response.headers.get('content-length');
        const contentType = response.headers.get('content-type');
        const isValid = response.ok && 
                        contentLength && 
                        parseInt(contentLength) > 10000 && 
                        contentType.includes('image');
        console.log(`Image validation result: ${isValid} (status: ${response.status}, size: ${contentLength}, type: ${contentType})`);
        
        // Дополнительная проверка разрешения
        if (isValid) {
            const img = new Image();
            const promise = new Promise((resolve) => {
                img.onload = () => resolve(img.width >= 100 && img.height >= 100);
                img.onerror = () => resolve(false);
                img.src = url;
            });
            const isHighRes = await promise;
            console.log(`Image resolution check: ${isHighRes} (width: ${img.width}, height: ${img.height})`);
            return isHighRes;
        }
        return false;
    } catch (error) {
        console.error('Image validation failed:', error);
        // Запасной URL (например, заглушка)
        console.log('Using fallback image');
        return url === 'https://via.placeholder.com/150' ? false : isValidImage('https://via.placeholder.com/150');
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
