// Telegram Web App initialization
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
document.getElementById('player-name').textContent = `Welcome, ${tg.initDataUnsafe.user ? tg.initDataUnsafe.user.first_name : 'Player'}!`;

// Game state
let currentPerson = null;
let answers = {};
let correctAnswers = 0;
let gamesPlayed = 0;
let totalCorrect = 0;
let isHardMode = false;
let apiRequestCount = 0; // Счётчик запросов к API
const maxApiRequests = 50; // Лимит запросов за игру

// DOM elements
const gameDiv = document.getElementById('game');
const questionsDiv = document.getElementById('questions');
const resultDiv = document.getElementById('result');
const personImage = document.getElementById('person-image');
const curtain = document.getElementById('curtain');
const personInfo = document.getElementById('person-info');
const correctAnswersText = document.getElementById('correct-answers');
const gamesPlayedText = document.getElementById('games-played');
const correctTotalText = document.getElementById('correct-total');
const easyModeBtn = document.getElementById('easy-mode');
const hardModeBtn = document.getElementById('hard-mode');
const exitBtn = document.getElementById('exit-btn');

// Mock data for fallback
const popularPeople = [
    {
        name: "Albert Einstein",
        gender: "Male",
        alive: false,
        age: 76,
        hasChildren: true,
        cocoon: "Oval",
        image: "https://upload.wikimedia.org/wikipedia/commons/7/78/Albert_Einstein_1921_by_F_Schmutzer_-_restoration.jpg",
        wiki: "https://en.wikipedia.org/wiki/Albert_Einstein"
    },
    {
        name: "Beyoncé",
        gender: "Female",
        alive: true,
        age: 44,
        hasChildren: true,
        cocoon: "Rectangular",
        image: "https://upload.wikimedia.org/wikipedia/commons/1/17/Beyonc%C3%A9_at_The_Lion_King_European_Premiere_2019.png",
        wiki: "https://en.wikipedia.org/wiki/Beyonc%C3%A9"
    }
];

const lesserKnownPeople = [
    {
        name: "Vitthal Umap",
        gender: "Male",
        alive: false,
        age: 80,
        hasChildren: true,
        cocoon: "Rectangular",
        image: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Vitthal_Umap.jpg",
        wiki: "https://en.wikipedia.org/wiki/Vitthal_Umap"
    }
];

