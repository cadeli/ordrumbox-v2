import Utils from '../utils.js'
//TODO.   
export class MfTwostatesBtn extends HTMLElement {

  constructor(parentDiv, id, label, initialState = false) {
    super();
    this.attachShadow({ mode: 'open' });
    this.id = id;
    this.label = label;
    this.state = initialState;
    this.el = Utils.createMfElement("div", "id", "twostates mf-button", parentDiv)
    this.el.innerText = label;

    this._render();

    this.el.addEventListener('click', () => this.toggle());
  }

  /* ===== PUBLIC API ===== */

  toggle() {
    this.state = !this.state;
    this._render();

    this.el.dispatchEvent(
      new CustomEvent('change', {
        detail: { state: this.state },
        bubbles: true
      })
    );
  }

  setState(value) {
    this.state = Boolean(value);
    this._render();
  }

  getState() {
    return this.state;
  }

  getElement() {
    return this.el;
  }

  /* ===== PRIVATE ===== */

  _render() {
    this.el.classList.toggle('on', this.state);
  }
}
