class WaitingScreen {
    MIN_LOAD_TIME_MS = 20

    state = {
        minLoadTimeElapsed: false,
        userHasClicked: false,
        isStarted: false
    }

    init() {
        this.screenElement = document.getElementById('waiting-screen')
        this.buttonElement = document.getElementById('waiting-screen-start-btn')
        this.startTimer()
        this.bindEvents()
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
            console.error('WaitingScreen', 'Failed to load main application:', error)
        }
    }
}

new WaitingScreen().init()
