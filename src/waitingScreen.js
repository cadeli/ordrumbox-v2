const WaitingScreen = {
  MIN_LOAD_TIME_MS: 20,
  
  state: {
    minLoadTimeElapsed: false,
    userHasClicked: false,
    isStarted: false
  },
  
  init() {
    this.createDOM();
    this.startTimer();
    this.bindEvents();
  },
  
  createDOM() {
    const container = document.getElementById('insert-ordrumbox-v2-here');
    if (!container) {
      console.error('Container #insert-ordrumbox-v2-here not found');
      return;
    }

    const screen = document.createElement('div');
    screen.id = 'waiting-screen';
    Object.assign(screen.style, {
      width: '100%',
      height: '100%',
      minHeight: '600px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#121212',
      fontFamily: 'system-ui, sans-serif',
      boxSizing: 'border-box'
    });
    
    const btn = document.createElement('button');
    btn.id = 'waiting-screen-start-btn';
    btn.textContent = 'Start orDrumbox V2';
    Object.assign(btn.style, {
      padding: '20px 40px',
      fontSize: '18px',
      fontWeight: 'bold',
      backgroundColor: '#ff9800',
      color: '#000000',
      border: '3px solid #ffffff',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'background-color 0.2s, transform 0.1s',
      boxShadow: '0 4px 15px rgba(255, 152, 0, 0.5)'
    });
    
    const greenColor = '#ff9800';
    const greenHover = '#ffb74d';
    const blueColor = '#ff5722';
    const blueHover = '#ff8a65';
    
    btn.onmouseover = () => { 
      btn.style.backgroundColor = this.state.minLoadTimeElapsed ? blueHover : greenHover; 
    };
    btn.onmouseout = () => { 
      btn.style.backgroundColor = this.state.minLoadTimeElapsed ? blueColor : greenColor; 
    };
    btn.onmousedown = () => { btn.style.transform = 'scale(0.98)'; };
    btn.onmouseup = () => { btn.style.transform = 'scale(1)'; };
    
    screen.appendChild(btn);
    container.appendChild(screen);
    
    this.screenElement = screen;
    this.buttonElement = btn;
  },
  
  startTimer() {
    setTimeout(() => {
      this.state.minLoadTimeElapsed = true;
      if (this.buttonElement) {
        this.buttonElement.style.backgroundColor = '#2196F3';
      }
    }, this.MIN_LOAD_TIME_MS);
  },
  
  bindEvents() {
    this.buttonElement?.addEventListener('click', () => {
      this.handleStartClick();
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.state.minLoadTimeElapsed && !this.state.isStarted) {
        this.handleStartClick();
      }
    });
  },
  
  handleStartClick() {
    if (this.state.isStarted || !this.state.minLoadTimeElapsed) {
      this.state.userHasClicked = true;
      return;
    }
    
    this.state.isStarted = true;
    this.state.userHasClicked = true;
    
    this.hide();
    this.loadMainApp();
  },
  
  hide() {
    if (this.screenElement) {
      this.screenElement.style.display = 'none';
    }
  },
  
  async loadMainApp() {
    try {
      const mainModule = await import('./main.js');
      
      if (typeof mainModule.init === 'function') {
        mainModule.init();
      }
    } catch (error) {
      console.error('Failed to load main application:', error);
    }
  }
};

WaitingScreen.init();