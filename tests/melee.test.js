import test from 'node:test';
import assert from 'node:assert/strict';
import { WeaponSystem, WEAPON_DEFINITIONS } from '../src/game/weapons.js';
import { MeleeSystem } from '../src/game/melee.js';
import { MeleeView } from '../src/game/melee_view.js';
import { FPSCamera } from '../src/engine/camera.js';
import { Game } from '../src/game/game_main.js';

const mesh = () => ({ draw() { this.drawn = true; }, dispose() {} });
const input = (...keys) => { const pressed = new Set(keys); return { consumePress: key => pressed.delete(key) }; };
const system = () => new WeaponSystem(WEAPON_DEFINITIONS.map(mesh), mesh());
const camera = new FPSCamera();

test('Q alterna exatamente soco/katana; 1–4 preservam a seleção melee', () => {
    const weapons = system();
    assert.equal(weapons.melee.equipped.name, 'Soco');
    weapons.update(0, input('KeyQ'), camera);
    assert.equal(weapons.melee.equipped.name, 'Katana');
    assert.equal(weapons.showingMelee, true);
    weapons.update(0, input('Digit2'), camera);
    assert.equal(weapons.equipped.name, 'AKM');
    assert.equal(weapons.showingMelee, false);
    assert.equal(weapons.melee.equipped.name, 'Katana');
    weapons.update(0, input('KeyQ'), camera);
    assert.equal(weapons.melee.equipped.name, 'Soco');
});

test('F toca um som por golpe, bloqueia disparo simultâneo e retorna à arma de fogo', () => {
    const weapons = system(), sounds = [];
    weapons.melee.onSwing = weapon => sounds.push(weapon.sound);
    weapons.update(0, input('KeyF', 'MouseLeft'), camera);
    assert.equal(weapons.showingMelee, true);
    assert.equal(weapons.projectiles.length, 0);
    weapons.update(0.1, input('KeyF', 'MouseLeft'), camera);
    assert.deepEqual(sounds, ['soco']);
    weapons.update(0.3, input(), camera);
    assert.equal(weapons.showingMelee, false);
    assert.equal(weapons.projectiles.length, 0);
    weapons.update(0, input('MouseLeft'), camera);
    assert.equal(weapons.projectiles.length, 1);
    weapons.update(0, input('KeyQ', 'KeyF'), camera);
    assert.deepEqual(sounds, ['soco', 'katana']);
});

test('segurar F não repete golpes; AKM só retoma após terminar o melee', () => {
    const weapons = system();
    const controls = input('Digit2', 'KeyF');
    controls.isPressed = () => true;
    weapons.update(0, controls, camera);
    for (let i = 0; i < 20; i++) weapons.update(0.01, controls, camera);
    assert.equal(weapons.projectiles.length, 0);
    weapons.update(0.2, controls, camera);
    assert.equal(weapons.melee.attacking, false);
    assert.equal(weapons.projectiles.length, 1);
});

test('trocar durante um golpe preserva a animação iniciada e a duração em diferentes FPS', () => {
    for (const fps of [30, 60, 144]) {
        const drawn = [];
        const melee = new MeleeSystem({ draw: (...args) => drawn.push(args) });
        melee.swing();
        melee.cycle();
        melee.update(0.1);
        melee.draw({});
        assert.equal(drawn[0][1], 0);
        assert.ok(drawn[0][2] > 0);
        for (let frame = 0; frame < Math.ceil(0.28 * fps); frame++) melee.update(1 / fps);
        assert.equal(melee.attacking, false);
        melee.draw({});
        assert.deepEqual(drawn[1].slice(1), [1, null]);
    }
});

test('passagem FPS desenha somente o melee durante o golpe e libera seus buffers', () => {
    const weapons = system();
    let draws = 0, disposed = false;
    weapons.melee.view = { draw() { draws++; }, dispose() { disposed = true; } };
    weapons.update(0, input('KeyF'), camera);
    weapons.drawWeapon({ clear() {}, uniformMatrix4fv() {} }, { uniforms: {} });
    assert.equal(draws, 1);
    assert.ok(weapons.weapons.every(weapon => !weapon.mesh.drawn));
    weapons.dispose();
    assert.equal(disposed, true);
});

test('pausar cancela o golpe e a retomada não repete o som', () => {
    const weapons = system();
    let sounds = 0;
    weapons.melee.onSwing = () => sounds++;
    weapons.melee.swing();
    const game = new Game({}, { button: {}, overlay: {}, crosshair: {}, status: {}, title: {}, description: {} });
    game.weapons = weapons;
    game.state = 'playing';
    game.setPlaying(false);
    assert.equal(weapons.melee.attacking, false);
    assert.equal(game.state, 'paused');
    game.setPlaying(true);
    weapons.update(1, input(), camera);
    assert.equal(sounds, 1);
    assert.equal(weapons.showingMelee, false);
});

test('malhas low poly e poses de toda a animação têm geometria e matrizes válidas', () => {
    const buffers = [];
    const gl = {
        createBuffer: () => ({}), bindBuffer() {}, bufferData: (_, data) => buffers.push(data), deleteBuffer() {},
    };
    const view = new MeleeView(gl);
    assert.ok(view.blade.vertexCount > 0 && view.blade.vertexCount < 150);
    assert.ok(buffers.every(data => data.every(Number.isFinite)));
    const poses = [];
    for (const mesh of [view.box, view.blade]) mesh.draw = () => {
        assert.ok(mesh.modelMatrix.every(Number.isFinite));
        poses.push([...mesh.modelMatrix]);
    };
    for (const index of [0, 1]) for (const progress of [null, 0, 0.2, 0.32, 0.48, 0.75, 0.99]) {
        view.draw({}, index, progress);
    }
    assert.ok(poses.length > 100);
    view.dispose();
});
