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
const ground = (x, z, y) => level.groundHeight(x, z, y);
const bld = name => [...data.obstacles, ...data.buildings].find(o => o._name === name);

test('altura do chão: mato, asfalto, calçada e ilha da rotatória', () => {
    assert.equal(ground(-45, -40), 0);       // mato
    assert.equal(ground(0, 3), 0.03);        // asfalto
    assert.equal(ground(0, 10), 0.15);       // calçada
    assert.equal(ground(-34, 0), 0.16);      // mato elevado da ilha
    assert.equal(ground(-34, 5.2), 0.15);    // meio-fio da ilha
    assert.equal(ground(-34, 8), 0.03);      // pista da rotatória
    assert.equal(ground(-20, 0), 0.03);      // faixa pintada não altera o chão
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
    const player = new Player({ x: -12, y: 0, z: 10 }, null);
    player.update(input(), 1 / 60, level.colliders, ground);
    for (let i = 0; i < 200; i++) player.update(input(['KeyS']), 1 / 60, level.colliders, ground);
    assert.ok(player.position.z <= 15 - player.halfSize.z + 1e-6);     // muro do CED em z = 15
    assert.equal(level.colliders.some(box => intersectsAABB(player.collider, box)), false);
});

test('spawn está livre, no piso do 2º andar do NC2A (sala 015)', () => {
    const { x, z } = data.spawn;
    const player = new Player({ x, y: ground(x, z), z }, null);
    assert.equal(level.colliders.some(box => intersectsAABB(player.collider, box)), false);
    assert.ok(Math.abs(ground(x, z) - 3.55) < 1e-9);          // piso do 2º andar: 0,15 + 3,4
    assert.ok(Math.abs(data.spawn.y - ground(x, z)) < 1e-9);
    // Dentro da sala 015 (x entre as paredes leste e oeste, z entre a fachada sul e a divisória).
    assert.ok(x > -12.3 && x < -7.8 && z > -15.08 && z < -10.8);
});

test('capacete está na mesma sala e fora de qualquer colisor', () => {
    const { x, z } = data.helmet;
    assert.ok(x > -12.3 && x < -7.8 && z > -15.08 && z < -10.8);
    assert.ok(Math.abs(ground(x, z, data.spawn.y) - 3.55) < 1e-9);
    const probe = new Player({ x, y: 3.55, z }, null);
    assert.equal(level.colliders.some(box => intersectsAABB(probe.collider, box)), false);
    // E o jogador nasce olhando para ele.
    const yaw = data.spawn.yaw;
    const forward = [-Math.sin(yaw), -Math.cos(yaw)];
    const toHelmet = [x - data.spawn.x, z - data.spawn.z];
    const length = Math.hypot(...toHelmet);
    assert.ok((forward[0] * toHelmet[0] + forward[1] * toHelmet[1]) / length > 0.99);
});

