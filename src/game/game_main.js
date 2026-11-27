import { initGL, resizeCanvas } from '../engine/gl.js';
import { Shaders } from '../engine/shaders.js';
import { PlayerBody } from './character_model.js';
import { InputHandler } from '../engine/input.js';
import { intersectsAABB } from '../engine/collision.js';
import { Level } from './level.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { GameAudio } from '../engine/audio.js';
import { Enemy } from './enemy.js';
import { OBJLoader } from '../engine/obj_loader.js';
import { applyLighting } from '../engine/lighting.js';
import { Helmet } from './helmet.js';
import { GAME_CLEAR_COLOR, MENU_CLEAR_COLOR, VIEWMODEL_AMBIENT, VIEWMODEL_LIGHT_SCALE, gameLighting, menuLighting } from './lighting.js';
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
        // O capacete fica no chão do mesmo andar do spawn.
        const helmetSpot = level.helmet;
        this.helmet = new Helmet(this.gl, helmetSpot, this.groundHeightAt(helmetSpot.x, helmetSpot.z, level.spawn.y));
        this.applySettings();
        const [weapons, zombieMesh, robotMesh, zombotMesh] = await Promise.all([
            WeaponSystem.load(this.gl),
            OBJLoader.load(this.gl, new URL('../../assets/enemies/zumbi_zomot/zumbi_zomot.obj', import.meta.url)),
            OBJLoader.load(this.gl, new URL('../../assets/enemies/robo/robo.obj', import.meta.url)),
            OBJLoader.load(this.gl, new URL('../../assets/enemies/zombot/zombot.obj', import.meta.url)),
        ]);
        this.weapons = weapons;
        // Projéteis brilham no escuro.
        this.weapons.bulletMesh.emissive = [1, 0.8, 0.35];
        this.enemyMeshes = { Zumbi: zombieMesh, 'Robô': robotMesh, Zombot: zombotMesh };
        this.audio = new GameAudio();
        this.applySettings();
        this.weapons.onShoot = weapon => this.audio.play(weapon.sound);
        this.weapons.melee.onSwing = weapon => this.audio.play(weapon.sound);
        this.enemies = [
            new Enemy('Zumbi', { x: -6, y: 0, z: -5 }, [0.12, 0.68, 0.22, 1]),
            new Enemy('Robô', { x: 6, y: 0, z: -5 }, [0.12, 0.38, 0.9, 1]),
            new Enemy('Zombot', { x: 0, y: 0, z: -7 }, [0.04, 0.04, 0.05, 1]),
        ];
        for (const enemy of this.enemies) {
            enemy.position.y = this.groundHeightAt(enemy.position.x, enemy.position.z, enemy.position.y);
        }
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
            this.updateAmmoHUD();
            this.ui.status.textContent = 'EM JOGO';
        } else if (this.state === 'playing') {
            this.state = 'paused';
            if (this.ui.ammo) this.ui.ammo.hidden = true;
            this.ui.crosshair.hidden = true;
            if (this.ui.prompt) this.ui.prompt.hidden = true;
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
        if (this.ui.ammo) this.ui.ammo.hidden = true;
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
        this.helmet.update(dt, this.player, this.input);
        this.updatePrompt();
        this.weapons.update(dt, this.input, this.player.camera);
        this.updateAmmoHUD();
        const held = this.weapons.showingMelee ? 'MELEE' : `${this.weapons.selected + 1} · ${this.weapons.equipped.name}`;
        this.ui.status.textContent = `${held} · Q / F: ${this.weapons.melee.equipped.name} · SOM ${this.audio.muted ? 'DESLIGADO' : 'LIGADO'}`;
        for (const enemy of this.enemies) {
            const obstacles = [
                ...this.level.colliders,
                this.player.collider,
                ...this.enemies.filter(other => other !== enemy).map(other => other.collider),
            ];
            enemy.update(dt, this.player.position, obstacles, this.groundHeightAt);
        }
    }

    // Dica na tela: guia o jogador até o capacete e confirma a lanterna.
    updatePrompt() {
        const prompt = this.ui.prompt;
        if (!prompt) return;
        const helmet = this.helmet;
        let text = '';
        if (helmet.state === 'floor') text = helmet.nearby ? 'E · Pegar o capacete' : 'Algo brilha no chão da sala…';
        else if (helmet.sincePickup < 3.5) text = 'Lanterna do capacete ligada';
        prompt.textContent = text;
        prompt.hidden = !text || this.state !== 'playing';
    }

    updateAmmoHUD() {
        if (!this.ui.ammo) return;
        this.ui.ammo.hidden = this.state !== 'playing' || this.weapons.showingMelee;
        const weapon = this.weapons.equipped;
        this.ui.ammoWeapon.textContent = weapon.name;
        const low = weapon.ammo <= Math.ceil(weapon.magazineSize * 0.25);
        this.ui.ammoCount.textContent = String(weapon.ammo);
        this.ui.ammoCapacity.textContent = String(weapon.magazineSize);
        this.ui.ammo.dataset.low = String(low);
        this.ui.ammo.dataset.reloading = String(this.weapons.reloading);
        this.ui.ammoProgress.style.transform = `scaleX(${this.weapons.reloadProgress})`;
        this.ui.ammo.setAttribute('aria-label', `${weapon.name}: ${weapon.ammo} de ${weapon.magazineSize} munições`);
        this.ui.ammoHint.textContent = this.weapons.reloading
            ? 'Recarregando'
            : low ? 'R · Recarregar' : '';
    }

    render(elapsed) {
        const gl = this.gl;
        resizeCanvas(gl);
        const inMenu = this.state === 'ready';
        gl.clearColor(...(inMenu ? MENU_CLEAR_COLOR : GAME_CLEAR_COLOR));
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.programInfo.program);
        const camera = inMenu ? this.menuCamera.at(elapsed) : this.player.camera;
        const uniforms = this.programInfo.uniforms;
        gl.uniformMatrix4fv(uniforms.u_view, false, camera.getViewMatrix());
        gl.uniformMatrix4fv(uniforms.u_projection, false,
            camera.getProjectionMatrix(gl.canvas.width / gl.canvas.height));
        const lighting = inMenu ? menuLighting(camera) : gameLighting(camera, this.helmet, elapsed);
        applyLighting(gl, uniforms, lighting);
        this.level.draw(this.programInfo);
        for (const enemy of this.enemies) enemy.draw(this.enemyMeshes[enemy.name], this.programInfo, elapsed);
        if (inMenu) return; // sem capacete, corpo, armas ou projéteis de primeira pessoa no menu
        this.helmet.draw(this.programInfo, camera);
        this.player.draw(this.programInfo);
        this.weapons.drawProjectiles(this.programInfo);
        // Passagem FPS: armas e braços são desenhados em coordenadas de câmera (u_view = identidade),
        // então a luz é convertida para o espaço da câmera e ganha um pouco de ambiente extra.
        const light = { ...lighting.light, color: lighting.light.color.map(value => value * VIEWMODEL_LIGHT_SCALE) };
        applyLighting(gl, uniforms, { ...lighting, ambient: VIEWMODEL_AMBIENT, light }, camera.getViewMatrix());
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
        this.helmet?.dispose();
        this.player?.mesh.dispose();
        Object.values(this.enemyMeshes ?? {}).forEach(mesh => mesh.dispose());
        this.weapons?.dispose();
        this.audio?.dispose();
        if (this.programInfo) this.gl.deleteProgram(this.programInfo.program);
    }
}
