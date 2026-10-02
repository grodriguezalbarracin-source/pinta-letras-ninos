import { FULL_ALPHABET, getResolutionConfig, createSampleCatCanvas } from "../constants/alphabet.js";
import { ImageProcessorService } from "../services/imageProcessor.js";

export class LetterPaintModule {
  constructor(audioService) {
    this.audio = audioService;

    this.gridSize = 32;
    this.grid = [];
    this.palette = [];
    this.activeLetter = null;

    this.totalTiles = 0;
    this.paintedCount = 0;
    this.currentImage = null;

    this.brushMode = "continuous";
    this.isPainting = false;

    // Transformaciones
    this.WORLD_SIZE = 1200;
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;

    // Punteros táctiles
    this.activePointers = new Map();
    this.prevPinchDist = null;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.hasMoved = false;

    // Elementos DOM
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.confettiCanvas = document.getElementById("confettiCanvas");
    this.confettiCtx = this.confettiCanvas.getContext("2d");

    this.paletteScroll = document.getElementById("paletteScroll");
    this.activeLetterDisplay = document.getElementById("activeLetterDisplay");
    this.progressPercent = document.getElementById("progressPercent");
    this.zoomLevelDisplay = document.getElementById("zoomLevelDisplay");
    this.welcomeModal = document.getElementById("welcomeModal");
    this.fileInput = document.getElementById("fileInput");
    this.resolutionSelect = document.getElementById("resolutionSelect");
    this.btnLoadSample = document.getElementById("btnLoadSample");

    this._bindEvents();
    this.resizeCanvas();
  }

