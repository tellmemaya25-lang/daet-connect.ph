#!/usr/bin/env python3
"""Inline assets/style.css and assets/quiz.js into every lesson/reference page so each file works standalone.
Idempotent: re-run after editing assets. Usage: python3 assets/inline.py"""
import re,glob,os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
css=open(f'{root}/assets/style.css').read(); js=open(f'{root}/assets/quiz.js').read()
S=('<!--inline:css--><style>','</style><!--/inline-->'); J=('<!--inline:js--><script>','</script><!--/inline-->')
for f in glob.glob(f'{root}/lessons/*.html')+glob.glob(f'{root}/reference/*.html'):
    s=open(f).read()
    s=re.sub(r'<link rel="stylesheet" href="\.\./assets/style\.css">',S[0]+css+S[1],s)
    s=re.sub(r'<script src="\.\./assets/quiz\.js"></script>',J[0]+js+J[1],s)
    s=re.sub(r'<!--inline:css-->.*?<!--/inline-->',lambda m:S[0]+css+S[1],s,flags=re.S)
    s=re.sub(r'<!--inline:js-->.*?<!--/inline-->',lambda m:J[0]+js+J[1],s,flags=re.S)
    open(f,'w').write(s)
