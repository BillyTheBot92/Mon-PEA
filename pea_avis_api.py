#!/usr/bin/env python3
"""
pea_avis_api.py v1.0
API légère pour Avis IA du portefeuille PEA.
Écoute sur 127.0.0.1:8091, analysé les assets via Yahoo Finance + Groq.

Usage:
  python3 pea_avis_api.py

Environnement:
  GROQ_API_KEY=votre_clé_groq
"""

import json
import http.server
import socketserver
import os
import sys
from datetime import datetime
from urllib.request import urlopen
from urllib.error import URLError

# Configuration
PORT = 8091
HOST = '127.0.0.1'

# Clés API
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '').strip()

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def fetch_yahoo_price(ticker):
    """Fetch le prix Yahoo Finance pour un ticker."""
    try:
        url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=price"
        with urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            if data.get('quoteSummary', {}).get('result'):
                price = data['quoteSummary']['result'][0]['price']['regularMarketPrice']['raw']
                return float(price)
    except Exception as e:
        log(f"⚠️  Erreur Yahoo Finance ({ticker}): {e}")
    return None

def analyze_with_groq(assets_data):
    """Envoie les assets à Groq pour analyse."""
    if not GROQ_API_KEY:
        return {
            "status": "error",
            "message": "GROQ_API_KEY non configurée. Définissez la variable d'environnement.",
        }

    # Préparer le contexte
    context = "Analyse les assets suivants et fournis un avis d'investissement court (2-3 phrases max):\n\n"
    for asset in assets_data:
        context += f"- {asset.get('name', 'N/A')}: {asset.get('price', 0)}€, {asset.get('parts', 0)} parts\n"
    context += "\nSois concis, pratique et honnête."

    try:
        import requests
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": "mixtral-8x7b-32768",
            "messages": [{"role": "user", "content": context}],
            "max_tokens": 300,
            "temperature": 0.7,
        }
        
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        
        if data.get('choices'):
            advice = data['choices'][0]['message']['content'].strip()
            return {
                "status": "success",
                "advice": advice,
                "timestamp": datetime.now().isoformat(),
            }
    except ImportError:
        log("⚠️  requests non installé. Tentative urllib...")
        # Fallback sans requests (plus compliqué, mais possible)
        return {
            "status": "error",
            "message": "requests library not available. Install: pip install requests",
        }
    except Exception as e:
        log(f"❌ Erreur Groq: {e}")
        return {
            "status": "error",
            "message": f"Groq error: {str(e)}",
        }

class AvisHandler(http.server.BaseHTTPRequestHandler):
    """Handler pour l'API PEA Avis."""

    def do_POST(self):
        """POST /avis-ia avec les assets."""
        if self.path != '/avis-ia':
            self.send_error(404)
            return

        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            assets_data = json.loads(body)

            # Fetch les prix actuels
            for asset in assets_data:
                ticker = asset.get('ticker', 'DCAM.PA')
                price = fetch_yahoo_price(ticker)
                if price:
                    asset['price'] = price

            # Analyser avec Groq
            result = analyze_with_groq(assets_data)

            # Répondre
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            log(f"✅ Avis envoyé ({result.get('status')})")

        except Exception as e:
            log(f"❌ Erreur handler: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))

    def do_OPTIONS(self):
        """Support CORS."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        """Supprimer les logs par défaut."""
        pass

if __name__ == '__main__':
    log(f"🚀 Démarrage pea_avis_api v1.0 sur {HOST}:{PORT}")
    
    if not GROQ_API_KEY:
        log("⚠️  GROQ_API_KEY non définie. Définissez: export GROQ_API_KEY=...")
    
    try:
        handler = AvisHandler
        with socketserver.TCPServer((HOST, PORT), handler) as httpd:
            log(f"✅ Serveur actif. Endpoint: http://{HOST}:{PORT}/avis-ia")
            httpd.serve_forever()
    except KeyboardInterrupt:
        log("⏹️  Arrêt du serveur")
        sys.exit(0)
    except Exception as e:
        log(f"❌ Erreur: {e}")
        sys.exit(1)
