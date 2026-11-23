// Pools limitados permitem sobrepor tiros/golpes sem criar elementos a cada ação.
// Falha de mídia/autoplay nunca interrompe a simulação.
export class GameAudio {
    constructor(createAudio = url => new Audio(url)) {
        this.active = false;
        this.muted = false;
        this.pools = new Map();
        for (const [name, count, volume, extension = 'mp3'] of [
            ['pistola', 4, 0.3], ['akm', 4, 0.3], ['escopeta', 4, 0.3],
            ['sniper', 4, 0.3],
            ['soco', 2, 0.55, 'wav'], ['katana', 2, 0.45, 'wav'],
        ]) {
            const pool = Array.from({ length: count }, () => {
                const audio = createAudio(new URL(`../../assets/audio/${name}.${extension}`, import.meta.url).href);
                audio.preload = 'auto';
                audio.volume = volume;
                audio.loop = false;
                return audio;
            });
            this.pools.set(name, pool);
        }
    }

    play(name) {
        if (!this.active || this.muted) return;
        const pool = this.pools.get(name);
        if (!pool) return;
        const audio = pool.find(item => item.paused || item.ended) ?? pool[0];
        try {
            audio.currentTime = 0;
            audio.play()?.catch(() => {});
        } catch { /* Mídia indisponível: mantém o jogo funcionando. */ }
    }

    setPlaying(active) {
        this.active = active;
        if (!active) this.stop();
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.muted) this.stop();
    }

    stop() {
        for (const pool of this.pools.values()) for (const audio of pool) {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    dispose() {
        this.active = false;
        this.stop();
        for (const pool of this.pools.values()) for (const audio of pool) {
            audio.removeAttribute('src');
            audio.load();
        }
        this.pools.clear();
    }
}
