import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WeaponSystem, WEAPON_DEFINITIONS, transformPoint } from '../src/game/weapons.js';
import { FPSCamera } from '../src/engine/camera.js';
import { OBJLoader } from '../src/engine/obj_loader.js';
import { Game } from '../src/game/game_main.js';
import { Matrix4 } from '../src/engine/matrix.js';

const mesh = () => ({ draw() { this.draws = (this.draws ?? 0) + 1; }, dispose() { this.disposed = true; } });
const input = (...keys) => { const pressed = new Set(keys); return { consumePress: key => pressed.delete(key) }; };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const system = () => new WeaponSystem(WEAPON_DEFINITIONS.map(() => mesh()), mesh());

test('assets reais de arma e projétil carregam com materiais e geometria válidos', async () => {
    for (const name of ['arma', 'armapistola', 'armaescopeta', 'armasniper', 'esfera']) {
        const obj = await readFile(new URL(`../assets/weapons/${name}.obj`, import.meta.url), 'utf8');
        const mtl = await readFile(new URL(`../assets/weapons/${name}.mtl`, import.meta.url), 'utf8');
        const data = OBJLoader.parse(obj, OBJLoader.parseMTL(mtl));
        assert.ok(data.positions.length > 0);
        assert.ok(data.positions.every(Number.isFinite));
        assert.equal(data.positions.length, data.normals.length);
    }
});

test('projétil nasce no cano em qualquer orientação e converge para a mira', () => {
    for (const [yaw, pitch] of [[0, 0], [-1.2, 0.8], [2.5, -1.5]]) {
        const weapons = system();
        const camera = new FPSCamera();
        camera.position = { x: 3, y: 4, z: -5 };
        camera.yaw = yaw; camera.pitch = pitch;
        weapons.update(0, input('MouseLeft'), camera);
        const bullet = weapons.projectiles[0];
        const cameraSpace = transformPoint(camera.getViewMatrix(), bullet.position);
        const muzzle = transformPoint(weapons.equipped.localMatrix, weapons.equipped.muzzle);
        cameraSpace.forEach((value, i) => near(value, muzzle[i]));
        near(Math.hypot(...bullet.direction), 1);
        const distance = Math.hypot(...muzzle.map((value, i) => (i === 2 ? -40 : 0) - value));
        const target = bullet.position.map((value, i) => value + bullet.direction[i] * distance);
        transformPoint(camera.getViewMatrix(), target).forEach((value, i) => near(value, i === 2 ? -40 : 0));
    }
});

test('velocidade independe do FPS; disparos não seguem movimentos posteriores da câmera', () => {
    for (const fps of [30, 60, 144]) {
        const weapons = system(), camera = new FPSCamera();
        weapons.shoot(camera);
        const start = [...weapons.projectiles[0].position];
        camera.position.x = 100;
        for (let i = 0; i < fps; i++) weapons.update(1 / fps, input(), camera);
        near(Math.hypot(...weapons.projectiles[0].position.map((v, i) => v - start[i])), weapons.speed);
    }
});

test('limites de distância, tempo e quantidade e descarte de buffers', () => {
    const weapons = new WeaponSystem([mesh()], mesh(), [
        { ...WEAPON_DEFINITIONS[0], magazineSize: 2000, shotInterval: 0 },
    ]), camera = new FPSCamera();
    for (let i = 0; i < 1000; i++) weapons.shoot(camera);
    assert.equal(weapons.projectiles.length, weapons.maxProjectiles);
    weapons.update(weapons.maxDistance / weapons.speed, input(), camera);
    assert.equal(weapons.projectiles.length, 0);
    weapons.shoot(camera); weapons.speed = 0;
    weapons.update(weapons.lifetime, input(), camera);
    assert.equal(weapons.projectiles.length, 0);
    weapons.dispose();
    assert.ok(weapons.bulletMesh.disposed && weapons.equipped.mesh.disposed);
});

