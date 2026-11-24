import { DEFAULT_SETTINGS, SETTINGS_SPEC, sanitizeSettings } from './settings.js';
import { CONTROL_GROUPS, CONTROL_TIPS, CREDITS, LORE } from './menu_content.js';

// Menu principal e de pausa. É HTML/CSS comum: nada aqui desenha a cena (isso é só do WebGL).
// A marcação fica em index.html; este módulo liga os eventos e preenche Controles, Lore e Créditos.
export const MENU_VIEWS = ['home', 'settings', 'lore', 'controls', 'credits'];

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export class MenuController {
    constructor(root, { settings = DEFAULT_SETTINGS, onSettingsChange = () => {}, onStart = () => {} } = {}) {
        this.root = root;
        this.settings = sanitizeSettings(settings);
        this.onSettingsChange = onSettingsChange;
        this.onStart = onStart;
        this.paused = false;
        this.loading = false;
        this.view = 'home';
        this.events = new AbortController();
        const options = { signal: this.events.signal };

        this.views = new Map([...root.querySelectorAll('[data-view]')].map(node => [node.dataset.view, node]));
        this.startButton = root.querySelector('[data-action="start"]');
        this.message = root.querySelector('[data-menu-message]');
        this.pausedLabel = root.querySelector('[data-paused-label]');
        this.inputs = [...root.querySelectorAll('[data-setting]')];

        this.renderContent();
        this.setupSettings(options);
        root.addEventListener('click', event => this.onClick(event), options);
        document.addEventListener('keydown', event => this.onKey(event), options);
        this.show('home', { focus: false });
    }

    get isOpen() {
        return !this.root.hidden;
    }

    // ---------- estado ----------

    open({ paused = false } = {}) {
        this.paused = paused;
        this.root.hidden = false;
        this.pausedLabel.hidden = !paused;
        this.updateStartButton();
        this.show('home');
    }

    close() {
        // Sem foco em botões do menu: Espaço (pular) e Enter não podem acioná-los durante o jogo.
        if (this.root.contains(document.activeElement)) document.activeElement.blur();
        this.root.hidden = true;
        this.notify('');
    }

    setLoading(loading) {
        this.loading = loading;
        this.updateStartButton();
        if (!loading && this.isOpen && this.view === 'home') this.startButton.focus({ preventScroll: true });
    }

    updateStartButton() {
        this.startButton.disabled = this.loading;
        this.startButton.textContent = this.loading ? 'Carregando…' : this.paused ? 'Continuar' : 'Jogar';
    }

    notify(text) {
        this.message.textContent = text;
        this.message.hidden = !text;
        if (text && this.view !== 'home') this.show('home');
    }

    show(view, { focus = true } = {}) {
        if (!this.views.has(view)) return;
        this.view = view;
        for (const [name, node] of this.views) node.hidden = name !== view;
        const node = this.views.get(view);
        node.scrollTop = 0;
        this.root.scrollTop = 0;
        if (focus && this.isOpen) {
            // preventScroll: em painéis longos (Controles) o foco no botão do fim não pode esconder o topo.
            node.querySelector('button:not(:disabled), input')?.focus({ preventScroll: true });
        }
    }

    // ---------- eventos ----------

    onClick(event) {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        if (button.dataset.action === 'start') this.onStart();
        else if (button.dataset.action === 'reset-settings') this.resetSettings();
        else if (button.dataset.open) this.show(button.dataset.open);
        else if ('back' in button.dataset) this.show('home');
    }

    onKey(event) {
        if (!this.isOpen) return;
        if (event.code === 'Escape' && this.view !== 'home') {
            event.preventDefault();
            this.show('home');
        } else if ((event.code === 'ArrowDown' || event.code === 'ArrowUp') && document.activeElement?.tagName === 'BUTTON') {
            // Navegação vertical entre botões do mesmo painel (nos sliders, as setas mudam o valor).
            const buttons = [...this.views.get(this.view).querySelectorAll('button:not(:disabled)')];
            const index = buttons.indexOf(document.activeElement);
            if (index === -1 || buttons.length < 2) return;
            event.preventDefault();
            const step = event.code === 'ArrowDown' ? 1 : -1;
            buttons[(index + step + buttons.length) % buttons.length].focus();
        }
    }

    // ---------- configurações ----------

    setupSettings(options) {
        for (const input of this.inputs) {
            const spec = SETTINGS_SPEC[input.dataset.setting];
            if (spec) {
                input.min = spec.min;
                input.max = spec.max;
                input.step = spec.step;
            }
            input.addEventListener('input', () => this.readInput(input), options);
        }
        this.syncInputs();
    }

    readInput(input) {
        const name = input.dataset.setting;
        const value = input.type === 'checkbox' ? input.checked : Number(input.value);
        this.settings = sanitizeSettings({ ...this.settings, [name]: value });
        this.syncInputs();
        this.onSettingsChange({ ...this.settings });
    }

    resetSettings() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.syncInputs();
        this.onSettingsChange({ ...this.settings });
    }

    // Reflete this.settings nos controles e nos textos de valor.
    syncInputs() {
        for (const input of this.inputs) {
            const name = input.dataset.setting;
            if (input.type === 'checkbox') input.checked = this.settings[name];
            else input.value = this.settings[name];
            const output = this.root.querySelector(`[data-output="${name}"]`);
            if (output && SETTINGS_SPEC[name]) output.textContent = `${this.settings[name]}${SETTINGS_SPEC[name].unit}`;
        }
    }

    // ---------- conteúdo ----------

    renderContent() {
        const controls = this.root.querySelector('[data-render="controls"]');
        for (const group of CONTROL_GROUPS) {
            const section = element('section', 'control-group');
            section.append(element('h3', '', group.title));
            const list = element('dl', 'control-list');
            for (const { keys, action } of group.controls) {
                const row = element('div', 'control-row');
                const term = element('dt');
                keys.forEach((combination, index) => {
                    if (index > 0) term.append(element('span', 'key-or', 'ou'));
                    for (const key of combination) term.append(element('kbd', '', key));
                });
                row.append(term, element('dd', '', action));
                list.append(row);
            }
            section.append(list);
            controls.append(section);
        }
        const tips = element('ul', 'control-tips');
        for (const tip of CONTROL_TIPS) tips.append(element('li', '', tip));
        controls.append(tips);

        const lore = this.root.querySelector('[data-render="lore"]');
        for (const paragraph of LORE) lore.append(element('p', '', paragraph));

        const credits = this.root.querySelector('[data-render="credits"]');
        const people = element('ul', 'credits-list');
        for (const person of CREDITS.people) people.append(element('li', '', person));
        credits.append(people, element('p', 'credits-course', CREDITS.course));
    }

    dispose() {
        this.events.abort();
    }
}
