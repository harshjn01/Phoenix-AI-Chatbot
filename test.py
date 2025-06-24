from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from werkzeug.utils import secure_filename
import os
import requests
import fitz  # PyMuPDF
import re
import uuid
import threading
import logging

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024  # 8MB file size limit
app.config['SECRET_KEY'] = 'secret_key_here'  # Add a secret key for security

# Dummy user credentials for login
USERS = {'admin': 'password123'}

GEMINI_API_KEY = "AIzaSyDYljCCjaq_hMFPrsWN_pDjqcXeOlLn9b0"  # Add your API key here
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

# Store results here
responses = {}

# Clean markdown from Gemini
def clean_markdown(text):
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'\*(?!\s)(.*?)\*', r'\1', text)
    text = re.sub(r'_(.*?)_', r'\1', text)
    text = re.sub(r'`(.*?)`', r'\1', text)
    text = re.sub(r'\s*\*\s+', '\n- ', text)
    return text.strip()

# Gemini call
def query_gemini(prompt):
    headers = {'Content-Type': 'application/json'}
    data = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        response = requests.post(GEMINI_API_URL, headers=headers, json=data, timeout=10)
        if response.ok:
            raw_text = response.json()['candidates'][0]['content']['parts'][0]['text']
            return clean_markdown(raw_text)
        return "Sorry, Gemini returned an error."
    except requests.exceptions.RequestException as e:
        logging.error(f"Error contacting Gemini: {str(e)}")
        return f"Error contacting Gemini: {str(e)}"

# Background thread
def run_task(task_id, prompt):
    try:
        result = query_gemini(prompt)
    except Exception as e:
        logging.error(f"Error: {str(e)}")
        result = f"Error: {str(e)}"
    responses[task_id] = result

# Login page
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()

        if USERS.get(username) == password:
            session['user'] = username
            return redirect(url_for('index.html'))  # function name, not filename
        else:
            error = 'Invalid username or password'
            return render_template('index.html', error=error)

    return render_template('login.html')

# Logout route
@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

# Home
@app.route('/')
def index():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('index.html')

# Chat
@app.route('/chat', methods=['POST'])
def chat():
    user_input = request.json.get("message")
    if not user_input or not user_input.strip():
        return jsonify({"error": "Empty message"}), 400

    task_id = str(uuid.uuid4())
    responses[task_id] = None
    threading.Thread(target=run_task, args=(task_id, user_input)).start()
    return jsonify({"task_id": task_id})

# Polling endpoint
@app.route('/task_status/<task_id>')
def task_status(task_id):
    if task_id in responses:
        if responses[task_id] is not None:
            return jsonify({"status": "done", "response": responses[task_id]})
        return jsonify({"status": "pending"})
    return jsonify({"error": "Invalid task ID"}), 404

# PDF extraction
@app.route('/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        filename = secure_filename(file.filename)
        if not filename.lower().endswith('.pdf'):
            return jsonify({"error": "Only PDF files are allowed"}), 400

        doc = fitz.open(stream=file.read(), filetype="pdf")
        text = ''.join([page.get_text() for page in doc])

        if not text.strip():
            return jsonify({"error": "No readable text found in PDF"}), 400

        return jsonify({"text": text})

    except Exception as e:
        logging.error(f"Error reading PDF: {str(e)}")
        return jsonify({"error": f"Error processing PDF: {str(e)}"}), 500

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    app.run(debug=True, host='0.0.0.0', port=5000)
