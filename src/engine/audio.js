// Pools limitados permitem sobrepor tiros/golpes sem criar elementos a cada ação.
// Falha de mídia/autoplay nunca interrompe a simulação.
export class GameAudio {
    constructor(createAudio = url => new Audio(url)) {
        this.active = false;
        this.muted = false;
        this.pools = new Map();
        this.baseVolumes = new Map(); // volume de cada elemento com o volume geral em 100%
        this.masterVolume = 1;
        for (const [name, count, volume, extension = 'mp3'] of [
            ['pistola', 4, 0.3], ['akm', 4, 0.3], ['escopeta', 4, 0.3],
            ['sniper', 4, 0.3],
            ['soco', 2, 0.55, 'wav'], ['katana', 2, 0.45, 'wav'],
        ]) {
            const pool = Array.from({ length: count }, () => {
                const audio = createAudio(new URL(`../../assets/audio/${name}.${extension}`, import.meta.url).href);
                audio.preload = 'auto';
                audio.volume = volume;
                this.baseVolumes.set(audio, volume);
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

    // Volume geral de 0 a 1, aplicado sobre o volume próprio de cada efeito.
    setMasterVolume(value) {
        const master = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
        this.masterVolume = master;
        for (const [audio, base] of this.baseVolumes) audio.volume = base * master;
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
        this.baseVolumes.clear();
    }
}