test('cada arma esvazia seu pente, bloqueia disparos e recarrega com reserva infinita', () => {
    const camera = new FPSCamera();
    for (let index = 0; index < 4; index++) {
        const weapons = system();
        weapons.select(index);
        const weapon = weapons.equipped;
        let shots = 0;
        weapons.onShoot = () => shots++;
        assert.equal(weapon.ammo, [12, 30, 8, 5][index]);
        for (let cycle = 0; cycle < 2; cycle++) {
            for (let round = weapon.magazineSize; round > 0; round--) {
                weapons.update(weapon.shotInterval, input('MouseLeft'), camera);
                assert.equal(weapon.ammo, round - 1);
            }
            assert.equal(shots, (cycle + 1) * weapon.magazineSize);
            assert.equal(weapons.reloading, true);
            const count = weapons.projectiles.length;
            assert.equal(weapons.shoot(camera), false);
            assert.equal(weapons.projectiles.length, count);
            weapons.update(weapon.reloadDuration - 0.01, input('MouseLeft'), camera);
            assert.equal(weapon.ammo, 0);
            weapons.update(0.01, input(), camera);
            assert.equal(weapon.ammo, weapon.magazineSize);
            assert.equal(weapons.reloading, false);
        }
    }
});

test('R recarrega pente parcial; trocar arma ou usar melee cancela sem repor munição', () => {
    const weapons = system(), camera = new FPSCamera();
    weapons.update(0, input('KeyR'), camera);
    assert.equal(weapons.reloading, false);
    weapons.update(0, input('MouseLeft'), camera);
    assert.equal(weapons.equipped.ammo, 11);
    weapons.update(0, input('KeyR', 'MouseLeft'), camera);
    assert.equal(weapons.reloading, true);
    weapons.update(0.5, input('KeyR'), camera);
    near(weapons.reloadRemaining, 0.9);
    weapons.update(0, input('Digit2'), camera);
    assert.equal(weapons.reloading, false);
    assert.equal(weapons.equipped.ammo, 30);
    weapons.update(0, input('Digit1', 'KeyR'), camera);
    assert.equal(weapons.equipped.ammo, 11);
    weapons.update(0, input('KeyF'), camera);
    assert.equal(weapons.reloading, false);
    weapons.update(1, input('KeyR'), camera);
    weapons.update(weapons.equipped.reloadDuration, input(), camera);
    assert.equal(weapons.equipped.ammo, 12);
    weapons.update(0, input('MouseLeft'), camera);
    weapons.update(0, input('KeyR'), camera);
    weapons.update(0, input('KeyQ'), camera);
    assert.equal(weapons.reloading, false);
    weapons.update(5, input('KeyR'), camera);
    assert.equal(weapons.equipped.ammo, 11);
});

test('escopeta espalha oito projéteis em cone ao redor da mira e gasta um cartucho', () => {
    for (const [yaw, pitch] of [[0, 0], [-1.2, 0.8], [2.5, -1.55], [1, 1.55]]) {
        const weapons = system(), camera = new FPSCamera();
        camera.yaw = yaw; camera.pitch = pitch;
        weapons.select(2);
        let sounds = 0;
        weapons.onShoot = () => sounds++;
        weapons.update(0, input('MouseLeft'), camera);
        assert.equal(weapons.projectiles.length, 8);
        assert.equal(weapons.equipped.ammo, 7);
        assert.equal(sounds, 1);
        const center = weapons.projectiles[0];
        assert.equal(new Set(weapons.projectiles.map(p => p.direction.join(','))).size, 8);
        for (const pellet of weapons.projectiles) {
            assert.deepEqual(pellet.position, center.position);
            near(Math.hypot(...pellet.direction), 1);
            const dot = pellet.direction.reduce((sum, value, i) => sum + value * center.direction[i], 0);
            assert.ok(dot >= Math.cos(weapons.equipped.spread) - 1e-9);
        }
        weapons.update(0.1, input(), camera);
        assert.ok(weapons.projectiles.slice(1).every(p => Math.hypot(...p.position.map((v, i) => v - center.position[i])) > 0));
    }
});

test('cadência bloqueia cliques rápidos e trocar de arma não reinicia o intervalo', () => {
    const weapons = system(), camera = new FPSCamera();
    for (let index = 0; index < 4; index++) {
        weapons.select(index);
        const weapon = weapons.equipped;
        weapons.update(0, input('MouseLeft'), camera);
        weapons.update(0, input('MouseLeft'), camera);
        weapons.select((index + 1) % 4);
        weapons.select(index);
        assert.equal(weapons.shoot(camera), false);
        assert.equal(weapon.ammo, weapon.magazineSize - 1);
        weapons.update(weapon.shotInterval, input('MouseLeft'), camera);
        assert.equal(weapon.ammo, weapon.magazineSize - 2);
    }
});

