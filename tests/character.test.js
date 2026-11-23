import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCharacterMesh, FirstPersonArms, PlayerBody, armJoints, posePoint } from '../src/game/character_model.js';
import { WeaponSystem, WEAPON_DEFINITIONS } from '../src/game/weapons.js';
import { OBJLoader } from '../src/engine/obj_loader.js';
import { Matrix4 } from '../src/engine/matrix.js';

function graphics() {
    const buffers = [], deleted = [];
    return { buffers, deleted, createBuffer: () => ({}), bindBuffer() {},
        bufferData: (_, data) => buffers.push([...data]), deleteBuffer: buffer => deleted.push(buffer) };
}

test('peças do personagem são fechadas, facetadas e têm todas as faces para fora', () => {
    const gl = graphics(), mesh = createCharacterMesh(gl);
    const [positions, normals] = gl.buffers, edges = new Map();
    assert.equal(mesh.vertexCount / 3, 60);
    for (let i = 0; i < positions.length; i += 9) {
        const points = [0, 3, 6].map(n => positions.slice(i + n, i + n + 3));
        const normal = normals.slice(i, i + 3);
        assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-6);
        assert.ok(points[0].reduce((sum, value, axis) => sum + value * normal[axis], 0) > 0);
        for (let j = 0; j < 3; j++) {
            assert.deepEqual(normals.slice(i + j * 3, i + j * 3 + 3), normal);
            const key = [points[j].join(','), points[(j + 1) % 3].join(',')].sort().join('|');
            edges.set(key, (edges.get(key) ?? 0) + 1);
        }
    }
    assert.ok([...edges.values()].every(count => count === 2), 'nenhuma borda aberta nas mangas');
    mesh.dispose();
    assert.equal(gl.deleted.length, 2);
});

test('armas reais excluem os braços antigos sem perder faces ou materiais da arma', async () => {
    for (const weapon of WEAPON_DEFINITIONS) {
        const obj = await readFile(new URL(`../assets/weapons/${weapon.file}`, import.meta.url), 'utf8');
        const mtl = await readFile(new URL(`../assets/weapons/${weapon.file.replace('.obj', '.mtl')}`, import.meta.url), 'utf8');
        const materials = OBJLoader.parseMTL(mtl);
        const data = OBJLoader.parse(obj, materials, { excludeObjects: ['ArmModel', 'ArmModel.001'] });
        const armsOnly = OBJLoader.parse(obj, materials, {
            excludeObjects: [...obj.matchAll(/^o (.+)$/gm)].map(match => match[1]).filter(name => !name.startsWith('ArmModel')),
        });
        assert.equal(data.positions.length + armsOnly.positions.length, OBJLoader.parse(obj, materials).positions.length);
        for (let i = 0; i < data.colors.length; i += 4) {
            for (const [name, color] of materials) if (/^(Shirt|Skin|Glove)/.test(name)) {
                assert.notDeepEqual(data.colors.slice(i, i + 4), color);
            }
        }
    }
});

test('exclusão de objetos mantém índices globais e relativos, inclusive antes da arma', () => {
    const source = 'o ArmModel\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n' +
        'o Weapon\nv 0 0 1\nf 1 2 4\nf -4 -3 -1';
    const data = OBJLoader.parse(source, new Map(), { excludeObjects: ['ArmModel'] });
    assert.equal(data.positions.length, 18);
    assert.deepEqual(data.positions.slice(0, 9), data.positions.slice(9));
});

test('pegadas das quatro armas têm braços conectados e matrizes invertíveis', () => {
    const arms = new FirstPersonArms(graphics());
    const weapons = new WeaponSystem(WEAPON_DEFINITIONS.map(() => ({})), {});
    let draws = 0;
    arms.mesh.draw = () => {
        assert.ok(Matrix4.normalMatrix(arms.mesh.modelMatrix).every(Number.isFinite));
        draws++;
    };
    for (const weapon of weapons.weapons) {
        arms.drawFirearm({}, weapon);
        for (const grip of weapon.grips) {
            const wrist = posePoint(weapon.localMatrix, grip.point);
            const { shoulder, elbow } = armJoints(wrist, grip.side);
            const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
            assert.ok(Math.abs(distance(shoulder, elbow) - distance(elbow, wrist)) < 1e-8);
            assert.ok(elbow[1] < wrist[1], 'cotovelo abaixo da pegada');
        }
    }
    assert.ok(draws > 0);
});

test('corpo repousa no chão, não envolve os olhos e solta todos os buffers', () => {
    const gl = graphics(), body = new PlayerBody(gl), bounds = [];
    const vertices = gl.buffers[0];
    body.mesh.draw = () => {
        for (let i = 0; i < vertices.length; i += 3) bounds.push(posePoint(body.mesh.modelMatrix, vertices.slice(i, i + 3)));
    };
    body.draw({});
    assert.ok(Math.min(...bounds.map(p => p[1])) >= -0.01);
    assert.ok(Math.min(...bounds.map(p => p[1])) < 0.03);
    assert.ok(Math.max(...bounds.map(p => p[1])) < 1.6);
    assert.ok(bounds.every(p => Math.abs(p[0]) < .56 && Math.abs(p[2]) < .56));
    body.update(.1, 1 / 30, true);
    assert.ok(body.walkAmount > 0);
    body.update(0, 1, true);
    assert.ok(body.walkAmount < .001);
    body.dispose();
    assert.equal(gl.deleted.length, 2);
});
