class WaitingScreen {
    MIN_LOAD_TIME_MS = 20

    state = {
        minLoadTimeElapsed: false,
        userHasClicked: false,
        isStarted: false
    }

    init() {
        this.injectCSS()
        this.createDOM()
        this.startTimer()
        this.bindEvents()
    }

    injectCSS() {
        if (document.getElementById('ui-styles')) return
        const link = document.createElement('link')
        link.id = 'ui-styles'
        link.rel = 'stylesheet'
        link.href = new URL('./ui/styles.css', import.meta.url).href
        document.head.appendChild(link)
    }

    createDOM() {
        const container = document.getElementById('insert-ordrumbox-v2-here')
        if (!container) {
            console.error('Container #insert-ordrumbox-v2-here not found')
            return
        }

        const screen = document.createElement('div')
        screen.id = 'waiting-screen'

        const btn = document.createElement('button')
        btn.id = 'waiting-screen-start-btn'
        btn.textContent = 'Start orDrumbox V2'

        screen.appendChild(btn)
        container.appendChild(screen)

        this.screenElement = screen
        this.buttonElement = btn
    }

    startTimer() {
        setTimeout(() => {
            this.state.minLoadTimeElapsed = true
            if (this.buttonElement) {
                this.buttonElement.classList.add('ready')
            }
        }, this.MIN_LOAD_TIME_MS)
    }

    bindEvents() {
        this.buttonElement?.addEventListener('click', () => {
            this.handleStartClick()
        })

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.state.minLoadTimeElapsed && !this.state.isStarted) {
                this.handleStartClick()
            }
        })
    }

    handleStartClick() {
        if (this.state.isStarted || !this.state.minLoadTimeElapsed) {
            this.state.userHasClicked = true
            return
        }

        this.state.isStarted = true
        this.state.userHasClicked = true

        this.hide()
        this.loadMainApp()
    }

    hide() {
        if (this.screenElement) {
            this.screenElement.style.display = 'none'
        }
    }

    async loadMainApp() {
        try {
            const mainModule = await import('./main.js')

            if (typeof mainModule.init === 'function') {
                mainModule.init()
            }
        } catch (error) {
            console.error('Failed to load main application:', error)
        }
    }
}

new WaitingScreen().init()
