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

// Mock Wikipedia API (replace with real API calls)
async function fetchRandomPerson() {
    // Simulated data (use real Wikipedia API in production)
    const people = [
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
            name: "Marie Curie",
            gender: "Female",
            alive: false,
            age: 66,
            hasChildren: true,
            cocoon: "Rectangular",
            image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Marie_Curie_1920.jpg/220px-Marie_Curie_1920.jpg",
            wiki: "https://en.wikipedia.org/wiki/Marie_Curie"
        }
    ];
    return people[Math.floor(Math.random() * people.length)];
}

// Start game
async function startGame(hardMode) {
    isHardMode = hardMode;
    gameDiv.style.display = 'block';
    easyModeBtn.style.display = 'none';
    hardModeBtn.style.display = 'none';
    resultDiv.style.display = 'none';
    questionsDiv.innerHTML = '';
    answers = {};
    correctAnswers = 0;

    currentPerson = await fetchRandomPerson();
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
    gtag('event', 'game_start', { mode: isHardMode ? 'hard' : 'easy' });
}

// Check answers
function checkAnswers() {
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

    showResult();
    gtag('event', 'game_end', {
        mode: isHardMode ? 'hard' : 'easy',
        correct_answers: correctAnswers,
        total_questions: Object.keys(answers).length
    });
}

// Show result
function showResult() {
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
}

// Event listeners
easyModeBtn.addEventListener('click', () => startGame(false));
hardModeBtn.addEventListener('click', () => startGame(true));
exitBtn.addEventListener('click', () => {
    tg.close();
    gtag('event', 'exit_game');
});
