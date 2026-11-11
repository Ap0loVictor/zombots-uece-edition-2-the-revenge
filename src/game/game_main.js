import { initGL, resizeCanvas } from '../engine/gl.js';
import { Shaders } from '../engine/shaders.js';
import { OBJLoader } from '../engine/obj_loader.js';
import { InputHandler } from '../engine/input.js';
import { intersectsAABB } from '../engine/collision.js';
import { Level } from './level.js';
import { Player } from './player.js';

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
        this.showOverlay('Arena de testes', 'Explore o mapa. Olhe para baixo para ver o corpo provisório do jogador.');
        this.lastTime = performance.now();
        this.animationFrame = requestAnimationFrame(this.frame);
    }

    enter() {
        if (this.state === 'ready' || this.state === 'paused') this.input.lock();
    }

    setPlaying(playing) {
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
            if (this.state === 'playing') this.player.update(this.input, dt, this.level.colliders);
            this.render();
        } catch (error) {
            this.fail(error);
            return;
        }
        this.animationFrame = requestAnimationFrame(this.frame);
    }

    render() {
        const gl = this.gl;
        resizeCanvas(gl);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.programInfo.program);
        gl.uniformMatrix4fv(this.programInfo.uniforms.u_view, false, this.player.camera.getViewMatrix());
        gl.uniformMatrix4fv(this.programInfo.uniforms.u_projection, false,
            this.player.camera.getProjectionMatrix(gl.canvas.width / gl.canvas.height));
        this.level.draw(this.programInfo);
        this.player.draw(this.programInfo);
    }

    fail(error) {
        console.error(error);
        this.state = 'error';
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
        if (this.programInfo) this.gl.deleteProgram(this.programInfo.program);
    }
}
