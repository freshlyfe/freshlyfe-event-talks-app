import re
import html
import logging
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def clean_html_content(html_str):
    """
    Cleans HTML tags and parses elements, making sure it's valid and safe.
    """
    if not html_str:
        return ""
    return html_str.strip()

def parse_entry_content(content_html):
    """
    Parses the <h3> headings and their following HTML contents in a single entry.
    Each heading represents a type of update (e.g. Feature, Deprecation, Changed, etc.)
    and the content following it until the next heading is the body.
    """
    if not content_html:
        return []
    
    # Use regex to find all h3 tags
    matches = list(re.finditer(r'<h3[^>]*>(.*?)</h3>', content_html, re.IGNORECASE))
    updates = []
    
    if not matches:
        # Fallback if no <h3> tags are present
        updates.append({
            "type": "Update",
            "content": content_html.strip()
        })
        return updates
        
    for i, match in enumerate(matches):
        header_text = match.group(1).strip()
        header_text = html.unescape(header_text)
        
        start_idx = match.end()
        end_idx = matches[i+1].start() if i + 1 < len(matches) else len(content_html)
        body_html = content_html[start_idx:end_idx].strip()
        
        # Clean up any trailing/leading empty paragraph tags or linebreaks
        body_html = re.sub(r'^(?:<br\s*/?>|\s)+', '', body_html)
        body_html = re.sub(r'(?:<br\s*/?>|\s)+$', '', body_html)
        
        updates.append({
            "type": header_text,
            "content": body_html
        })
        
    return updates

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/notes")
def get_notes():
    try:
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
            
        root = ET.fromstring(xml_data)
        namespaces = {'atom': 'http://www.w3.org/2005/Atom'}
        
        entries_data = []
        for entry in root.findall('atom:entry', namespaces):
            title_elem = entry.find('atom:title', namespaces)
            title = title_elem.text if title_elem is not None else "Unknown Date"
            
            id_elem = entry.find('atom:id', namespaces)
            entry_id = id_elem.text if id_elem is not None else ""
            
            updated_elem = entry.find('atom:updated', namespaces)
            updated = updated_elem.text if updated_elem is not None else ""
            
            link_elem = entry.find("atom:link[@rel='alternate']", namespaces)
            if link_elem is None:
                link_elem = entry.find("atom:link", namespaces)
            link = link_elem.get('href') if link_elem is not None else ""
            
            content_elem = entry.find('atom:content', namespaces)
            content_html = content_elem.text if content_elem is not None else ""
            
            updates = parse_entry_content(content_html)
            
            entries_data.append({
                "date": title,
                "updated": updated,
                "id": entry_id,
                "link": link,
                "updates": updates
            })
            
        return jsonify({
            "status": "success",
            "feed_title": "BigQuery Release Notes",
            "entries": entries_data
        })
        
    except Exception as e:
        logger.error(f"Error fetching/parsing feed: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Failed to fetch or parse release notes: {str(e)}"
        }), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
