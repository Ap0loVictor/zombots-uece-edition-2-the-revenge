export const MELEE_DEFINITIONS = [
    { name: 'Soco', sound: 'soco', duration: 0.38 },
    { name: 'Katana', sound: 'katana', duration: 0.62 },
];

// Apenas apresentação: colisões, hitboxes e dano ficam para uma etapa futura.
export class MeleeSystem {
    constructor(view = null) {
        this.view = view;
        this.selected = 0;
        this.attack = null;
        this.onSwing = () => {};
    }

    get equipped() { return MELEE_DEFINITIONS[this.selected]; }
    get attacking() { return this.attack !== null; }

    cycle() {
        this.selected = (this.selected + 1) % MELEE_DEFINITIONS.length;
    }

    swing() {
        if (this.attacking) return;
        // Trocar a seleção durante o golpe não troca sua animação nem seu som.
        this.attack = { index: this.selected, elapsed: 0 };
        this.onSwing(this.equipped);
    }

    update(dt) {
        if (!this.attack) return;
        this.attack.elapsed += dt;
        if (this.attack.elapsed + 1e-9 >= MELEE_DEFINITIONS[this.attack.index].duration) this.attack = null;
    }

    cancel() { this.attack = null; }

    draw(programInfo) {
        const index = this.attack?.index ?? this.selected;
        const progress = this.attack ? this.attack.elapsed / MELEE_DEFINITIONS[index].duration : null;
        this.view?.draw(programInfo, index, progress);
    }

    dispose() {
        this.cancel();
        this.view?.dispose();
    }
}