// Fetch random person with Wikipedia API
async function fetchRandomPerson(hardMode) {
    console.log(`[fetchRandomPerson] Starting for ${hardMode ? 'hard' : 'easy'} mode`);
    let attempts = 0;
    const maxAttempts = 15; // Увеличено для надёжности

    while (attempts < maxAttempts) {
        if (apiRequestCount >= maxApiRequests) {
            console.warn('[fetchRandomPerson] API request limit reached, returning default person');
            return popularPeople[0];
        }

        console.log(`[fetchRandomPerson] Attempt ${attempts + 1}/${maxAttempts}, API requests: ${apiRequestCount}`);
        try {
            // Получаем случайную статью
            console.log('[fetchRandomPerson] Sending Wikipedia random query');
            apiRequestCount++;
            const response = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=1&format=json&origin=*`, {
                headers: { 'User-Agent': 'PersonSeeI/1.0 (contact@example.com)' }
            });
            const data = await response.json();
            console.log('[fetchRandomPerson] Wikipedia random response:', data);

            const title = data.query.random[0].title;
            console.log(`[fetchRandomPerson] Selected title: ${title}`);

            // Проверяем, что это человек
            console.log('[fetchRandomPerson] Sending categories query');
            apiRequestCount++;
            const catResponse = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=categories&titles=${encodeURIComponent(title)}&cllimit=10&format=json&origin=*`, {
                headers: { 'User-Agent': 'PersonSeeI/1.0 (contact@example.com)' }
            });
            const catData = await catResponse.json();
            console.log('[fetchRandomPerson] Categories response:', catData);

            const pageId = Object.keys(catData.query.pages)[0];
            const categories = catData.query.pages[pageId].categories || [];
            const isPerson = categories.some(cat => cat.title.includes('Living people') || cat.title.includes('people') || cat.title.includes('births') || cat.title.includes('deaths'));

            if (!isPerson) {
                console.log(`[fetchRandomPerson] Not a person (categories: ${categories.map(c => c.title).join(', ')}), retrying`);
                attempts++;
                continue;
            }

            // Проверяем популярность
            console.log('[fetchRandomPerson] Sending page views query');
            apiRequestCount++;
            const pageViewResponse = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageviews&titles=${encodeURIComponent(title)}&pvip=30&format=json&origin=*`, {
                headers: { 'User-Agent': 'PersonSeeI/1.0 (contact@example.com)' }
            });
            const pvData = await pageViewResponse.json();
            console.log('[fetchRandomPerson] Page views response:', pvData);

            const pageViews = pvData.query.pages[pageId].pageviews || {};
            const totalViews = Object.values(pageViews).reduce((sum, val) => sum + (val || 0), 0);
            const isPopular = categories.some(cat => cat.title.includes('Nobel laureates') || cat.title.includes('Heads of state') || cat.title.includes('Grammy Award winners')) || totalViews > 1000;

            console.log(`[fetchRandomPerson] Categories: ${categories.map(c => c.title).join(', ')}, Total views: ${totalViews}, Is popular: ${isPopular}`);

            if (hardMode && !isPopular) {
                console.log('[fetchRandomPerson] Not popular enough for hard mode, retrying');
                attempts++;
                continue;
            }
            if (!hardMode && isPopular) {
                console.log('[fetchRandomPerson] Too popular for easy mode, retrying');
                attempts++;
                continue;
            }

            // Получаем данные, инфобокс и изображение
            console.log('[fetchRandomPerson] Fetching person data, infobox, and image');
            apiRequestCount++;
            const infoResponse = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages|revisions&titles=${encodeURIComponent(title)}&exintro&explaintext&piprop=thumbnail&pithumbsize=200&rvprop=content&rvsection=0&format=json&origin=*`, {
                headers: { 'User-Agent': 'PersonSeeI/1.0 (contact@example.com)' }
            });
            const infoData = await infoResponse.json();
            console.log('[fetchRandomPerson] Person data response:', infoData);

            const page = infoData.query.pages[pageId];
            const image = page.thumbnail ? page.thumbnail.source : null;

            if (!image) {
                console.log('[fetchRandomPerson] No image found, retrying');
                attempts++;
                continue;
            }

            // Фильтруем неподходящие изображения
            const imageName = image.toLowerCase();
            if (imageName.includes('logo') || imageName.includes('team') || imageName.includes('yacht') || imageName.includes('symbol') || (!imageName.includes('jpg') && !imageName.includes('jpeg') && !imageName.includes('png'))) {
                console.log(`[fetchRandomPerson] Image rejected (non-portrait): ${image}`);
                attempts++;
                continue;
            }

            // Проверяем размеры изображения
            console.log('[fetchRandomPerson] Checking image dimensions');
            const img = new Image();
            img.src = image;
            await new Promise(resolve => {
                img.onload = () => {
                    console.log(`[fetchRandomPerson] Image dimensions: ${img.width}x${img.height}`);
                    resolve();
                };
                img.onerror = () => {
                    console.log('[fetchRandomPerson] Image failed to load, retrying');
                    attempts++;
                    resolve();
                };
            });
            if (img.width < 100 || img.height < 100) {
                console.log(`[fetchRandomPerson] Image too small (${img.width}x${img.height}), retrying`);
                attempts++;
                continue;
            }

            // Парсим инфобокс для пола
            console.log('[fetchRandomPerson] Parsing infobox for gender');
            const infoboxContent = page.revisions ? page.revisions[0]['*'] : '';
            console.log('[fetchRandomPerson] Infobox content:', infoboxContent.substring(0, 200));
            let gender = 'Male'; // По умолчанию
            if (infoboxContent.includes('|gender=female') || infoboxContent.includes('|sex=female')) {
                gender = 'Female';
            } else if (infoboxContent.includes('|gender=male') || infoboxContent.includes('|sex=male')) {
                gender = 'Male';
            }

            // Парсим данные
            console.log('[fetchRandomPerson] Parsing person data');
            const extract = page.extract || '';
            console.log('[fetchRandomPerson] Extract:', extract.substring(0, 200));
            const alive = categories.some(cat => cat.title.includes('Living people'));
            const ageMatch = extract.match(/born.*?(\d{4})/);
            const age = ageMatch ? (alive ? new Date().getFullYear() - parseInt(ageMatch[1]) : 80) : 50;
            const hasChildren = Math.random() > 0.5; // Placeholder
            const cocoon = ['Oval', 'Rectangular', 'Other'][Math.floor(Math.random() * 3)];

            console.log(`[fetchRandomPerson] Success: Name: ${title}, Gender: ${gender}, Alive: ${alive}, Age: ${age}, Image: ${image}`);

            return {
                name: title,
                gender,
                alive,
                age,
                hasChildren,
                cocoon,
                image,
                wiki: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
            };
        } catch (error) {
            console.error(`[fetchRandomPerson] Error in attempt ${attempts + 1}:`, error.message, error.stack);
            attempts++;
        }
        console.log('[fetchRandomPerson] Waiting 200ms before next attempt');
        await new Promise(resolve => setTimeout(resolve, 200)); // Увеличена пауза
    }

    console.warn('[fetchRandomPerson] Max attempts reached, returning default person');
    return popularPeople[0]; // Гарантированно с изображением
}