test('HUD acompanha a arma, munição e recarga; pausa e melee ocultam o contador', () => {
    const ui = Object.fromEntries(['ammo', 'ammoWeapon', 'ammoCount', 'ammoCapacity', 'ammoProgress', 'ammoHint', 'menu', 'hud', 'overlay', 'crosshair', 'status', 'title', 'description'].map(key => [key, { dataset: {}, style: {}, setAttribute() {} }]));
    const game = new Game({}, ui);
    const menuEvents = [];
    game.menu = { close: () => menuEvents.push('close'), open: options => menuEvents.push(options) };
    game.weapons = system();
    game.state = 'paused';
    game.setPlaying(true);
    assert.deepEqual(menuEvents, ['close']);
    assert.equal(ui.hud.hidden, false);
    assert.equal(ui.ammo.hidden, false);
    assert.equal(ui.ammoCount.textContent, '12');
    assert.equal(ui.ammoCapacity.textContent, '12');
    assert.equal(ui.ammoHint.textContent, '');
    game.weapons.shoot(new FPSCamera());
    game.updateAmmoHUD();
    assert.equal(ui.ammoCount.textContent, '11');
    game.weapons.reload();
    game.updateAmmoHUD();
    assert.match(ui.ammoHint.textContent, /Recarregando/);
    assert.equal(ui.ammo.dataset.reloading, 'true');
    const remaining = game.weapons.reloadRemaining;
    game.setPlaying(false);
    assert.equal(ui.ammo.hidden, true);
    assert.deepEqual(menuEvents.at(-1), { paused: true });
    game.setPlaying(true);
    assert.equal(menuEvents.at(-1), 'close');
    assert.equal(ui.ammo.hidden, false);
    assert.equal(game.weapons.reloadRemaining, remaining);
    game.weapons.select(1);
    game.updateAmmoHUD();
    assert.equal(ui.ammoWeapon.textContent, 'AKM');
    assert.equal(ui.ammoCount.textContent, '30');
    assert.equal(ui.ammoCapacity.textContent, '30');
    assert.equal(ui.ammo.dataset.reloading, 'false');
    game.weapons.equipped.ammo = 3;
    game.updateAmmoHUD();
    assert.equal(ui.ammo.dataset.low, 'true');
    assert.equal(ui.ammoHint.textContent, 'R · Recarregar');
    game.weapons.update(0, input('KeyQ'), new FPSCamera());
    game.updateAmmoHUD();
    assert.equal(ui.ammo.hidden, true);
    game.weapons.select(0);
    game.updateAmmoHUD();
    assert.equal(ui.ammo.hidden, false);
    game.showOverlay('Erro', 'Falha no contexto gráfico');
    assert.equal(ui.ammo.hidden, true);
    assert.equal(ui.menu.hidden, true);
    assert.equal(ui.overlay.hidden, false);
});

test('recarga inclina a arma para baixo e retorna à pose original em diferentes FPS', () => {
    for (const fps of [30, 60, 144]) for (let index = 0; index < 4; index++) {
        const weapons = system(), camera = new FPSCamera();
        weapons.select(index);
        const weapon = weapons.equipped, original = [...weapon.localMatrix];
        const muzzle = transformPoint(original, weapon.muzzle);
        let armsPose;
        weapons.arms = { drawFirearm: (_info, _weapon, pose) => { armsPose = pose; } };
        const draw = () => weapons.drawWeapon({ clear() {}, uniformMatrix4fv() {} }, { uniforms: {} });
        weapons.shoot(camera);
        weapons.reload();
        assert.deepEqual(weapons.reloadPose, Matrix4.identity());
        for (let frame = 0; frame < Math.ceil(fps * 0.3); frame++) weapons.update(1 / fps, input(), camera);
        draw();
        const loweredMuzzle = transformPoint(weapon.mesh.modelMatrix, weapon.muzzle);
        assert.ok(loweredMuzzle[1] < muzzle[1] - 0.1);
        assert.deepEqual(weapon.mesh.modelMatrix, Matrix4.multiply(armsPose, original));
        assert.deepEqual(weapon.localMatrix, original);
        assert.equal(weapons.shoot(camera), false);
        const pausedPose = weapons.reloadPose;
        draw(); draw();
        assert.deepEqual(weapons.reloadPose, pausedPose, 'desenhar não avança a recarga');
        weapons.update(weapons.reloadRemaining - 0.14, input(), camera);
        draw();
        const risingMuzzle = transformPoint(weapon.mesh.modelMatrix, weapon.muzzle);
        assert.ok(risingMuzzle[1] > loweredMuzzle[1] && risingMuzzle[1] < muzzle[1]);
        weapons.update(0.14, input(), camera);
        draw();
        assert.equal(weapons.reloading, false);
        assert.deepEqual(weapon.mesh.modelMatrix, original);
        assert.deepEqual(armsPose, Matrix4.identity());
    }
});

