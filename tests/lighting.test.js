import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Shaders } from '../src/engine/shaders.js';
import { Mesh } from '../src/engine/mesh.js';
import { FPSCamera } from '../src/engine/camera.js';
import { OBJLoader } from '../src/engine/obj_loader.js';
import { applyLighting, normalize } from '../src/engine/lighting.js';
import { Helmet } from '../src/game/helmet.js';
import { gameLighting, menuLighting } from '../src/game/lighting.js';

const gl = { ARRAY_BUFFER: 0, STATIC_DRAW: 0, createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {} };
const input = (pressed = []) => ({ consumePress: key => pressed.includes(key) });
const near = (a, b, eps = 1e-6) => a.every((value, i) => Math.abs(value - b[i]) < eps);

test('shader implementa Phong completo: ambiente + difusa + especular com R = reflect(-L, N)', () => {
    const fragment = Shaders.fragmentSource;
    for (const token of ['u_ambient', 'u_lightPos', 'u_lightColor', 'u_viewPos', 'u_specular', 'u_shininess',
        'reflect(-L, N)', 'pow(max(dot(R, V)', 'dot(N, L)']) {
        assert.ok(fragment.includes(token), `fragment shader sem ${token}`);
    }
    assert.ok(!fragment.includes('vec3(-0.4, 1.0, 0.6)'), 'a luz não pode mais ser fixa dentro do shader');
});

