const MOVEMENT_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space']);

export class InputHandler {
    constructor(canvas, { onLockChange, onPause, onError }) {
        this.canvas = canvas;
        this.keys = new Set();
        this.mouse = { x: 0, y: 0 };
        this.events = new AbortController();
        const options = { signal: this.events.signal };
        this.onError = onError;

        window.addEventListener('keydown', event => {
            if (event.code === 'KeyP') {
                event.preventDefault();
                if (!event.repeat) onPause();
                return;
            }
            if (this.locked && MOVEMENT_CODES.has(event.code)) {
                event.preventDefault();
                this.keys.add(event.code);
            }
        }, options);
        window.addEventListener('keyup', event => this.keys.delete(event.code), options);
        document.addEventListener('mousemove', event => {
            if (this.locked) {
                this.mouse.x += event.movementX;
                this.mouse.y += event.movementY;
            }
        }, options);
        document.addEventListener('pointerlockchange', () => {
            this.reset();
            onLockChange(this.locked);
        }, options);
        document.addEventListener('pointerlockerror', () => {
            onError('Não foi possível capturar o mouse. Clique em Entrar para tentar novamente.');
        }, options);
        const loseFocus = () => {
            this.unlock();
            onLockChange(false);
        };
        window.addEventListener('blur', loseFocus, options);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) loseFocus();
        }, options);
    }

    get locked() {
        return document.pointerLockElement === this.canvas;
    }

    async lock() {
        try {
            await this.canvas.requestPointerLock();
        } catch {
            this.onError('O navegador não capturou o mouse. Clique em Entrar para tentar novamente.');
        }
    }

    unlock() {
        this.reset();
        if (this.locked) document.exitPointerLock();
    }

    isPressed(code) {
        return this.keys.has(code);
    }

    getMouseDelta() {
        const delta = this.mouse;
        this.mouse = { x: 0, y: 0 };
        return delta;
    }

    reset() {
        this.keys.clear();
        this.mouse = { x: 0, y: 0 };
    }

    dispose() {
        this.events.abort();
        this.unlock();
    }
}