test('cancelar a recarga remove a inclinação sem alterar a arma base', () => {
    const weapons = system(), camera = new FPSCamera();
    weapons.shoot(camera);
    weapons.reload();
    weapons.update(0.3, input(), camera);
    assert.notDeepEqual(weapons.reloadPose, Matrix4.identity());
    weapons.select(1);
    assert.deepEqual(weapons.reloadPose, Matrix4.identity());
    weapons.select(0);
    assert.equal(weapons.equipped.ammo, 11);
    assert.deepEqual(weapons.reloadPose, Matrix4.identity());
    weapons.reload();
    weapons.update(0.3, input('KeyF'), camera);
    assert.deepEqual(weapons.reloadPose, Matrix4.identity());
});

test('teclas selecionam apenas uma arma; seleção inválida mantém equipamento', () => {
    const definitions = [WEAPON_DEFINITIONS[0], { ...WEAPON_DEFINITIONS[0], key: 'Digit2' }];
    const meshes = [mesh(), mesh()];
    const weapons = new WeaponSystem(meshes, mesh(), definitions);
    weapons.update(0, input('Digit2'), new FPSCamera());
    assert.equal(weapons.selected, 1);
    weapons.select(9);
    assert.equal(weapons.selected, 1);
    weapons.drawWeapon({ clear() {}, uniformMatrix4fv() {} }, { uniforms: {} });
    assert.equal(meshes[0].draws, undefined);
    assert.equal(meshes[1].draws, 1);
    weapons.update(0, input('Digit1'), new FPSCamera());
    assert.equal(weapons.selected, 0);
});

test('loader ignora faces sem área e continua rejeitando modelos sem geometria útil', () => {
    const vertices = 'v 0 0 0\nv 1 0 0\nv 0 1 0\n';
    assert.equal(OBJLoader.parse(vertices + 'f 1 1 2\nf 1 2 3').positions.length, 9);
    assert.throws(() => OBJLoader.parse(vertices + 'f 1 1 2'), /não contém faces/);
});

test('quatro slots reais selecionam a arma e emitem o som correspondente ao disparo', () => {
    const weapons = system(), camera = new FPSCamera(), sounds = [];
    weapons.onShoot = weapon => sounds.push(weapon.sound);
    for (let i = 0; i < 4; i++) {
        weapons.update(0, input(`Digit${i + 1}`, 'MouseLeft'), camera);
        assert.equal(weapons.selected, i);
        const muzzle = transformPoint(weapons.equipped.localMatrix, weapons.equipped.muzzle);
        weapons.projectiles.at(-1).position.forEach((v, axis) => near(v, muzzle[axis]));
        assert.ok(muzzle[2] < -0.05);
    }
    assert.deepEqual(sounds, ['pistola', 'akm', 'escopeta', 'sniper']);
});

test('AKM mantém cadência em 30/60/144 FPS e para ao soltar ou limpar a entrada', () => {
    for (const fps of [30, 60, 144]) {
        const weapons = system(), camera = new FPSCamera();
        weapons.select(1);
        let shots = 0, held = true;
        weapons.onShoot = () => shots++;
        const controls = { consumePress: () => false, isPressed: () => held };
        weapons.update(0, controls, camera);
        for (let frame = 0; frame < fps; frame++) weapons.update(1 / fps, controls, camera);
        assert.equal(shots, 8);
        held = false;
        for (let frame = 0; frame < fps; frame++) weapons.update(1 / fps, controls, camera);
        assert.equal(shots, 8);
        held = true;
        weapons.update(1 / fps, controls, camera);
        assert.equal(shots, 9);
        weapons.select(0);
        for (let frame = 0; frame < fps; frame++) weapons.update(1 / fps, controls, camera);
        assert.equal(shots, 9);
    }
});