test('uniforms de luz e material fazem parte do programa', () => {
    const asked = [];
    const fake = {
        VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
        createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true, deleteShader() {},
        createProgram: () => ({}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true,
        getAttribLocation: (_, name) => name, getUniformLocation: (_, name) => { asked.push(name); return name; },
    };
    Shaders.createProgram(fake);
    for (const name of ['u_lightPos', 'u_lightDir', 'u_lightCone', 'u_lightAtten', 'u_viewPos', 'u_specular', 'u_shininess', 'u_emissive']) {
        assert.ok(asked.includes(name), name);
    }
});

test('applyLighting converte posição e direção para o espaço da câmera', () => {
    const camera = new FPSCamera();
    camera.position = { x: 3, y: 2, z: -5 };
    camera.yaw = 0.7; camera.pitch = 0.3;
    const calls = {};
    const recorder = { uniform3fv: (name, v) => { calls[name] = [...v]; }, uniform2f: (name, a, b) => { calls[name] = [a, b]; } };
    const uniforms = new Proxy({}, { get: (_, name) => name });
    const head = new Helmet(gl, { x: 0, z: 0 }, 0);
    head.state = 'worn';
    const lighting = gameLighting(camera, head, 0);
    applyLighting(recorder, uniforms, lighting, camera.getViewMatrix());
    assert.ok(near(calls.u_viewPos, [0, 0, 0]));                       // a câmera é a origem
    assert.ok(near(calls.u_lightDir, [0, 0, -1]));                     // lanterna aponta para -Z da câmera
    assert.ok(near(calls.u_lightPos, [0, 0.17, -0.04]));               // acima da cabeça, no espaço da câmera
});

test('o capacete só é pego com E e perto dele', () => {
    const helmet = new Helmet(gl, { x: 0, z: 0, yaw: 0 }, 3.55);
    const player = { position: { x: 5, y: 3.55, z: 0 } };
    helmet.update(0.016, player, input(['KeyE']));
    assert.equal(helmet.state, 'floor');                                // longe: E não faz nada
    player.position.x = 0.8;
    helmet.update(0.016, player, input());
    assert.equal(helmet.nearby, true);
    assert.equal(helmet.state, 'floor');                                // perto, sem apertar E
    let picked = 0;
    helmet.onPickup = () => picked++;
    helmet.update(0.016, player, input(['KeyE']));
    assert.equal(helmet.state, 'flying');
    assert.equal(picked, 1);
    for (let i = 0; i < 60; i++) helmet.update(1 / 60, player, input());
    assert.equal(helmet.state, 'worn');
});

test('outro andar não conta: capacete no 2º andar não é pego do térreo', () => {
    const helmet = new Helmet(gl, { x: 0, z: 0 }, 3.55);
    helmet.update(0.016, { position: { x: 0, y: 0.15, z: 0 } }, input(['KeyE']));
    assert.equal(helmet.state, 'floor');
});

test('luz no chão é omni e fraca; depois de pego vira spot sobre a cabeça e acompanha a câmera', () => {
    const camera = new FPSCamera();
    camera.position = { x: 0, y: 5.15, z: 0 };
    const helmet = new Helmet(gl, { x: 2, z: -2, yaw: 0 }, 3.55);
    const floor = helmet.light(camera, 1);
    assert.ok(floor.outerCos < -1 && floor.innerCos < -1);              // omni: cone cobre todas as direções
    assert.ok(floor.position[1] > 3.55 && floor.position[1] < 3.9);     // lâmpada rente ao chão
    assert.ok(Math.max(...floor.color) < 1);

    helmet.state = 'worn';
    const worn = helmet.light(camera, 1);
    assert.ok(worn.outerCos > 0.7 && worn.outerCos < worn.innerCos);    // cone com borda suave
    assert.ok(Math.max(...worn.color) > 1.5);
    assert.ok(near(worn.direction, [0, 0, -1]));
    assert.ok(near(worn.position, [0, 5.32, -0.04]));

    // Olhando para a direita e para cima: a luz acompanha a mira e continua acima da cabeça.
    camera.yaw = -Math.PI / 2; camera.pitch = Math.PI / 4;
    const moved = helmet.light(camera, 1);
    const expected = normalize([Math.cos(Math.PI / 4), Math.sin(Math.PI / 4), 0]);
    assert.ok(near(moved.direction, expected, 1e-6), moved.direction.join());
    camera.position = { x: 10, y: 5.15, z: 4 };
    assert.ok(helmet.light(camera, 1).position[0] > 9.5);               // a luz se move junto com o jogador
});

test('durante o voo a luz muda continuamente do chão para a cabeça', () => {
    const camera = new FPSCamera();
    camera.position = { x: 0, y: 5.15, z: 0 };
    const helmet = new Helmet(gl, { x: 2, z: -2 }, 3.55);
    helmet.state = 'flying';
    const heights = [0, 0.25, 0.5, 0.75, 1].map(t => { helmet.t = t; return helmet.light(camera, 0).outerCos; });
    for (let i = 1; i < heights.length; i++) assert.ok(heights[i] >= heights[i - 1] - 1e-9);
    assert.ok(heights[0] < 0 && heights[4] > 0.7);
});

test('lâmpada no chão oscila, e a lanterna presa à cabeça é estável', () => {
    const camera = new FPSCamera();
    const helmet = new Helmet(gl, { x: 0, z: 0 }, 0);
    const samples = [0, 0.05, 0.11, 0.2, 0.31].map(t => helmet.light(camera, t).color[0]);
    assert.ok(Math.max(...samples) - Math.min(...samples) > 0.05);
    helmet.state = 'worn';
    assert.equal(helmet.light(camera, 0).color[0], helmet.light(camera, 0.2).color[0]);
});

test('jogo é bem mais escuro que o menu', () => {
    const camera = new FPSCamera();
    const helmet = new Helmet(gl, { x: 0, z: 0 }, 0);
    const game = gameLighting(camera, helmet, 0), menu = menuLighting(camera);
    assert.ok(Math.max(...game.ambient) < 0.06);
    assert.ok(Math.max(...menu.ambient) > 0.4);
    assert.deepEqual(game.sun.color, [0, 0, 0]);
});

test('MTL: Ks e Ns viram material de Phong; sem Ks o padrão é usado', () => {
    const materials = OBJLoader.parseMTL('newmtl A\nKd 1 0 0\nKs 0.3 0.3 0.3\nNs 250\nnewmtl B\nKd 0 1 0\nNs 0');
    assert.ok(Math.abs(materials.get('A').specular - 0.3) < 1e-9);
    assert.equal(materials.get('A').shininess, 128);                    // limitado
    assert.equal(materials.get('B').shininess, 1);
    const parsed = OBJLoader.parse('v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl A\nf 1 2 3', materials);
    assert.ok(Math.abs(parsed.specular - 0.3) < 1e-9);
    assert.equal(OBJLoader.parse('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3').specular, 0.2);
});

test('hemisfério tem só a metade de cima da esfera', () => {
    const dome = Mesh.sphere(gl, 10, 20, true), full = Mesh.sphere(gl, 10, 20);
    assert.ok(dome.vertexCount < full.vertexCount * 0.6);
});

test('Mesh.draw envia material de Phong', () => {
    const sent = {};
    const fake = { ...gl, uniformMatrix4fv() {}, uniformMatrix3fv() {}, uniform4fv() {}, uniform1i() {}, drawArrays() {},
        uniform1f: (n, v) => { sent[n] = v; }, uniform3fv: (n, v) => { sent[n] = [...v]; },
        enableVertexAttribArray() {}, vertexAttribPointer() {}, disableVertexAttribArray() {}, vertexAttrib4f() {} };
    const mesh = Mesh.box(fake);
    mesh.specular = 0.7; mesh.shininess = 90; mesh.emissive = [1, 0, 0];
    mesh.draw({ attribs: { a_position: 0 }, uniforms: { u_specular: 'u_specular', u_shininess: 'u_shininess', u_emissive: 'u_emissive' } });
    assert.deepEqual(sent, { u_specular: 0.7, u_shininess: 90, u_emissive: [1, 0, 0] });
});
