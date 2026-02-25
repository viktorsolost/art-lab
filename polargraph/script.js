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
    let scale = 0.5; // Initial scale for canvas display
    let isConnected = false;
    let isPlotting = false;
    let isPaused = false;
    let plotSpeed = parseInt(speedInput.value);
    let currentPath = [];
    let animationId = null;

    // Resize canvas based on machine dimensions and window size
    function resizeCanvas() {
        const container = document.getElementById('canvas-container');
        const aspect = machineWidth / machineHeight;
        let w = container.clientWidth * 0.9;
        let h = w / aspect;

        if (h > container.clientHeight * 0.9) {
            h = container.clientHeight * 0.9;
            w = h * aspect;
        }

        canvas.width = machineWidth; // Internal resolution matches machine dimensions
        canvas.height = machineHeight;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        
        // Redraw content if any
        drawGrid();
        if (currentPath.length > 0) {
            drawPath(currentPath);
        }
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function drawGrid() {
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const gridSize = 50; // 50mm grid
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

    // Connect via Web Serial (Placeholder for now)
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
                // Clear and redraw grid
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                drawGrid();
                
                // Draw image centered and scaled to fit
                const aspect = img.width / img.height;
                let drawW = machineWidth * 0.8;
                let drawH = drawW / aspect;
                
                if (drawH > machineHeight * 0.8) {
                    drawH = machineHeight * 0.8;
                    drawW = drawH * aspect;
                }
                
                const x = (machineWidth - drawW) / 2;
                const y = (machineHeight - drawH) / 2;
                
                ctx.drawImage(img, x, y, drawW, drawH);
                
                // For SVG, we might want to extract paths later
                // Here we just display it as a reference image for "plotting" simulation
                currentPath = generateSimulatedPath(x, y, drawW, drawH);
                updateGCodePreview(`Loaded image: ${file.name}\nDimensions: ${img.width}x${img.height}`);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    clearBtn.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid();
        currentPath = [];
        updateGCodePreview("Canvas cleared.");
    });

    // Generate a simple simulated path (e.g., zigzag fill) for demonstration
    function generateSimulatedPath(x, y, w, h) {
        const path = [];
        const step = 10; // mm
        for (let py = y; py < y + h; py += step) {
            if (((py - y) / step) % 2 === 0) {
                path.push({ x: x, y: py });
                path.push({ x: x + w, y: py });
            } else {
                path.push({ x: x + w, y: py });
                path.push({ x: x, y: py });
            }
        }
        return path;
    }

    function drawPath(path) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2;
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
            alert("No drawing loaded!");
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
        // Redraw full path immediately or clear? Let's just redraw grid + full image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid();
        // Ideally reload image, but for now just grid
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

        // Draw segment
        const p1 = currentPath[index];
        const p2 = currentPath[index + 1];
        
        ctx.beginPath();
        ctx.strokeStyle = '#f0f'; // Plotter head color
        ctx.lineWidth = 3;
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Simulate G-code output
        if (index % 10 === 0) {
            updateGCodePreview(`G1 X${p2.x.toFixed(2)} Y${p2.y.toFixed(2)} F${plotSpeed * 100}`);
        }

        // Calculate next frame based on speed
        // Simple linear interpolation could go here, but frame-by-point for now
        let nextIndex = index + 1;
        
        // Speed simulation: skip points if speed is high
        if (plotSpeed > 50) {
             nextIndex += Math.floor((plotSpeed - 50) / 10);
             if (nextIndex >= currentPath.length - 1) nextIndex = currentPath.length - 2;
        }

        // Visual delay for slow speed
        if (plotSpeed < 20) {
            setTimeout(() => {
                animationId = requestAnimationFrame(() => animatePlot(nextIndex));
            }, (20 - plotSpeed) * 10);
        } else {
            animationId = requestAnimationFrame(() => animatePlot(nextIndex));
        }
    }

    function updateGCodePreview(text) {
        const line = document.createElement('div');
        line.textContent = text;
        gcodePreview.appendChild(line);
        gcodePreview.scrollTop = gcodePreview.scrollHeight;
        
        // Limit log size
        while (gcodePreview.children.length > 50) {
            gcodePreview.removeChild(gcodePreview.firstChild);
        }
    }
});