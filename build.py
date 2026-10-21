"""Build index.html (GitHub Pages, Firebase) and front-office-claude.html (Claude artifact) from src/."""
import os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
r = lambda n: open(os.path.join(D, n), encoding='utf-8').read()
sh = r('shell.html')
sh = sh.replace('/*ROSTERS*/', r('rosters97.txt')).replace('/*ROSTERS26*/', r('rosters26.txt')).replace('/*ENGINE*/', r('engine.js')).replace('/*APP*/', r('app.js'))
root = os.path.dirname(os.path.abspath(__file__))
open(os.path.join(root, 'front-office-claude.html'), 'w', encoding='utf-8').write(sh)
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
        '<meta name="apple-mobile-web-app-title" content="Front Office">\n<meta name="theme-color" content="#0f1e33">\n'
        '<meta name="description" content="A baseball GM sim to play with friends: trades, lineups, the money, and a GM Race.">\n'
        '<link rel="icon" href="icon.svg">\n<link rel="apple-touch-icon" href="icon-180.png">\n<link rel="manifest" href="manifest.webmanifest">\n')
web = sh.replace("<title>Front Office '97</title>", head + '<title>Front Office</title>', 1)
web = web.replace('<script>' + r('engine.js') + '</script>', '<script>' + r('firebase_adapter.js') + '</script>\n<script>' + r('engine.js') + '</script>', 1)
web = web.replace('</style>\n<div class="app">', '</style>\n</head>\n<body>\n<div class="app">', 1) + '\n</body>\n</html>\n'
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(web)
print('built', len(web), 'bytes')
