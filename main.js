import { Game } from './src/game/game_main.js';

const game = new Game(document.getElementById('game-canvas'), {
    overlay: document.getElementById('overlay'),
    title: document.getElementById('overlay-title'),
    description: document.getElementById('overlay-description'),
    button: document.getElementById('enter-button'),
    crosshair: document.getElementById('crosshair'),
    status: document.getElementById('status'),
    ammo: document.getElementById('ammo'),
    ammoWeapon: document.getElementById('ammo-weapon'),
    ammoCount: document.getElementById('ammo-count'),
    ammoCapacity: document.getElementById('ammo-capacity'),
    ammoProgress: document.getElementById('ammo-progress'),
    ammoHint: document.getElementById('ammo-hint'),
});

game.init().catch(error => game.fail(error));
