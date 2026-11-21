import { initGL, resizeCanvas } from '../engine/gl.js';
import { Shaders } from '../engine/shaders.js';
import { OBJLoader } from '../engine/obj_loader.js';
import { Mesh } from '../engine/mesh.js';
import { InputHandler } from '../engine/input.js';
import { intersectsAABB } from '../engine/collision.js';
import { Level } from './level.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { GameAudio } from '../engine/audio.js';
import { Enemy } from './enemy.js';

export class Game {
    constructor(canvas, ui) {
        this.canvas = canvas;
        this.ui = ui;
        this.state = 'loading';
        this.events = new AbortController();
        this.frame = this.frame.bind(this);
    }

    async init() {
        this.gl = initGL(this.canvas);
        this.programInfo = Shaders.createProgram(this.gl);
        this.canvas.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            this.fail(new Error('O contexto gráfico foi perdido. Recarregue a página para continuar.'));
        }, { signal: this.events.signal });

        const [level, playerMesh] = await Promise.all([
            Level.load(this.gl, new URL('../../assets/map/test_level.json', import.meta.url)),
            OBJLoader.load(this.gl, new URL('../../assets/player/cube.obj', import.meta.url)),
        ]);
        this.level = level;
        this.player = new Player(level.spawn, playerMesh);
        this.groundHeightAt = (x, z, y) => this.level.groundHeight(x, z, y);
        this.player.position.y = this.groundHeightAt(this.player.position.x, this.player.position.z);
        this.player.syncCamera();
        this.weapons = await WeaponSystem.load(this.gl);
        this.audio = new GameAudio();
        this.weapons.onShoot = weapon => this.audio.play(weapon.sound);
        this.enemyMesh = Mesh.box(this.gl);
        this.enemies = [
            new Enemy('Zumbi', { x: -6, y: 0, z: -5 }, [0.12, 0.68, 0.22, 1]),
            new Enemy('Robô', { x: 6, y: 0, z: -5 }, [0.12, 0.38, 0.9, 1]),
            new Enemy('Zombot', { x: 0, y: 0, z: -7 }, [0.04, 0.04, 0.05, 1]),
        ];
        if (level.colliders.some(box => intersectsAABB(this.player.collider, box))) {
            throw new Error('A posição inicial do jogador está dentro de um obstáculo.');
        }
        if (this.state === 'error') return;

        this.input = new InputHandler(this.canvas, {
            onLockChange: locked => this.setPlaying(locked),
            onPause: () => this.state === 'playing' ? this.pause() : this.enter(),
            onError: message => {
                if (this.state === 'error') return;
                this.pause();
                this.ui.description.textContent = message;
            },
        });
        const options = { signal: this.events.signal };
        this.ui.button.addEventListener('click', () => this.enter(), options);
        this.canvas.addEventListener('click', () => this.enter(), options);
        this.state = 'ready';
        this.ui.button.disabled = false;
        this.showOverlay('Campus UECE', 'Explore o mapa com Shift para correr e Espaço para pular. Encontre o zumbi verde, o robô azul e o Zombot preto.');

        this.lastTime = performance.now();
        this.animationFrame = requestAnimationFrame(this.frame);
    }

    enter() {
        if (this.state === 'ready' || this.state === 'paused') {
            this.input.lock();
        }
    }

    setPlaying(playing) {
        this.audio?.setPlaying(playing && this.state !== 'error');
        if (this.state === 'error') {
            if (playing) this.input?.unlock();
            return;
        }
        if (playing) {
            this.state = 'playing';
            this.lastTime = performance.now();
            this.ui.overlay.hidden = true;
            this.ui.crosshair.hidden = false;
            this.ui.status.textContent = 'EM JOGO';
        } else if (this.state === 'playing') {
            this.state = 'paused';
            this.ui.button.textContent = 'Continuar';
            this.showOverlay('Pausado', 'Clique em Continuar ou pressione P para voltar à arena.');
        }
    }

    pause() {
        this.input?.unlock();
        this.setPlaying(false);
    }

    showOverlay(title, description) {
        this.ui.title.textContent = title;
        this.ui.description.textContent = description;
        this.ui.overlay.hidden = false;
        this.ui.crosshair.hidden = true;
        this.ui.status.textContent = this.state === 'ready' ? 'PRONTO' : 'PAUSADO';
    }

    frame(time) {
        if (this.state === 'error') return;
        // Evita saltos após uma aba suspensa ou um frame excessivamente demorado.
        const dt = Math.max(0, Math.min((time - this.lastTime) / 1000, 0.05));
        this.lastTime = time;
        try {
            if (this.state === 'playing') this.update(dt);
            this.render(time / 1000);
        } catch (error) {
            this.fail(error);
            return;
        }
        this.animationFrame = requestAnimationFrame(this.frame);
    }

    update(dt) {
        // Ambos os lados recebem os mesmos AABBs, portanto ninguém atravessa o outro.
        this.player.update(this.input, dt, [...this.level.colliders, ...this.enemies.map(enemy => enemy.collider)], this.groundHeightAt);
        if (this.input.consumePress('KeyM')) this.audio.toggleMute();
        this.weapons.update(dt, this.input, this.player.camera);
        this.ui.status.textContent = `${this.weapons.selected + 1} · ${this.weapons.equipped.name} · SOM ${this.audio.muted ? 'DESLIGADO' : 'LIGADO'}`;
        for (const enemy of this.enemies) {
            const obstacles = [
                ...this.level.colliders,
                this.player.collider,
                ...this.enemies.filter(other => other !== enemy).map(other => other.collider),
            ];
            enemy.update(dt, this.player.position, obstacles);
        }
    }

    render(elapsed) {
        const gl = this.gl;
        resizeCanvas(gl);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.programInfo.program);
        gl.uniformMatrix4fv(this.programInfo.uniforms.u_view, false, this.player.camera.getViewMatrix());
        gl.uniformMatrix4fv(this.programInfo.uniforms.u_projection, false,
            this.player.camera.getProjectionMatrix(gl.canvas.width / gl.canvas.height));
        this.level.draw(this.programInfo);
        for (const enemy of this.enemies) enemy.draw(this.enemyMesh, this.programInfo, elapsed);
        this.player.draw(this.programInfo);
        this.weapons.drawProjectiles(this.programInfo);
        this.weapons.drawWeapon(gl, this.programInfo);
    }

    fail(error) {
        console.error(error);
        this.state = 'error';
        this.audio?.setPlaying(false);
        cancelAnimationFrame(this.animationFrame);
        this.input?.unlock();
        this.showOverlay('Não foi possível iniciar ou continuar', error.message);
        this.ui.status.textContent = 'ERRO';
        this.ui.button.disabled = true;
    }

    dispose() {
        cancelAnimationFrame(this.animationFrame);
        this.events.abort();
        this.input?.dispose();
        this.level?.dispose();
        this.player?.mesh.dispose();
        this.enemyMesh?.dispose();
        this.weapons?.dispose();
        this.audio?.dispose();
        if (this.programInfo) this.gl.deleteProgram(this.programInfo.program);
    }
}