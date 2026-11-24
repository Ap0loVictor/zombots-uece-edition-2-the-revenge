import { Game } from './src/game/game_main.js';

const game = new Game(document.getElementById('game-canvas'), {
    menu: document.getElementById('main-menu'),
    hud: document.getElementById('hud'),
    hints: document.getElementById('hud-hints'),
    overlay: document.getElementById('overlay'),
    title: document.getElementById('overlay-title'),
    description: document.getElementById('overlay-description'),
    crosshair: document.getElementById('crosshair'),
    status: document.getElementById('status'),
});

game.init().catch(error => game.fail(error));
