import { initGL, resizeCanvas } from '../engine/gl.js';
import { Shaders } from '../engine/shaders.js';
import { PlayerBody } from './character_model.js';
import { Mesh } from '../engine/mesh.js';
import { InputHandler } from '../engine/input.js';
import { intersectsAABB } from '../engine/collision.js';
import { Level } from './level.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { GameAudio } from '../engine/audio.js';
import { Enemy } from './enemy.js';
import { MenuCamera } from './menu_camera.js';
import { MenuController } from './menu.js';
import { DEFAULT_SETTINGS, fovRadians, loadSettings, lookSpeedFor, saveSettings } from './settings.js';

export class Game {
    constructor(canvas, ui) {
        this.canvas = canvas;
        this.ui = ui;
        this.state = 'loading';
        this.menuCamera = new MenuCamera();
        this.settings = { ...DEFAULT_SETTINGS };
        this.events = new AbortController();
        this.frame = this.frame.bind(this);
    }

    async init() {
        this.gl = initGL(this.canvas);
        this.programInfo = Shaders.createProgram(this.gl);
        // O menu é montado antes do carregamento dos assets: Jogar fica desabilitado até tudo estar pronto.
        this.settings = loadSettings();
        this.menu = new MenuController(this.ui.menu, {
            settings: this.settings,
            onSettingsChange: settings => this.updateSettings(settings),
            onStart: () => this.enter(),
        });
        this.menu.setLoading(true);
        this.canvas.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            this.fail(new Error('O contexto gráfico foi perdido. Recarregue a página para continuar.'));
        }, { signal: this.events.signal });

        const level = await Level.load(this.gl, new URL('../../assets/map/test_level.json', import.meta.url));
        this.level = level;
        this.player = new Player(level.spawn, new PlayerBody(this.gl));
        this.groundHeightAt = (x, z, y) => this.level.groundHeight(x, z, y);
        this.player.position.y = this.groundHeightAt(this.player.position.x, this.player.position.z);
        this.player.syncCamera();
        this.applySettings();
        this.weapons = await WeaponSystem.load(this.gl);
        this.audio = new GameAudio();
        this.applySettings();
        this.weapons.onShoot = weapon => this.audio.play(weapon.sound);
        this.weapons.melee.onSwing = weapon => this.audio.play(weapon.sound);
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
            // P pausa e retoma; no menu inicial só o botão Jogar começa a partida.
            onPause: () => {
                if (this.state === 'playing') this.pause();
                else if (this.state === 'paused') this.enter();
            },
            onError: message => {
                if (this.state === 'error') return;
                this.pause();
                this.menu.notify(message);
            },
        });
        const options = { signal: this.events.signal };
        this.state = 'ready';
        // Menu principal: o campus é desenhado ao fundo (câmera em órbita) até o jogador clicar em Jogar.
        this.menu.setLoading(false);
        this.ui.status.textContent = 'MENU';

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
        if (!playing) this.weapons?.melee.cancel();
        if (this.state === 'error') {
            if (playing) this.input?.unlock();
            return;
        }
        if (playing) {
            this.state = 'playing';
            this.lastTime = performance.now();
            this.menu?.close();
            this.ui.hud.hidden = false;
            this.ui.crosshair.hidden = false;
            this.ui.status.textContent = 'EM JOGO';
        } else if (this.state === 'playing') {
            this.state = 'paused';
            this.ui.crosshair.hidden = true;
            this.ui.status.textContent = 'PAUSADO';
            this.menu?.open({ paused: true });
        }
    }

    pause() {
        this.input?.unlock();
        this.setPlaying(false);
    }

    // Tela de erro fatal (o menu e a pausa usam MenuController).
    showOverlay(title, description) {
        this.ui.title.textContent = title;
        this.ui.description.textContent = description;
        this.menu?.close();
        this.ui.menu.hidden = true;
        this.ui.overlay.hidden = false;
        this.ui.crosshair.hidden = true;
    }

    updateSettings(settings) {
        this.settings = settings;
        saveSettings(settings);
        this.applySettings();
    }

    // Aplica as configurações ao que já existe; pode ser chamado de novo quando player/áudio forem criados.
    applySettings() {
        const settings = this.settings;
        if (this.player) {
            this.player.camera.lookSpeed = lookSpeedFor(settings);
            this.player.camera.fov = fovRadians(settings);
        }
        this.audio?.setMasterVolume(settings.volume / 100);
        if (this.ui.hints) this.ui.hints.hidden = !settings.showHints;
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
        const held = this.weapons.showingMelee ? 'MELEE' : `${this.weapons.selected + 1} · ${this.weapons.equipped.name}`;
        this.ui.status.textContent = `${held} · Q / F: ${this.weapons.melee.equipped.name} · SOM ${this.audio.muted ? 'DESLIGADO' : 'LIGADO'}`;
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
        const inMenu = this.state === 'ready';
        const camera = inMenu ? this.menuCamera.at(elapsed) : this.player.camera;
        gl.uniformMatrix4fv(this.programInfo.uniforms.u_view, false, camera.getViewMatrix());
        gl.uniformMatrix4fv(this.programInfo.uniforms.u_projection, false,
            camera.getProjectionMatrix(gl.canvas.width / gl.canvas.height));
        this.level.draw(this.programInfo);
        for (const enemy of this.enemies) enemy.draw(this.enemyMesh, this.programInfo, elapsed);
        if (inMenu) return; // sem corpo, armas ou projéteis de primeira pessoa no menu
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
    }

    dispose() {
        cancelAnimationFrame(this.animationFrame);
        this.events.abort();
        this.input?.dispose();
        this.menu?.dispose();
        this.level?.dispose();
        this.player?.mesh.dispose();
        this.enemyMesh?.dispose();
        this.weapons?.dispose();
        this.audio?.dispose();
        if (this.programInfo) this.gl.deleteProgram(this.programInfo.program);
    }
}
