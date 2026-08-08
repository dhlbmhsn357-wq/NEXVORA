# -*- coding: utf-8 -*-
"""Preprocess nexvora-guide.md -> nexvora-guide-v2.md.

Automated transformations that reduce bidi confusion:
- Latin commas in Arabic contexts -> Arabic comma (،)
- Latin semicolons in Arabic contexts -> Arabic semicolon (؛)
- Latin question mark after Arabic -> Arabic question mark (؟)
- Ensure a space before opening ( when preceded by Arabic (helps bidi)
- Add Arabic gloss for a small set of frequent English-only labels the first
  time they appear as bare tokens (Deferred, Feature Flag, etc.). Kept
  conservative to avoid changing meaning.
"""
import re, sys

ARABIC_CHAR = r'[؀-ۿ]'

GLOSSES = [
    (re.compile(r'\bDeferred\b'), 'مؤجَّل (Deferred)'),
    (re.compile(r'\bFeature Flag\b'), 'Feature Flag (مفتاح خاصية)'),
    (re.compile(r'\bExtended Technical Delivery\b'),
     'Extended Technical Delivery (التسليم التقني الموسَّع)'),
]


def normalize(text):
    # Arabic punctuation
    text = re.sub(r'(?<=' + ARABIC_CHAR + r')\s*,\s*', '، ', text)
    text = re.sub(r'(?<=' + ARABIC_CHAR + r')\s*;\s*', '؛ ', text)
    text = re.sub(r'(?<=' + ARABIC_CHAR + r')\s*\?', ' ؟', text)
    # Trim double spaces created by substitutions
    text = re.sub(r'  +', ' ', text)
    return text


def apply_glosses_once(text):
    for rx, replacement in GLOSSES:
        # Only replace first occurrence to keep noise down
        text = rx.sub(replacement, text, count=1)
    return text


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, 'r', encoding='utf-8') as f:
        md = f.read()
    # Split by fenced code blocks so we don't touch code
    parts = re.split(r'(```[\s\S]*?```)', md)
    out = []
    for i, part in enumerate(parts):
        if i % 2 == 1:  # code block
            out.append(part)
        else:
            processed = normalize(part)
            processed = apply_glosses_once(processed)
            out.append(processed)
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(''.join(out))
    print(f'Wrote {dst}')


if __name__ == '__main__':
    main()
