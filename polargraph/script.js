document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('plotterCanvas');
    const ctx = canvas.getContext('2d');
    const connectBtn = document.getElementById('connectBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    const clearBtn = document.getElementById('clearBtn');
    const plotBtn = document.getElementById('plotBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const speedInput = document.getElementById('speed');
    const machineWidthInput = document.getElementById('machineWidth');
    const machineHeightInput = document.getElementById('machineHeight');
    const connectionStatus = document.getElementById('connectionStatus');
    const gcodePreview = document.getElementById('gcode-preview');

    let machineWidth = parseInt(machineWidthInput.value);
    let machineHeight = parseInt(machineHeightInput.value);
    let isConnected = false;
    let isPlotting = false;
    let isPaused = false;
    let plotSpeed = parseInt(speedInput.value);
    let currentPath = [];
    let animationId = null;
    let sourceImage = null; // Store the loaded image

    // Allow JPG/PNG/SVG in file picker
    fileInput.accept = ".jpg, .jpeg, .png, .svg";

    function resizeCanvas() {
        const container = document.getElementById('canvas-container');
        if (!container) return;
        const aspect = machineWidth / machineHeight;
        let w = container.clientWidth * 0.9;
        let h = w / aspect;

        if (h > container.clientHeight * 0.9) {
            h = container.clientHeight * 0.9;
            w = h * aspect;
        }

        canvas.width = machineWidth;
        canvas.height = machineHeight;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        
        redraw();
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function drawGrid() {
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const gridSize = 50; 
        for (let x = 0; x <= machineWidth; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, machineHeight);
        }
        for (let y = 0; y <= machineHeight; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(machineWidth, y);
        }
        ctx.stroke();
    }

    function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid();
        
        if (sourceImage) {
            // Draw faint background reference
            ctx.globalAlpha = 0.2;
            const aspect = sourceImage.width / sourceImage.height;
            let drawW = machineWidth * 0.8;
            let drawH = drawW / aspect;
            if (drawH > machineHeight * 0.8) {
                drawH = machineHeight * 0.8;
                drawW = drawH * aspect;
            }
            const x = (machineWidth - drawW) / 2;
            const y = (machineHeight - drawH) / 2;
            ctx.drawImage(sourceImage, x, y, drawW, drawH);
            ctx.globalAlpha = 1.0;
        }

        if (currentPath.length > 0) {
            drawPath(currentPath);
        }
    }

    // Connect via Web Serial
    connectBtn.addEventListener('click', async () => {
        if ('serial' in navigator) {
            try {
                const port = await navigator.serial.requestPort();
                await port.open({ baudRate: 115200 });
                isConnected = true;
                connectionStatus.textContent = "Connected via Web Serial";
                connectionStatus.style.color = "#4f4";
                connectBtn.textContent = "Disconnect";
            } catch (err) {
                console.error('Serial Connection Error:', err);
                connectionStatus.textContent = "Connection Failed: " + err.message;
                connectionStatus.style.color = "#f44";
            }
        } else {
            alert('Web Serial API not supported in this browser.');
        }
    });

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                sourceImage = img;
                
                // Calculate dimensions to center image
                const aspect = img.width / img.height;
                let drawW = machineWidth * 0.8;
                let drawH = drawW / aspect;
                
                if (drawH > machineHeight * 0.8) {
                    drawH = machineHeight * 0.8;
                    drawW = drawH * aspect;
                }
                
                const x = (machineWidth - drawW) / 2;
                const y = (machineHeight - drawH) / 2;

                // Process image to generate path (Sine Wave Modulation)
                updateGCodePreview(`Processing image...`);
                
                // Use a temporary canvas to read pixel data
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = drawW;
                tempCanvas.height = drawH;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0, drawW, drawH);
                const imgData = tempCtx.getImageData(0, 0, drawW, drawH);
                
                currentPath = generateSinePath(imgData, x, y, drawW, drawH);
                
                redraw();
                updateGCodePreview(`Loaded: ${file.name}\nGenerated ${currentPath.length} points.`);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    clearBtn.addEventListener('click', () => {
        sourceImage = null;
        currentPath = [];
        redraw();
        updateGCodePreview("Canvas cleared.");
    });

    // ALGORITHM: Modulated Sine Waves
    // Darker pixels = Higher frequency/amplitude waves
    function generateSinePath(imgData, offsetX, offsetY, w, h) {
        const path = [];
        const data = imgData.data;
        const lineSpacing = 10; // mm between lines
        const resolution = 2; // Check pixel every 2mm
        const maxAmplitude = lineSpacing / 2;

        for (let py = 0; py < h; py += lineSpacing) {
            const yBase = offsetY + py;
            
            // Zigzag direction
            const isRight = (py / lineSpacing) % 2 === 0;
            const startX = isRight ? 0 : w;
            const endX = isRight ? w : 0;
            const step = isRight ? resolution : -resolution;

            for (let px = startX; (isRight ? px < w : px > 0); px += step) {
                // Get brightness at this pixel
                // Map screen coord to image data index
                const idx = (Math.floor(py) * w + Math.floor(px)) * 4;
                // Simple brightness (avg of RGB)
                const r = data[idx];
                const g = data[idx+1];
                const b = data[idx+2];
                const brightness = (r + g + b) / 3; // 0-255
                
                // Invert: Darker = More wave
                const darkness = 1 - (brightness / 255);
                
                // Modulation
                // Amplitude based on darkness (0 to maxAmplitude)
                const amp = darkness * maxAmplitude;
                
                // Frequency could also modulate, but let's keep it simple for now
                const freq = 0.5; 
                
                // Calculate wave offset
                const waveY = Math.sin(px * freq) * amp;
                
                path.push({
                    x: offsetX + px,
                    y: yBase + waveY
                });
            }
        }
        return path;
    }

    function drawPath(path) {
        ctx.beginPath();
        ctx.strokeStyle = '#000'; // Ink color
        ctx.lineWidth = 1.5;
        if (path.length > 0) {
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x, path[i].y);
            }
        }
        ctx.stroke();
    }

    plotBtn.addEventListener('click', () => {
        if (currentPath.length === 0) {
            alert("No path generated! Load an image first.");
            return;
        }
        if (isPlotting) return;
        isPlotting = true;
        isPaused = false;
        animatePlot(0);
        updateGCodePreview("Starting plot...");
    });

    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? "Resume" : "Pause";
        updateGCodePreview(isPaused ? "Plot paused." : "Plot resumed.");
    });

    stopBtn.addEventListener('click', () => {
        isPlotting = false;
        isPaused = false;
        cancelAnimationFrame(animationId);
        updateGCodePreview("Plot stopped.");
        redraw();
    });

    speedInput.addEventListener('input', (e) => {
        plotSpeed = parseInt(e.target.value);
    });

    function animatePlot(index) {
        if (!isPlotting) return;
        if (isPaused) {
            animationId = requestAnimationFrame(() => animatePlot(index));
            return;
        }

        if (index >= currentPath.length - 1) {
            isPlotting = false;
            updateGCodePreview("Plot complete!");
            return;
        }

        // Draw segment (Plotter head visualization)
        const p1 = currentPath[index];
        const p2 = currentPath[index + 1];
        
        ctx.beginPath();
        ctx.strokeStyle = '#f0f'; // Plotter head color (magenta)
        ctx.lineWidth = 3;
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Simulate G-code output
        if (index % 20 === 0) {
            updateGCodePreview(`G1 X${p2.x.toFixed(1)} Y${p2.y.toFixed(1)}`);
        }

        let nextIndex = index + Math.ceil(plotSpeed / 10);
        if (nextIndex >= currentPath.length) nextIndex = currentPath.length - 1;

        animationId = requestAnimationFrame(() => animatePlot(nextIndex));
    }

    function updateGCodePreview(text) {
        const line = document.createElement('div');
        line.textContent = text;
        gcodePreview.appendChild(line);
        gcodePreview.scrollTop = gcodePreview.scrollHeight;
        while (gcodePreview.children.length > 50) {
            gcodePreview.removeChild(gcodePreview.firstChild);
        }
    }
});