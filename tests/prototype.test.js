import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Matrix4 } from '../src/engine/matrix.js';
import { FPSCamera } from '../src/engine/camera.js';
import { createAABB, intersectsAABB, moveAABB } from '../src/engine/collision.js';
import { OBJLoader } from '../src/engine/obj_loader.js';
import { Player } from '../src/game/player.js';

const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);
const input = (keys = [], mouse = { x: 0, y: 0 }) => ({ isPressed: key => keys.includes(key), getMouseDelta: () => mouse });
const spawn = { x: 0, y: 0, z: 0 };
const halfSize = { x: 0.5, y: 0.9, z: 0.5 };
const wall = createAABB({ x: 3, y: 1.5, z: 0 }, { x: 0.1, y: 1.5, z: 5 });
const transform = (m, v) => Array.from({ length: 4 }, (_, row) => v.reduce((sum, value, col) => sum + m[col * 4 + row] * value, 0));

test('movimento mantém velocidade em 30/60/144 FPS e normaliza a diagonal', () => {
    for (const fps of [30, 60, 144]) {
        for (const keys of [['KeyW'], ['KeyW', 'KeyD'], ['ArrowUp', 'ArrowRight']]) {
            const player = new Player(spawn, null);
            for (let frame = 0; frame < fps; frame++) player.update(input(keys), 1 / fps, []);
            near(Math.hypot(player.position.x, player.position.z), player.walkSpeed);
            near(player.camera.position.y, 1.6);
            near(player.camera.position.x, player.position.x);
            near(player.camera.position.z, player.position.z);
        }
    }
});

test('corrida, comandos opostos e aliases não somam velocidade', () => {
    const runner = new Player(spawn, null);
    runner.update(input(['KeyW', 'ArrowUp', 'Space']), 1, []);
    near(runner.position.z, -runner.runSpeed);
    const idle = new Player(spawn, null);
    idle.update(input(['KeyW', 'KeyS', 'KeyA', 'KeyD']), 1, []);
    assert.deepEqual(idle.position, spawn);
});

test('movimento segue yaw e não ganha altura com pitch', () => {
    const player = new Player({ ...spawn, yaw: -Math.PI / 2 }, null);
    player.camera.pitch = 1;
    player.update(input(['KeyW']), 1, []);
    near(player.position.x, 3);
    near(player.position.z, 0);
    near(player.position.y, 0);
});

test('mouse para a direita gira à direita; pitch fica limitado', () => {
    const camera = new FPSCamera();
    camera.look({ x: 100, y: -100000 });
    assert.ok(camera.yaw < 0);
    near(camera.pitch, 89 * Math.PI / 180);
    camera.look({ x: 0, y: 100000 });
    near(camera.pitch, -89 * Math.PI / 180);
});

test('matriz de visão leva o olho à origem e a direção do olhar ao eixo -Z', () => {
    const camera = new FPSCamera();
    camera.position = { x: 3, y: 1.6, z: -4 };
    camera.yaw = -0.7;
    camera.pitch = 0.5;
    const view = camera.getViewMatrix();
    transform(view, [3, 1.6, -4, 1]).forEach((value, i) => near(value, i === 3 ? 1 : 0));
    const forward = [-Math.sin(camera.yaw) * Math.cos(camera.pitch), Math.sin(camera.pitch), -Math.cos(camera.yaw) * Math.cos(camera.pitch), 0];
    transform(view, forward).forEach((value, i) => near(value, i === 2 ? -1 : 0));
});

test('inversa transposta preserva normais perpendiculares sob escala e rotação', () => {
    const model = Matrix4.multiply(Matrix4.rotationY(0.7), Matrix4.scaling(2, 3, 4));
    const tangent = transform(model, [1, 1, 0, 0]);
    const normalMatrix = Matrix4.normalMatrix(model);
    const normal = [0, 1, 2].map(row => normalMatrix[row] - normalMatrix[3 + row]);
    near(normal.reduce((sum, value, i) => sum + value * tangent[i], 0), 0);
});

test('colisão impede atravessar parede fina mesmo com deslocamento grande', () => {
    const position = moveAABB({ x: 0, y: 0.9, z: 0 }, halfSize, { x: 100, y: 0, z: 0 }, [wall]);
    near(position.x, 2.4);
    assert.equal(intersectsAABB(createAABB(position, halfSize), wall), false);
    const reverse = moveAABB({ x: 6, y: 0.9, z: 0 }, halfSize, { x: -100, y: 0, z: 0 }, [wall]);
    near(reverse.x, 3.6);
});

test('desliza na parede e para no canto sem penetrar os obstáculos', () => {
    const side = createAABB({ x: 0, y: 1.5, z: -3 }, { x: 5, y: 1.5, z: 0.1 });
    const slide = moveAABB({ x: 0, y: 0.9, z: 0 }, halfSize, { x: 4, y: 0, z: -1 }, [wall]);
    near(slide.x, 2.4);
    near(slide.z, -1);
    const corner = moveAABB({ x: 0, y: 0.9, z: 0 }, halfSize, { x: 4, y: 0, z: -4 }, [wall, side]);
    near(corner.x, 2.4);
    near(corner.z, -2.4);
    const away = moveAABB(corner, halfSize, { x: -1, y: 0, z: 1 }, [wall, side]);
    near(away.x, 1.4);
    near(away.z, -1.4);
});

test('câmera permanece junto do jogador após bloquear a movimentação', () => {
    const player = new Player(spawn, null);
    for (let i = 0; i < 300; i++) player.update(input(['KeyD', 'Space']), 1 / 60, [wall]);
    near(player.position.x, wall.min.x - player.halfSize.x);
    near(player.camera.position.x, player.position.x);
    assert.equal(intersectsAABB(player.collider, wall), false);
});

test('cubo OBJ/MTL real tem 12 triângulos, material vermelho e faces externas', async () => {
    const obj = await readFile(new URL('../assets/player/cube.obj', import.meta.url), 'utf8');
    const mtl = await readFile(new URL('../assets/player/cube.mtl', import.meta.url), 'utf8');
    const data = OBJLoader.parse(obj, OBJLoader.parseMTL(mtl));
    assert.equal(data.positions.length / 9, 12);
    assert.equal(data.normals.length, data.positions.length);
    assert.equal(data.colors.length, 36 * 4);
    for (let i = 0; i < data.colors.length; i += 4) assert.deepEqual(data.colors.slice(i, i + 4), [0.95, 0.08, 0.06, 1]);
    for (let i = 0; i < data.positions.length; i += 9) {
        const [a, b, c] = [0, 3, 6].map(offset => data.positions.slice(i + offset, i + offset + 3));
        const u = b.map((v, axis) => v - a[axis]), v = c.map((v, axis) => v - a[axis]);
        const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        assert.ok(cross.reduce((sum, n, axis) => sum + n * data.normals[i + axis], 0) > 0);
    }
});

test('loader aceita índices relativos e gera normais quando ausentes', () => {
    const data = OBJLoader.parse('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1');
    assert.deepEqual(data.normals, [0, 0, 1, 0, 0, 1, 0, 0, 1]);
    assert.throws(() => OBJLoader.parse('v 0 0 0\nf 1 2 3'), /fora dos limites/);
    assert.throws(() => OBJLoader.parse(''), /não contém faces/);
});
