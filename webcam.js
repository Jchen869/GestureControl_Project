let stream = null;
let video = null;
let overlayCanvas = null;
let overlayCtx = null;
let processingInterval = null;
let isTracking = false;

// Hand landmark connections (MediaPipe hand model)
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],  // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],  // Index finger
    [0, 9], [9, 10], [10, 11], [11, 12],  // Middle finger
    [0, 13], [13, 14], [14, 15], [15, 16],  // Ring finger
    [0, 17], [17, 18], [18, 19], [19, 20],  // Pinky
    [5, 9], [9, 13], [13, 17]  // Palm connections
];

document.addEventListener('DOMContentLoaded', function() {
    video = document.getElementById('webcam');
    overlayCanvas = document.getElementById('overlay');
    overlayCtx = overlayCanvas.getContext('2d');
    
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const status = document.getElementById('status');
    
    startBtn.addEventListener('click', startCamera);
    stopBtn.addEventListener('click', stopCamera);
    
    async function startCamera() {
        try {
            updateStatus('Requesting camera access...');
            
            // Request camera access
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: false
            });
            
            video.srcObject = stream;
            
            video.addEventListener('loadedmetadata', () => {
                // Set canvas size to match video
                overlayCanvas.width = video.videoWidth;
                overlayCanvas.height = video.videoHeight;
                
                updateStatus('Camera started! Hand tracking is now active.');
                startBtn.disabled = true;
                stopBtn.disabled = false;
                
                // Start hand tracking
                startHandTracking();
            });
            
            video.addEventListener('error', (e) => {
                console.error('Video error:', e);
                updateStatus('Error loading video stream');
            });
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            
            if (error.name === 'NotAllowedError') {
                updateStatus('Camera access denied. Please allow camera access and refresh the page.');
            } else if (error.name === 'NotFoundError') {
                updateStatus('No camera found. Please connect a camera and try again.');
            } else if (error.name === 'NotSupportedError') {
                updateStatus('Camera not supported by this browser.');
            } else {
                updateStatus('Error accessing camera: ' + error.message);
            }
        }
    }
    
    function startHandTracking() {
        isTracking = true;
        
        // Process frames at 10 FPS for good performance
        processingInterval = setInterval(async () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                await processFrame();
            }
        }, 100); // 100ms = 10 FPS
    }
    
    async function processFrame() {
        try {
            // Create a hidden canvas to capture the current video frame
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            
            // Draw current video frame to canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convert canvas to base64 image
            const imageData = canvas.toDataURL('image/jpeg', 0.8);
            
            // Send frame to server for processing
            const response = await fetch('/process_frame', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image: imageData })
            });
            
            const result = await response.json();
            
            if (result.success) {
                drawHandLandmarks(result.landmarks);
                updateStatus(`Hand tracking active - ${result.hand_count} hand(s) detected`);
            } else {
                console.error('Processing error:', result.error);
            }
            
        } catch (error) {
            console.error('Frame processing error:', error);
        }
    }
    
    function drawHandLandmarks(handsLandmarks) {
        // Clear previous drawings
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        
        if (!handsLandmarks || handsLandmarks.length === 0) {
            return;
        }
        
        // Draw each hand
        handsLandmarks.forEach((landmarks) => {
            // Convert normalized coordinates to canvas coordinates
            const points = landmarks.map(landmark => ({
                x: landmark.x * overlayCanvas.width,
                y: landmark.y * overlayCanvas.height
            }));
            
            // Draw connections
            overlayCtx.strokeStyle = '#00FFFF'; // Cyan
            overlayCtx.lineWidth = 2;
            overlayCtx.beginPath();
            
            HAND_CONNECTIONS.forEach(connection => {
                const [start, end] = connection;
                if (points[start] && points[end]) {
                    overlayCtx.moveTo(points[start].x, points[start].y);
                    overlayCtx.lineTo(points[end].x, points[end].y);
                }
            });
            
            overlayCtx.stroke();
            
            // Draw landmarks
            overlayCtx.fillStyle = '#00FF00'; // Green
            points.forEach((point, index) => {
                overlayCtx.beginPath();
                overlayCtx.arc(point.x, point.y, index === 0 ? 6 : 4, 0, 2 * Math.PI);
                overlayCtx.fill();
            });
        });
    }
    
    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        
        if (processingInterval) {
            clearInterval(processingInterval);
            processingInterval = null;
        }
        
        isTracking = false;
        video.srcObject = null;
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        
        updateStatus('Camera stopped. Click "Start Camera" to begin again.');
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
    
    function updateStatus(message) {
        const status = document.getElementById('status');
        status.textContent = message;
    }
    
    // Check if camera is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateStatus('Camera access not supported by this browser.');
        startBtn.disabled = true;
    }
});