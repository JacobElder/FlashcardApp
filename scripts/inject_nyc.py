import json
import os
import re

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_paths = [
        os.path.join(script_dir, 'batch3.json'),
        os.path.join(script_dir, 'batch4.json')
    ]
    ts_path = os.path.join(script_dir, '../src/data/triviaCards.ts')

    all_questions = []
    for json_path in json_paths:
        with open(json_path, 'r', encoding='utf-8') as f:
            all_questions.extend(json.load(f))

    with open(ts_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the end of the triviaCards array
    match = re.search(r'\];?\s*export const triviaCards', content)
    if not match:
        match = re.search(r'\];?\s*$', content)
    
    if not match:
        print("Could not find the end of the triviaCards array.")
        return
        
    end_pos = match.start()
    
    # Auto-generate IDs
    card_count = content.count("id: '")
    
    new_lines = []
    for i, q in enumerate(all_questions):
        new_id = f"nyc-pub-{card_count + i + 1}"
        options_str = json.dumps(q['options'])
        
        # Format the object exactly like triviaCards.ts elements
        # Setting a slightly harder difficulty base for these NYC specific ones!
        card_str = f"  {{ id: '{new_id}', type: 'trivia', category: '{q['category']}', front: {json.dumps(q['question'])}, back: {json.dumps(q['answer'])}, options: {options_str}, difficulty: 1.0, discrimination: 1.5 }}"
        new_lines.append(card_str)

    new_content = content[:end_pos].rstrip()
    if not new_content.endswith(','):
        new_content += ','
    
    new_content += "\n" + ",\n".join(new_lines) + "\n" + content[end_pos:]
    
    with open(ts_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f"Successfully appended {len(all_questions)} general pub trivia questions!")

if __name__ == "__main__":
    main()
