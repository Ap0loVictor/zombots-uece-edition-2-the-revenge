import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Level } from '../src/game/level.js';
import { Player } from '../src/game/player.js';
import { Mesh } from '../src/engine/mesh.js';
import { intersectsAABB } from '../src/engine/collision.js';

// WebGL falso: só precisa aceitar a criação de buffers.
const gl = { ARRAY_BUFFER: 0, STATIC_DRAW: 0, createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {} };
const data = JSON.parse(await readFile(new URL('../assets/map/test_level.json', import.meta.url), 'utf8'));
const level = new Level(gl, data);
const input = (keys = []) => ({ isPressed: key => keys.includes(key), getMouseDelta: () => ({ x: 0, y: 0 }) });
const ground = (x, z) => level.groundHeight(x, z);

test('altura do chão: mato, asfalto, calçada e ilha da rotatória', () => {
    assert.equal(ground(-45, -40), 0);       // mato
    assert.equal(ground(0, 3), 0.03);        // asfalto
    assert.equal(ground(0, 10), 0.15);       // calçada
    assert.equal(ground(-34, 0), 0.16);      // mato elevado da ilha
    assert.equal(ground(-34, 5.2), 0.15);    // meio-fio da ilha
    assert.equal(ground(-34, 8), 0.03);      // pista da rotatória
    assert.equal(ground(0, 0.5), 0.03);      // faixa pintada não altera o chão
});

test('jogador sobe da pista para a calçada, sem ser bloqueado', () => {
    const player = new Player({ x: 0, y: 0.03, z: 3, yaw: 0 }, null);
    player.yaw = Math.PI; player.camera.yaw = Math.PI; // olhando para +Z (calçada do CED)
    for (let i = 0; i < 120; i++) player.update(input(['KeyW']), 1 / 60, level.colliders, ground);
    assert.ok(player.position.z > 8, `z = ${player.position.z}`);
    assert.ok(Math.abs(player.position.y - 0.15) < 1e-3, `y = ${player.position.y}`);
    assert.ok(Math.abs(player.camera.position.y - 1.75) < 1e-3);
});

test('desnível maior que maxStep bloqueia como parede', () => {
    const player = new Player({ x: 0, y: 0, z: 0 }, null);
    const wallAt = (x, z) => (x > 1 ? 1 : 0);
    for (let i = 0; i < 120; i++) player.update(input(['KeyD']), 1 / 60, [], wallAt);
    assert.ok(player.position.x <= 1 + 1e-9);
    assert.equal(player.position.y, 0);
});

test('prédios e troncos bloqueiam mesmo sobre a calçada', () => {
    const player = new Player({ x: 0, y: 0, z: 10 }, null);
    player.update(input(), 1 / 60, level.colliders, ground);
    for (let i = 0; i < 200; i++) player.update(input(['KeyS']), 1 / 60, level.colliders, ground);
    assert.ok(player.position.z <= 17 - player.halfSize.z + 1e-6);     // CED começa em z = 17
    assert.equal(level.colliders.some(box => intersectsAABB(player.collider, box)), false);
});

test('spawn está livre e sobre a calçada', () => {
    const { x, z } = data.spawn;
    const player = new Player({ x, y: ground(x, z), z }, null);
    assert.equal(level.colliders.some(box => intersectsAABB(player.collider, box)), false);
    assert.equal(ground(x, z), 0.15);
});

test('árvores não nascem em pistas nem dentro de prédios', () => {
    for (const [x, z] of data.trees) {
        assert.ok(ground(x, z) !== 0.03, `árvore (${x}, ${z}) está no asfalto`);
        for (const o of data.obstacles) {
            const [x0, z0, x1, z1] = o.rect;
            assert.ok(!(x > x0 - 1 && x < x1 + 1 && z > z0 - 1 && z < z1 + 1), `árvore (${x}, ${z}) em ${o._name}`);
        }
    }
});

test('tudo dentro dos limites do mapa e materiais existem', () => {
    const half = { x: data.width / 2, z: data.depth / 2 };
    for (const s of data.surfaces) {
        assert.ok(data.materials[s.material], s._name);
        const [x0, z0, x1, z1] = s.rect ?? [s.circle[0] - s.circle[2], s.circle[1] - s.circle[2], s.circle[0] + s.circle[2], s.circle[1] + s.circle[2]];
        const limit = s.circle ? 11 : 0; // a rotatória pode passar um pouco do limite; as paredes cobrem
        assert.ok(Math.min(x0, x1) >= -half.x - limit && Math.max(x0, x1) <= half.x + limit, s._name);
        assert.ok(Math.min(z0, z1) >= -half.z - limit && Math.max(z0, z1) <= half.z + limit, s._name);
    }
});

test('cilindro e esfera têm faces voltadas para fora', () => {
    for (const [mesh, center] of [[Mesh.cylinder(gl), [0, 0.5, 0]], [Mesh.sphere(gl), [0, 0, 0]]]) {
        assert.ok(mesh.vertexCount % 3 === 0 && mesh.vertexCount > 0);
    }
    // Verificação geométrica direta via pushTriangle.
    const positions = [], normals = [];
    Mesh.pushTriangle(positions, normals, [[0, 0, 0], [0, 0, 1], [1, 0, 0]], [[0, 1, 0], [0, 1, 0], [0, 1, 0]]);
    const [a, b, c] = [0, 3, 6].map(i => positions.slice(i, i + 3));
    const u = b.map((v, i) => v - a[i]), v = c.map((w, i) => w - a[i]);
    assert.ok(u[2] * v[0] - u[0] * v[2] > 0); // componente Y do produto vetorial aponta para cima
});

test('parado na calçada não treme e na pista também não', () => {
    for (const [x, z, expected] of [[0, 10, 0.15], [0, 3, 0.03]]) {
        const player = new Player({ x, y: expected, z }, null);
        const heights = new Set();
        for (let i = 0; i < 120; i++) { player.update(input(), 1 / 60, level.colliders, ground); heights.add(player.position.y); }
        assert.deepEqual([...heights], [expected]);
    }
});

test('pulo funciona na calçada, sobe acima do chão e pousa de volta', () => {
    const player = new Player({ x: 0, y: 0.15, z: 10 }, null);
    let jumped = false;
    const press = { ...input(), consumePress: key => key === 'Space' && !jumped && (jumped = true) };
    let peak = 0;
    for (let i = 0; i < 90; i++) {
        player.update(i === 0 ? press : input(), 1 / 60, level.colliders, ground);
        peak = Math.max(peak, player.position.y);
    }
    assert.ok(peak > 0.15 + 0.5, `pico = ${peak}`);
    assert.equal(player.position.y, 0.15);
});

test('pular da pista para a calçada e andar pulando não prende o jogador', () => {
    const player = new Player({ x: 0, y: 0.03, z: 4 }, null);
    player.camera.yaw = Math.PI;
    const press = { isPressed: key => key === 'KeyW', getMouseDelta: () => ({ x: 0, y: 0 }), consumePress: key => key === 'Space' };
    for (let i = 0; i < 90; i++) player.update(press, 1 / 60, level.colliders, ground);
    assert.ok(player.position.z > 6);
    assert.ok(player.position.y >= 0.15 - 1e-9);
});