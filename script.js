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
    },
    {
        name: "Miles Quadruplets",
        gender: "Female",
        alive: true,
        age: 89,
        hasChildren: false,
        cocoon: "Oval",
        image: "",
        wiki: "https://en.wikipedia.org/wiki/List_of_multiple_births#Quadruplets_(4)"
    }
];

// Fetch random person with Wikidata and logging
async function fetchRandomPerson(hardMode) {
    console.log(`[fetchRandomPerson] Starting for ${hardMode ? 'hard' : 'easy'} mode`);
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
        console.log(`[fetchRandomPerson] Attempt ${attempts + 1}/${maxAttempts}`);
        try {
            // Simplified Wikidata SPARQL query
            const sparqlQuery = `
                SELECT ?item ?itemLabel ?gender ?birth ?death ?image ?article WHERE {
                    ?item wdt:P31 wd:Q5 . # Instance of human
                    ?item wdt:P18 ?image . # Has image
                    OPTIONAL { ?item wdt:P21 ?gender . }
                    OPTIONAL { ?item wdt:P569 ?birth . }
                    OPTIONAL { ?item wdt:P570 ?death . }
                    ?article schema:about ?item ;
                             schema:isPartOf <https://en.wikipedia.org/> .
                    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
                }
                ORDER BY RAND()
                LIMIT 1
            `;
            console.log('[fetchRandomPerson] Sending Wikidata SPARQL query');
            const wdResponse = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`, {
                headers: { 'User-Agent': 'PersonSeeI/1.0 (contact@example.com)' }
            });
            const wdData = await wdResponse.json();
            console.log('[fetchRandomPerson] Wikidata response:', wdData);

            const person = wdData.results.bindings[0];
            if (!person || !person.image) {
                console.log('[fetchRandomPerson] No person or image found, retrying');
                attempts++;
                continue;
            }

            const title = person.article.value.split('/').pop();
            const image = person.image.value;
            console.log(`[fetchRandomPerson] Selected person: ${person.itemLabel.value}, Title: ${title}, Image: ${image}`);

            // Filter non-portrait images
            const imageName = image.toLowerCase();
            if (imageName.includes('logo') || imageName.includes('team') || imageName.includes('yacht') || imageName.includes('symbol') || (!imageName.includes('jpg') && !imageName.includes('jpeg') && !imageName.includes('png'))) {
                console.log(`[fetchRandomPerson] Image rejected (non-portrait): ${image}`);
                attempts++;
                continue;
            }

            // Check popularity
            console.log('[fetchRandomPerson] Checking popularity via Wikipedia');
            const catResponse = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=categories|pageviews&titles=${encodeURIComponent(title)}&cllimit=10&pvprop=pageviews&pvip=30&format=json&origin=*`, {
                headers: { 'User-Agent': 'PersonSeeI/1.0 (contact@example.com)' }
            });
            const catData = await catResponse.json();
            console.log('[fetchRandomPerson] Wikipedia response:', catData);

            const pageId = Object.keys(catData.query.pages)[0];
            const categories = catData.query.pages[pageId].categories || [];
            const pageViews = catData.query.pages[pageId].pageviews || {};
            const totalViews = Object.values(pageViews).reduce((sum, val) => sum + (val || 0), 0);
            const isPopular = categories.some(cat => cat.title.includes('Living people') || cat.title.includes('Nobel laureates') || cat.title.includes('Heads of state') || cat.title.includes('Grammy Award winners')) || totalViews > 1000;

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

            // Parse data
            console.log('[fetchRandomPerson] Parsing person data');
            const gender = person.gender ? person.gender.value.includes('female') ? 'Female' : 'Male' : 'Male';
            const birthYear = person.birth ? new Date(person.birth.value).getFullYear() : null;
            const deathYear = person.death ? new Date(person.death.value).getFullYear() : null;
            const alive = !deathYear;
            const age = birthYear ? (alive ? new Date().getFullYear() - birthYear : deathYear - birthYear) : 50;
            const hasChildren = Math.random() > 0.5; // Placeholder
            const cocoon = ['Oval', 'Rectangular', 'Other'][Math.floor(Math.random() * 3)];

            console.log(`[fetchRandomPerson] Success: Name: ${person.itemLabel.value}, Gender: ${gender}, Alive: ${alive}, Age: ${age}, Image: ${image}`);

            return {
                name: person.itemLabel.value,
                gender,
                alive,
                age,
                hasChildren,
                cocoon,
                image,
                wiki: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
            };
        } catch (error) {
            console.error('[fetchRandomPerson] Error:', error);
            attempts++;
        }
        console.log('[fetchRandomPerson] Waiting 100ms before next attempt');
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.warn('[fetchRandomPerson] Max attempts reached, returning default person');
    return popularPeople[0];
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
    answers = {};
    correctAnswers = 0;

    currentPerson = await fetchRandomPerson(hardMode);
    console.log('[startGame] Current person:', currentPerson);
    personImage.src = currentPerson.image;
    personImage.style.display = isHardMode ? 'none' : 'block';
    curtain.style.display = isHardMode ? 'block' : 'none';

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

    gamesPlayed++;
    gamesPlayedText.textContent = gamesPlayed;
    gtag('event', 'game_start', { mode: isHardMode ? 'hard' : 'easy', person_type: isHardMode ? 'popular' : 'lesser_known' });
    console.log('[startGame] Game started, questions rendered');
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

// Event listeners
easyModeBtn.addEventListener('click', () => startGame(false));
hardModeBtn.addEventListener('click', () => startGame(true));
exitBtn.addEventListener('click', () => {
    console.log('[exit] Exiting game');
    tg.close();
    gtag('event', 'exit_game');
});
