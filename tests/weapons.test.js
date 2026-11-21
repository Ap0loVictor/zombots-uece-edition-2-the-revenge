import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WeaponSystem, WEAPON_DEFINITIONS, transformPoint } from '../src/game/weapons.js';
import { FPSCamera } from '../src/engine/camera.js';
import { OBJLoader } from '../src/engine/obj_loader.js';

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
    const weapons = system(), camera = new FPSCamera();
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