// Start game
async function startGame(hardMode) {
    console.log(`[startGame] Starting ${hardMode ? 'hard' : 'easy'} mode`);
    isHardMode = hardMode;
    gameDiv.style.display = 'block';
    easyModeBtn.style.display = 'none';
    hardModeBtn.style.display = 'none';
    resultDiv.style.display = 'none';
    questionsDiv.innerHTML = '';
    questionsDiv.style.display = 'block';
    answers = {};
    correctAnswers = 0;

    // Очистка изображения
    personImage.src = '';
    personImage.style.display = 'none';

    await loadNewPerson();

    console.log('[startGame] Questions rendered:', questionsDiv.innerHTML);
    gamesPlayed++;
    gamesPlayedText.textContent = gamesPlayed;
    gtag('event', 'game_start', { mode: isHardMode ? 'hard' : 'easy', person_type: isHardMode ? 'popular' : 'lesser_known' });
    console.log('[startGame] Game started, questions rendered');
}

// Load new person
async function loadNewPerson() {
    console.log('[loadNewPerson] Loading new person');
    try {
        currentPerson = await fetchRandomPerson(isHardMode);
        console.log('[loadNewPerson] Current person:', currentPerson);
    } catch (error) {
        console.error('[loadNewPerson] Failed to fetch person:', error.message, error.stack);
        currentPerson = popularPeople[0]; // Fallback
    }

    personImage.src = currentPerson.image || popularPeople[0].image; // Запасное изображение
    personImage.style.display = isHardMode ? 'none' : 'block';
    curtain.style.display = isHardMode ? 'block' : 'none';

    questionsDiv.innerHTML = ''; // Очистка вопросов
    const questions = isHardMode
        ? [
            { id: 'gender', text: 'Gender?', options: ['Male', 'Female'] },
            { id: 'alive', text: 'Alive or Dead?', options: ['Alive', 'Dead'] },
            { id: 'age', text: 'Age?', type: 'number' }
        ]
        : [
            { id: 'alive', text: 'Alive or Dead?', options: ['Alive', 'Dead'] },
            { id: 'hasChildren', text: 'Has Children?', options: ['Yes', 'No'] },
            { id: 'cocoon', text: 'Cocoon Shape?', options: ['Oval', 'Rectangular', 'Other'] }
        ];

    questions.forEach(q => {
        const div = document.createElement('div');
        div.className = 'question';
        div.innerHTML = `<label>${q.text}</label>`;
        if (q.options) {
            const select = document.createElement('select');
            select.id = q.id;
            q.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                select.appendChild(option);
            });
            div.appendChild(select);
        } else {
            const input = document.createElement('input');
            input.id = q.id;
            input.type = 'number';
            div.appendChild(input);
        }
        questionsDiv.appendChild(div);
    });

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit Answers';
    submitBtn.onclick = checkAnswers;
    questionsDiv.appendChild(submitBtn);

    const nextPersonBtn = document.createElement('button');
    nextPersonBtn.id = 'next-person-btn';
    nextPersonBtn.textContent = 'Next Person';
    nextPersonBtn.onclick = loadNewPerson;
    questionsDiv.appendChild(nextPersonBtn);
}

