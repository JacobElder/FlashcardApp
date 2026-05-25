import argparse
import json
import os
import re
import requests
from bs4 import BeautifulSoup
from openai import OpenAI
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

def extract_text_from_url(url):
    print(f"Fetching text from {url}...")
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, 'html.parser')
    paragraphs = soup.find_all('p')
    text = " ".join([p.get_text() for p in paragraphs])
    return text

def generate_qna_with_llm(text, api_key):
    print("Generating question and answer using OpenAI...")
    client = OpenAI(api_key=api_key)
    prompt = f"""Based on the following text, generate a highly informative trivia question and its correct answer. 
Also generate 10 plausible but factually incorrect distractors (multiple choice options) for this question.
Return ONLY a JSON object with keys: 'question', 'answer', 'category', and 'candidate_distractors' (a list of 10 strings).

Text:
{text[:4000]}"""
    
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    return json.loads(response.choices[0].message.content)

def generate_distractors(correct_answer, candidates, model_name='all-MiniLM-L6-v2', num_distractors=3):
    print("Selecting best semantic distractors using embeddings...")
    model = SentenceTransformer(model_name)
    
    # Embed correct answer and candidates
    embeddings = model.encode([correct_answer] + candidates)
    
    # Compute cosine similarity between correct answer (index 0) and candidates (index 1 to N)
    correct_embedding = embeddings[0:1]
    candidate_embeddings = embeddings[1:]
    
    similarities = cosine_similarity(correct_embedding, candidate_embeddings)[0]
    
    # Get top 'num_distractors' indices with highest similarity
    top_indices = np.argsort(similarities)[::-1][:num_distractors]
    
    best_distractors = [candidates[i] for i in top_indices]
    return best_distractors

def append_to_trivia_cards(card_data, file_path):
    print(f"Appending to {file_path}...")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: {file_path} not found.")
        return
    
    # Find the last closing bracket of the triviaCards array
    match = re.search(r'\];?\s*$', content)
    if not match:
        print("Could not find the end of the triviaCards array.")
        return
        
    end_pos = match.start()
    
    # Generate an ID based on count
    card_count = content.count("id: '")
    new_id = f"auto-{card_count + 1}"
    
    options_str = json.dumps(card_data['options'])
    
    new_card_str = f"""  {{ 
    id: '{new_id}', 
    type: 'trivia', 
    category: '{card_data['category']}', 
    front: {json.dumps(card_data['question'])}, 
    back: {json.dumps(card_data['answer'])},
    options: {options_str},
    difficulty: 0,
    discrimination: 1
  }}"""
    
    new_content = content[:end_pos].rstrip()
    if not new_content.endswith(','):
        new_content += ','
    new_content += "\n" + new_card_str + "\n" + content[end_pos:]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Done!")

def main():
    parser = argparse.ArgumentParser(description="Generate trivia cards from URL or text.")
    parser.add_argument("--url", type=str, help="Wikipedia URL or any URL with text")
    parser.add_argument("--text", type=str, help="Raw text to use")
    # Defaulting to the local src/data folder since this script is now in FlashcardApp/scripts/
    parser.add_argument("--out", type=str, default="../src/data/triviaCards.ts", help="Path to triviaCards.ts")
    
    args = parser.parse_args()
    
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Please set OPENAI_API_KEY environment variable.")
        return
        
    if args.url:
        text = extract_text_from_url(args.url)
    elif args.text:
        text = args.text
    else:
        print("Please provide --url or --text")
        return
        
    qna = generate_qna_with_llm(text, api_key)
    distractors = generate_distractors(qna['answer'], qna['candidate_distractors'])
    
    card_data = {
        'question': qna['question'],
        'answer': qna['answer'],
        'category': qna['category'],
        'options': [qna['answer']] + distractors
    }
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(script_dir, args.out)
    
    append_to_trivia_cards(card_data, out_path)

if __name__ == "__main__":
    main()
