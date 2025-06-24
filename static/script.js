document.addEventListener('DOMContentLoaded', function() {
    const chatBox = document.getElementById('chatBox');
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const voiceButton = document.getElementById('voiceButton');
    const pdfUpload = document.getElementById('pdfUpload');
    const uploadButton = document.getElementById('uploadButton');

    // Welcome message with timestamp
    addMessage('bot', 'Hello! I\'m your college assistant. How can I help you today?');

    // Send message function
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        addMessage('user', message);
        userInput.value = '';
        userInput.focus();

        // Show advanced typing indicator
        const typingIndicator = showTypingIndicator();
        
        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });
            
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();
            await checkResponse(data.task_id, typingIndicator);
        } catch (error) {
            hideTypingIndicator(typingIndicator);
            addMessage('bot', '⚠️ Sorry, there was an error processing your request.', 'error');
            console.error('Error:', error);
        }
    }

    // Check for response with timeout
    async function checkResponse(taskId, typingElement) {
        const startTime = Date.now();
        const timeout = 30000; // 30 seconds timeout
        
        const check = async () => {
            try {
                const response = await fetch(`/task_status/${taskId}`);
                const data = await response.json();
                
                if (data.status === 'done') {
                    hideTypingIndicator(typingElement);
                    addMessage('bot', data.response);
                    return;
                }
                
                if (Date.now() - startTime > timeout) {
                    throw new Error('Response timeout');
                }
                
                setTimeout(check, 1000); // Continue polling
            } catch (error) {
                hideTypingIndicator(typingElement);
                addMessage('bot', '⌛ The response is taking longer than expected. Please try again.', 'warning');
                console.error('Polling error:', error);
            }
        };
        
        await check();
    }

    // PDF upload handler with progress
    async function uploadPDF() {
        const file = pdfUpload.files[0];
        if (!file) {
            addMessage('system', '📄 Please select a PDF file first.');
            return;
        }

        if (file.size > 8 * 1024 * 1024) {
            addMessage('system', '⚠️ File too large (max 8MB allowed)');
            return;
        }

        addMessage('user', `📤 Uploading: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
        const processingMsg = showTypingIndicator('Processing your PDF...');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) throw new Error('Upload failed');
            
            const data = await response.json();
            hideTypingIndicator(processingMsg);
            
            if (data.error) {
                addMessage('bot', `❌ ${data.error}`, 'error');
            } else {
                addMessage('bot', '✅ PDF processed successfully. Here are the key points:');
                // Display in chunks if large
                const chunkSize = 1000;
                for (let i = 0; i < data.text.length; i += chunkSize) {
                    const chunk = data.text.substring(i, i + chunkSize);
                    addMessage('bot', chunk, 'pdf-text');
                }
            }
        } catch (error) {
            hideTypingIndicator(processingMsg);
            addMessage('bot', '❌ Failed to process PDF. Please try another file.', 'error');
            console.error('Upload error:', error);
        }
    }

    // Enhanced voice recognition
    function startVoice() {
        if (!('webkitSpeechRecognition' in window)) {
            addMessage('system', '🎤 Voice recognition not supported in your browser');
            return;
        }
    
        const recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
    
        const voiceButton = document.getElementById('voiceButton');
        const userInput = document.getElementById('userInput');
    
        recognition.onstart = () => {
            voiceButton.classList.add('listening');
            addMessage('system', '🎤 Listening... Speak now');
        };
    
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
            voiceButton.classList.remove('listening');
            addMessage('system', '🎤 Voice input received');
        };
    
        recognition.onerror = (event) => {
            voiceButton.classList.remove('listening');
            const messages = {
                'no-speech': 'No speech was detected',
                'audio-capture': 'No microphone was found',
                'not-allowed': 'Permission to use microphone was denied'
            };
            addMessage('system', `🎤 ${messages[event.error] || 'Error occurred in recognition'}`, 'error');
        };
    
        recognition.onend = () => {
            voiceButton.classList.remove('listening');
        };
    
        recognition.start();
    }
    

    // Improved message creation with timestamps
    function addMessage(sender, message, type = '') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message ${type}`;
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.innerHTML = `
            <div class="message-content">${message}</div>
            <span class="timestamp">${timestamp}</span>
        `;
        
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        return messageDiv;
    }

    // Fancy typing indicator
    function showTypingIndicator(customText = 'Assistant is typing...') {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            ${customText}
        `;
        chatBox.appendChild(typingDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        return typingDiv;
    }

    function hideTypingIndicator(indicator) {
        if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
    }

    // Event listeners with debouncing
    sendButton.addEventListener('click', sendMessage);
    
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });

    // Voice button with touch support
    voiceButton.addEventListener('click', startVoice);
    voiceButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        startVoice();
    });

    uploadButton.addEventListener('click', uploadPDF);

    // Auto-focus input on page load
    userInput.focus();
});