// Check answers
function checkAnswers() {
    console.log('[checkAnswers] Checking answers');
    correctAnswers = 0;
    questionsDiv.querySelectorAll('.question').forEach(q => {
        const id = q.querySelector('select, input').id;
        const value = q.querySelector('select, input').value;
        answers[id] = value;

        let isCorrect = false;
        if (id === 'gender') isCorrect = value === currentPerson.gender;
        if (id === 'alive') isCorrect = value === (currentPerson.alive ? 'Alive' : 'Dead');
        if (id === 'hasChildren') isCorrect = value === (currentPerson.hasChildren ? 'Yes' : 'No');
        if (id === 'cocoon') isCorrect = value === currentPerson.cocoon;
        if (id === 'age') isCorrect = Math.abs(parseInt(value) - currentPerson.age) <= 5;

        if (isCorrect) correctAnswers++;
    });

    totalCorrect += correctAnswers;
    correctTotalText.textContent = totalCorrect;
    console.log(`[checkAnswers] Correct answers: ${correctAnswers}/${Object.keys(answers).length}`);

    showResult();
    gtag('event', 'game_end', {
        mode: isHardMode ? 'hard' : 'easy',
        correct_answers: correctAnswers,
        total_questions: Object.keys(answers).length,
        person_type: isHardMode ? 'popular' : 'lesser_known'
    });
}

// Show result
function showResult() {
    console.log('[showResult] Showing results');
    questionsDiv.style.display = 'none';
    resultDiv.style.display = 'block';
    personImage.style.display = 'block';
    curtain.style.display = 'none';

    personInfo.innerHTML = `${currentPerson.name} <a href="${currentPerson.wiki}" target="_blank">Wikipedia</a>`;
    correctAnswersText.textContent = `Correct Answers: ${correctAnswers} out of ${Object.keys(answers).length}`;

    const restartBtn = document.createElement('button');
    restartBtn.textContent = 'Play Again';
    restartBtn.onclick = () => startGame(isHardMode);
    resultDiv.appendChild(restartBtn);
    console.log('[showResult] Results displayed, restart button added');
}

// Exit game
function exitGame() {
    console.log('[exitGame] Attempting to exit');
    try {
        tg.close();
        console.log('[exitGame] tg.close() called');
    } catch (error) {
        console.error('[exitGame] tg.close() failed:', error.message);
        // Запасной вариант: возврат на главный экран
        gameDiv.style.display = 'none';
        resultDiv.style.display = 'none';
        questionsDiv.style.display = 'none';
        easyModeBtn.style.display = 'block';
        hardModeBtn.style.display = 'block';
        console.log('[exitGame] Returned to main screen');
    }
    gtag('event', 'exit_game');
}

// Event listeners
easyModeBtn.addEventListener('click', () => startGame(false));
hardModeBtn.addEventListener('click', () => startGame(true));
exitBtn.addEventListener('click', exitGame);