test('árvores não nascem em pistas nem dentro de prédios', () => {
    for (const [x, z] of data.trees) {
        assert.ok(ground(x, z) !== 0.03, `árvore (${x}, ${z}) está no asfalto`);
        for (const o of [...data.obstacles, ...data.buildings]) {
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
test('muro do CED não deixa entrar nem pulando', () => {
    const player = new Player({ x: -12, y: 0.15, z: 10 }, null);
    const press = { isPressed: key => key === 'KeyS', getMouseDelta: () => ({ x: 0, y: 0 }), consumePress: key => key === 'Space' };
    for (let i = 0; i < 300; i++) player.update(press, 1 / 60, level.colliders, ground);
    assert.ok(player.position.z <= 15 - player.halfSize.z + 1e-6, `z = ${player.position.z}`);
});

test('canteiro central, passarelas e areia do estacionamento', () => {
    assert.equal(ground(-10, 0), 0.16);   // canteiro
    assert.equal(ground(-20, 0), 0.03);   // aberto na faixa de pedestres (ponta do NC2A)
    assert.equal(ground(20, 22), 0.15);   // passarela
    assert.equal(ground(20, 28), 0.02);   // terra
    assert.equal(ground(-34, 8), 0.03);   // pista da rotatória segue no mapa
});

test('tronco no canteiro central bloqueia', () => {
    const player = new Player({ x: 6, y: 0.16, z: -3 }, null);
    const press = { isPressed: key => key === 'KeyS', getMouseDelta: () => ({ x: 0, y: 0 }), consumePress: () => false };
    player.camera.yaw = Math.PI; // rumo a +Z, direto no tronco (6, 0)
    player.camera.yaw = 0;
    const back = { ...press, isPressed: key => key === 'KeyS' };
    for (let i = 0; i < 200; i++) player.update(back, 1 / 60, level.colliders, ground);
    assert.equal(level.colliders.some(box => intersectsAABB(player.collider, box)), false);
});

test('CED: metades iguais, vão de dois players e muro leste alinhado com o NC2A', () => {
    const box = name => bld(name).rect;
    const [a0, , a1] = box('CED'), [b0, , b1] = box('CED2');
    assert.ok(Math.abs((a1 - a0) - (b1 - b0)) < 1e-9, 'metades com larguras diferentes');
    assert.ok(Math.abs(box('CED')[3] - box('CED2')[3]) < 1e-9 && box('CED')[1] === box('CED2')[1]);
    assert.ok(b0 - a1 >= 2 * 1.13 - 1e-9, `vão = ${b0 - a1}`);
    assert.equal(box('Muro CED leste')[2], box('NC2A')[2]);
});

test('prédios: NC2A = Nupeinsq, CEDs mais escuros, todos mais escuros que a calçada', () => {
    const color = name => bld(name).color;
    assert.deepEqual(color('NC2A'), color('Nupeinsq'));
    const sidewalk = data.materials.sidewalk.color[0];
    for (const name of ['NC2A', 'Nupeinsq', 'CED', 'CED2', 'Biblioteca', 'Entrada', 'Saude']) assert.ok(color(name)[0] < sidewalk, name);
    assert.ok(color('CED')[0] < color('NC2A')[0] && color('CED2')[0] < color('NC2A')[0]);
});

test('asfalto vai da rotatória ao fim do canteiro; depois é só terra', () => {
    assert.equal(ground(20, 3), 0.03);     // ainda asfalto
    assert.equal(ground(23, 3), 0.02);     // curva: terra
    assert.equal(ground(31, -3), 0.02);    // cruzamento: terra
    assert.equal(ground(31, -20), 0.02);   // via norte-sul: terra
    assert.equal(ground(31, -45), 0.02);
    assert.equal(ground(23.5, -20), 0.15); // calçada continua
});

test('prédios da frente: mesma linha de fachada, calçada mais rasa e rua intacta', () => {
    const rect = name => bld(name).rect;
    assert.equal(rect('NC2A')[3], rect('Nupeinsq')[3]);
    const front = rect('NC2A')[3];
    assert.equal(ground(0, front + 0.1), 0.15);   // calçada logo à frente dos prédios
    assert.equal(ground(0, -6.1), 0.15);
    assert.equal(ground(0, -5.9), 0.03);          // rua começa em z = -6, como antes
    assert.equal(ground(0, 5.9), 0.03);
});

test('NC2A cresce até a parede norte do mapa', () => {
    const [x0, z0, x1, z1] = bld('NC2A').rect;
    assert.equal(z0, -data.depth / 2);
    assert.equal(z1, bld('Nupeinsq').rect[3]);
});

test('elevação: tira colada à face leste do NC2A, da curva de entrada até a calçada', () => {
    const [x0, z0, x1, z1] = data.surfaces.find(s => s._name === 'Elevação ao lado do NC2A').rect;
    const nc2a = bld('NC2A').rect;
    const arm = data.surfaces.find(s => s._name === 'Caminho NC2A (entrada)').rect;
    assert.equal(x0, nc2a[2]);                         // colada na face leste
    assert.equal(z0, Math.max(arm[1], arm[3]));        // começa na curva da entrada
    assert.equal(z1, bld('Nupeinsq').rect[3]); // vai até a calçada
    assert.equal(ground((x0 + x1) / 2, (z0 + z1) / 2), 0.3);
    assert.equal(ground(-26, -20), 0);                 // nada do lado oeste
});

test('elevação: sobe andando a partir da calçada', () => {
    const player = new Player({ x: -6.5, y: 0.15, z: -8 }, null);
    for (let i = 0; i < 90; i++) player.update(input(['KeyW']), 1 / 60, level.colliders, ground);
    assert.ok(player.position.z < -12, `z = ${player.position.z}`);
    assert.ok(Math.abs(player.position.y - 0.3) < 1e-3, `y = ${player.position.y}`);
});

// ---------- interior do NC2A ----------
const nc2a = bld('NC2A');
const walkFrom = (start, keys, frames = 150, extra = {}) => {
    const player = new Player(start, null);
    const held = { isPressed: key => keys.includes(key), getMouseDelta: () => ({ x: 0, y: 0 }), consumePress: () => false };
    for (let i = 0; i < frames; i++) player.update(held, 1 / 60, level.colliders, ground);
    return player.position;
};
const corridorWall = x => nc2a.walls.find(w => w.line[0] === w.line[2] && Math.abs(w.line[0] - x) < 0.05 && w.doors);

test('NC2A: entra pela porta da frente até o corredor, sem atravessar paredes', () => {
    const at = nc2a.walls.find(w => w._name === 'Fachada leste').doors[0].at;
    const pos = walkFrom({ x: -3, y: 0.15, z: at, yaw: 0 }, ['KeyA'], 200);
    assert.ok(pos.x < -12.5 && pos.x > -17.3, `x = ${pos.x}`);     // dentro do corredor
    assert.ok(Math.abs(pos.y - 0.15) < 1e-3);                      // térreo (a laje não vira chão)
    const outside = walkFrom({ x: -3, y: 0.15, z: -20, yaw: 0 }, ['KeyA'], 200);
    assert.ok(outside.x > -7.5, `x = ${outside.x}`);               // fachada fecha o resto
});

test('NC2A: portas das salas da esquerda abertas entram; as outras estão fechadas', () => {
    const west = corridorWall(-17.29), east = corridorWall(-12.4);
    for (const [wall, key, startX] of [[west, 'KeyA', -15], [east, 'KeyD', -14.5]]) {
        for (const door of wall.doors.filter(d => d.leaf !== false || d.state === 'closed')) {
            const pos = walkFrom({ x: startX, y: 0.15, z: door.at, yaw: 0 }, [key], 120);
            const wallX = wall.line[0];
            const crossed = key === 'KeyA' ? pos.x < wallX - 0.5 : pos.x > wallX + 0.5;
            assert.equal(crossed, door.state === 'open', `${door._name}: x = ${pos.x}`);
        }
    }
    const opens = [...west.doors, ...east.doors].filter(d => d.state === 'open' && d.leaf !== false).map(d => d._name);
    assert.deepEqual(opens.sort(), ['Sala 011 LDI', 'Sala 012 LAURA', 'Sala 013 GESAD Fábrica de Testadores', 'Sala 014 LOGIN/LARCOM/LISAD/LEID/INETSYS',
        'Sala 015 GESAD Projetos', 'Sala 016 GESAD Estágio', 'Sala 018 Reunião'].sort());
});

test('NC2A: escada leva ao 2º andar andando e correndo, e o térreo sob a laje continua térreo', () => {
    const stair = nc2a.slabHole;               // [x0, z0, x1, z1]
    const z = (stair[1] + stair[3]) / 2;
    const under = walkFrom({ x: -14.5, y: 0.15, z: -34, yaw: 0 }, [], 30);
    assert.equal(under.y, 0.15);
    for (const keys of [['KeyD'], ['KeyD', 'ShiftLeft']]) {
        const pos = walkFrom({ x: -14.5, y: 0.15, z, yaw: 0 }, keys, 200);
        assert.ok(pos.x > -8.6, `${keys}: x = ${pos.x}`);
        assert.ok(Math.abs(pos.y - 3.55) < 1e-3, `${keys}: y = ${pos.y}`);
    }
});

test('NC2A: no 2º andar dá para sair da escada, andar pela planta e a laje sustenta', () => {
    const [x0, z0, x1, z1] = nc2a.slabHole;
    const player = new Player({ x: -14.5, y: 0.15, z: (z0 + z1) / 2, yaw: 0 }, null);
    const press = keys => ({ isPressed: k => keys.includes(k), getMouseDelta: () => ({ x: 0, y: 0 }), consumePress: () => false });
    for (const [keys, frames] of [[['KeyD'], 200], [['KeyW'], 45], [['KeyA'], 150]]) {
        for (let i = 0; i < frames; i++) player.update(press(keys), 1 / 60, level.colliders, ground);
    }
    assert.ok(player.position.x < -13, `x = ${player.position.x}`);
    assert.ok(Math.abs(player.position.y - 3.55) < 1e-3, `y = ${player.position.y}`);
    // as paredes do térreo não bloqueiam o 2º andar, mas as do 2º andar sim
    assert.equal(level.colliders.some(box => intersectsAABB(player.collider, box)), false);
});

test('NC2A: segundo andar tem a mesma planta (portas abertas das salas da esquerda também)', () => {
    const door = corridorWall(-17.29).doors.find(d => d._name === 'Sala 012 LAURA');
    const player = new Player({ x: -14.5, y: 3.55, z: door.at, yaw: 0 }, null);
    const press = { isPressed: k => k === 'KeyA', getMouseDelta: () => ({ x: 0, y: 0 }), consumePress: () => false };
    for (let i = 0; i < 120; i++) player.update(press, 1 / 60, level.colliders, ground);
    assert.ok(player.position.x < -18, `x = ${player.position.x}`);
    assert.ok(Math.abs(player.position.y - 3.55) < 1e-3, `y = ${player.position.y}`);
});

test('planta bate com o desenho: recepção na porta do caminho em L e todas as salas existem', () => {
    const arm = data.surfaces.find(s => s._name === 'Caminho NC2A (entrada)').rect;
    const door = nc2a.walls.find(w => w._name === 'Fachada leste').doors[0];
    assert.ok(door.at - door.width / 2 >= Math.min(arm[1], arm[3]) && door.at + door.width / 2 <= Math.max(arm[1], arm[3]));
    const names = [...corridorWall(-17.29).doors, ...corridorWall(-12.4).doors].map(d => d._name);
    assert.equal(names.length, 11 + 9);
});