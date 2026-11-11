import { Game } from './src/game/game_main.js';

const game = new Game(document.getElementById('game-canvas'), {
    overlay: document.getElementById('overlay'),
    title: document.getElementById('overlay-title'),
    description: document.getElementById('overlay-description'),
    button: document.getElementById('enter-button'),
    crosshair: document.getElementById('crosshair'),
    status: document.getElementById('status'),
});

game.init().catch(error => game.fail(error));