  _bindEvents() {
    window.addEventListener("resize", () => this.resizeCanvas());

    this.resolutionSelect.addEventListener("change", (e) => {
      this.gridSize = parseInt(e.target.value, 10);
      if (this.currentImage) this.loadImage(this.currentImage);
    });

    this.fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => this.loadImage(img);
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });

    this.btnLoadSample.addEventListener("click", () => {
      const sampleCanvas = createSampleCatCanvas();
      const img = new Image();
      img.onload = () => this.loadImage(img);
      img.src = sampleCanvas.toDataURL();
    });

    // Zoom Buttons
    document.getElementById("btnZoomIn").addEventListener("click", () => {
      this.zoomAt(this.canvas.width / 2, this.canvas.height / 2, 1.35);
    });
    document.getElementById("btnZoomOut").addEventListener("click", () => {
      this.zoomAt(this.canvas.width / 2, this.canvas.height / 2, 0.75);
    });
    document.getElementById("btnZoomReset").addEventListener("click", () => this.resetView());

    // Gestos en Canvas
    this.canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
    this.canvas.addEventListener("pointercancel", (e) => this._onPointerUp(e));
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.confettiCanvas.width = this.canvas.width;
    this.confettiCanvas.height = this.canvas.height;
    this.draw();
  }

  loadImage(img) {
    this.currentImage = img;
    this.welcomeModal.style.display = "none";

    const config = getResolutionConfig(this.gridSize);
    const activeAlphabet = FULL_ALPHABET.slice(0, config.alphabetCount);

    const result = ImageProcessorService.processToGrid(img, config.gridSize, activeAlphabet);
    this.grid = result.grid;
    this.palette = result.palette;

    this.totalTiles = this.gridSize * this.gridSize;
    this.paintedCount = 0;

    this._renderPalette();
    this.selectLetter(this.palette[0].letter);
    this.resetView();
    this._updateProgressUI();
  }

  resetView() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const minDim = Math.min(rect.width, rect.height) * window.devicePixelRatio;
    this.scale = minDim / this.WORLD_SIZE;
    this.panX = (this.canvas.width - this.WORLD_SIZE * this.scale) / 2;
    this.panY = (this.canvas.height - this.WORLD_SIZE * this.scale) / 2;
    this._updateZoomUI();
    this.draw();
  }

  zoomAt(screenX, screenY, factor) {
    const newScale = Math.max(0.3, Math.min(8.0, this.scale * factor));
    this.panX = screenX - (screenX - this.panX) * (newScale / this.scale);
    this.panY = screenY - (screenY - this.panY) * (newScale / this.scale);
    this.scale = newScale;
    this._updateZoomUI();
    this.draw();
  }

  _updateZoomUI() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const baseScale = (Math.min(rect.width, rect.height) * window.devicePixelRatio) / this.WORLD_SIZE;
    this.zoomLevelDisplay.textContent = `${Math.round((this.scale / baseScale) * 100)}%`;
  }

  draw() {
    this.ctx.save();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.scale, this.scale);

    const tileSize = this.WORLD_SIZE / this.gridSize;
    const screenTileSize = tileSize * this.scale;
    const shouldDrawLetters = screenTileSize > 14;

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const tile = this.grid[r] && this.grid[r][c];
        if (!tile) continue;

        const x = c * tileSize;
        const y = r * tileSize;

        if (tile.painted) {
          this.ctx.fillStyle = tile.color;
          this.ctx.fillRect(x, y, tileSize, tileSize);
        } else {
          const isTarget = tile.letter === this.activeLetter;
          this.ctx.fillStyle = isTarget ? "rgba(250, 204, 21, 0.28)" : "#161d2b";
          this.ctx.fillRect(x, y, tileSize, tileSize);

          this.ctx.strokeStyle = isTarget ? "#facc15" : "#242e42";
          this.ctx.lineWidth = isTarget ? Math.max(1, 1.8 / this.scale) : Math.max(0.5, 0.8 / this.scale);
          this.ctx.strokeRect(x, y, tileSize, tileSize);

          if (shouldDrawLetters) {
            this.ctx.fillStyle = isTarget ? "#facc15" : "#94a3b8";
            this.ctx.font = `bold ${Math.floor(tileSize * 0.52)}px sans-serif`;
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(tile.letter, x + tileSize / 2, y + tileSize / 2 + 1);
          }
        }
      }
    }

    this.ctx.restore();
  }

  _renderPalette() {
    this.paletteScroll.innerHTML = "";
    this.palette.forEach(item => {
      const chip = document.createElement("button");
      chip.className = "letter-chip";
      chip.id = `chip-${item.letter}`;
      chip.style.backgroundColor = item.hex;
      chip.style.color = item.contrastText;

      chip.innerHTML = `
        <span>${item.letter}</span>
        <span class="chip-count" id="count-${item.letter}">${item.remaining}</span>
      `;

      chip.onclick = () => this.selectLetter(item.letter);
      this.paletteScroll.appendChild(chip);
    });
  }

  selectLetter(letter) {
    this.activeLetter = letter;
    this.activeLetterDisplay.textContent = letter;
    this.audio.speakLetter(letter);

    document.querySelectorAll(".letter-chip").forEach(c => {
      c.classList.toggle("active", c.id === `chip-${letter}`);
    });

    const activeChip = document.getElementById(`chip-${letter}`);
    if (activeChip) {
      activeChip.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }

    this.draw();
  }

  paintTile(r, c) {
    const tile = this.grid[r][c];
    if (tile.painted) return;

    if (tile.letter === this.activeLetter) {
      tile.painted = true;
      this.paintedCount++;

      const palItem = this.palette.find(p => p.letter === this.activeLetter);
      if (palItem) {
        palItem.remaining--;
        const countEl = document.getElementById(`count-${this.activeLetter}`);
        if (countEl) countEl.textContent = palItem.remaining;

        if (palItem.remaining <= 0) {
          const chip = document.getElementById(`chip-${this.activeLetter}`);
          if (chip) chip.classList.add("completed");

          const next = this.palette.find(p => p.remaining > 0);
          if (next) setTimeout(() => this.selectLetter(next.letter), 250);
        }
      }

      this.audio.playPop();
      this.draw();
      this._updateProgressUI();

      if (this.paintedCount === this.totalTiles) {
        this._triggerWin();
      }
    }
  }

  _updateProgressUI() {
    const pct = Math.round((this.paintedCount / this.totalTiles) * 100) || 0;
    this.progressPercent.textContent = `${pct}%`;
  }

  _onPointerDown(e) {
     // Evitamos que el navegador intente arrastrar la pantalla o hacer scroll
     e.preventDefault();  

     this.canvas.setPointerCapture(e.pointerId);
     this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
     this.hasMoved = false;

     if (this.activePointers.size === 1) {
     const worldPos = this._screenToWorld(e.clientX, e.clientY);
     const tileSize = this.WORLD_SIZE / this.gridSize;
     const c = Math.floor(worldPos.x / tileSize);
     const r = Math.floor(worldPos.y / tileSize);

     const isTargetTile = (
      r >= 0 && r < this.gridSize &&
      c >= 0 && c < this.gridSize &&
      this.grid[r][c] &&
      !this.grid[r][c].painted &&
      this.grid[r][c].letter === this.activeLetter

     );

     //MODO PINCEL EN BLOQUE: desactivamos el movimiento de la pantalla (isPanning = false)
     if (this.brushMode === "continuous" && isTargetTile) {
      this.isPainting = true;
      this.isPanning = false; //¡BLOQUEADO! No se movera el lienzo.
      this.paintTile(r, c);
     } else {
      // Solo permitimos mover si NO estamos pintando y tocando el fondo vacio o comopletado.
      this. isPainting = false;
      this.isPanning = true;
      this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
     }
  }  else if (this.activePointers.size === 2) {
      this.isPainting = false;
      this.isPanning = false;
      const pts = Array.from(this.activePointers.values());
      this.prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
     }
  }

  _onPointerMove(e) {
    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    // Zoom con dos dedos (siempre permitido)
    if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      const curDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.prevPinchDist) {
        this.zoomAt((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, curDist / this.prevPinchDist);
      }
      this.prevPinchDist = curDist;
      this.hasMoved = true;
      return;
    }

    if (this.activePointers.size === 1) {
    // Si estamos en modo de pintado continuo (pincel), la imagen NUNCA se debe mover
    if (this.isPainting && this.brushMode === "continuous") {
      const worldPos = this._screenToWorld(e.clientX, e.clientY);
      const tileSize = this.WORLD_SIZE / this.gridSize;
      const c = Math.floor(worldPos.x / tileSize);
      const r = Math.floor(worldPos.y / tileSize);

      if (
        r >= 0 && r < this.gridSize &&
        c >= 0 && c < this.gridSize &&
        this.grid[r][c] &&
        !this.grid[r][c].painted &&
        this.grid[r][c].letter === this.activeLetter
      ) {
         this.paintTile(r, c);
      }
      this.hasMoved = true;
          return; // Salimos de la función para que no llegue a mover el lienzo (isPanning)
        }
      
       // Modo Desplazamiento (solo si NO se esta pintando en ese momento)
      if (this.isPanning) {
        this.panX = e.clientX - this.panStart.x;
        this.panY = e.clientY - this.panStart.y;
        this.draw();
        this.hasMoved = true;
      }
    }
  }

  _onPointerUp(e) {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) this.prevPinchDist = null;

    if (!this.hasMoved && this.activePointers.size === 0) {
      const worldPos = this._screenToWorld(e.clientX, e.clientY);
      const tileSize = this.WORLD_SIZE / this.gridSize;
      const c = Math.floor(worldPos.x / tileSize);
      const r = Math.floor(worldPos.y / tileSize);

      if (r >= 0 && r < this.gridSize && c >= 0 && c < this.gridSize) {
        this.paintTile(r, c);
      }
    }

    if (this.activePointers.size === 1) {
      const pt = Array.from(this.activePointers.values())[0];
      this.panStart = { x: pt.x - this.panX, y: pt.y - this.panY };
      this.isPanning = true;
    }
  }

  _screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = (clientX - rect.left) * (this.canvas.width / rect.width);
    const cy = (clientY - rect.top) * (this.canvas.height / rect.height);
    return {
      x: (cx - this.panX) / this.scale,
      y: (cy - this.panY) / this.scale
    };
  }

  _triggerWin() {
    this.audio.playCelebration();
    this.audio.speakPhrase("¡Felicidades! ¡Completaste todo el dibujo!");

    let particles = Array.from({ length: 80 }, () => ({
      x: this.confettiCanvas.width / 2,
      y: this.confettiCanvas.height / 2,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.8) * 14,
      color: `hsl(${Math.random() * 360}, 90%, 60%)`,
      size: Math.random() * 8 + 4
    }));

    const anim = () => {
      this.confettiCtx.clearRect(0, 0, this.confettiCanvas.width, this.confettiCanvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3;
        this.confettiCtx.fillStyle = p.color;
        this.confettiCtx.fillRect(p.x, p.y, p.size, p.size);
      });

      particles = particles.filter(p => p.y < this.confettiCanvas.height + 20);
      if (particles.length > 0) requestAnimationFrame(anim);
    };
    anim();
  }
      }
