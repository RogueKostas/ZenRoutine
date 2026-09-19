"""Build self-contained SVG brand assets and static DM Sans font instances.

Requires fontTools. This script does not change application code.
"""
from pathlib import Path
from html import escape
import json
import os
import sys

sys.path.insert(0, str(Path(os.environ.get('TEMP', '.')) / 'zenroutine-brand-fonttools'))
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
INK, JADE, PAPER = '#173F3A', '#59AA89', '#F3EEDC'
DARK = '#132B27'
# Clean vector reconstruction of the selected side-profile shell study.
# The flatter base is intentional; do not substitute the older circular mark.
UPPER = ('M106 507 C42 489 2 457 2 375 C2 268 54 166 140 95 '
         'C215 33 285 8 372 8 C455 8 532 24 567 54 '
         'C590 75 578 103 554 115 C536 123 513 126 486 126 '
         'L300 126 C270 126 255 137 255 158 C255 181 272 194 299 195 '
         'L426 195 C449 195 457 206 438 224 '
         'C393 260 338 292 273 330 L178 391 C123 425 75 461 106 507 Z')
LOWER = ('M611 94 C685 154 752 255 752 366 C752 424 740 459 699 487 '
         'C648 528 540 545 404 545 C311 545 231 538 163 526 '
         'C143 524 143 504 155 488 C170 466 207 462 250 462 '
         'L443 462 C473 462 496 450 496 431 C496 414 480 405 454 405 '
         'L305 405 C277 405 278 391 297 376 '
         'C373 319 470 279 540 230 C595 192 638 148 611 94 Z')

def shell(x=0, y=0, w=760, upper=INK, lower=JADE):
    return (f'<g transform="translate({x} {y}) scale({w/760})">'
            f'<path fill="{upper}" d="{UPPER}"/>'
            f'<path fill="{lower}" d="{LOWER}"/></g>')

def svg(w, h, body, bg=None, title='ZenRoutine'):
    background = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}" role="img"><title>{escape(title)}</title>'
            f'{background}{body}</svg>')

def save(path, content):
    out = ROOT / path
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(content, encoding='utf-8')

fonts = {}
for weight, style in [(400, 'Regular'), (500, 'Medium'), (600, 'SemiBold'), (700, 'Bold')]:
    font = instantiateVariableFont(TTFont(ROOT/'fonts/DMSans-Variable.ttf'),
                                   {'wght': weight, 'opsz': 14}, inplace=True)
    for name_id, value in [(1, 'DM Sans'), (2, style), (4, f'DM Sans {style}'),
                           (6, f'DMSans-{style}'), (16, 'DM Sans'), (17, style)]:
        font['name'].setName(value, name_id, 3, 1, 0x409)
    font.save(ROOT/f'fonts/DMSans-{style}.ttf')
    fonts[weight] = font

def text(value, x, y, size, fill=INK, weight=400, tracking=0, anchor='start'):
    font = fonts[weight]
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = size / font['head'].unitsPerEm
    advances = [font['hmtx'][cmap.get(ord(c), '.notdef')][0] * scale for c in value]
    width = sum(advances) + max(0, len(value)-1) * tracking
    if anchor == 'middle':
        x -= width / 2
    paths = []
    for char, advance in zip(value, advances):
        pen = SVGPathPen(glyphs)
        glyphs[cmap.get(ord(char), '.notdef')].draw(pen)
        paths.append(f'<path transform="translate({x:.3f} {y}) scale({scale:.6f} {-scale:.6f})" '
                     f'fill="{fill}" d="{pen.getCommands()}"/>')
        x += advance + tracking
    return ''.join(paths), width

def t(*args, **kwargs):
    return text(*args, **kwargs)[0]

# Mark masters: paths only, real transparency, no embedded raster or fonts.
for name, a, b in [('colour', INK, JADE), ('dark', PAPER, '#8AC8AA'),
                    ('ink', INK, INK), ('white', '#FFFFFF', '#FFFFFF')]:
    save(f'marks/shell-{name}.svg', svg(760, 550, shell(upper=a, lower=b)))

# Wordmark spacing is optical, with a single weight and exact mixed casing.
for theme, bg, fg, a, b in [('light', PAPER, INK, INK, JADE),
                            ('dark', DARK, PAPER, PAPER, '#8AC8AA')]:
    horizontal = shell(40, 45, 190, a, b) + t('ZenRoutine', 264, 144, 78, fg, 600, -1.2)
    stacked = shell(223, 50, 274, a, b) + t('ZenRoutine', 360, 347, 73, fg, 600, -1.1, 'middle')
    save(f'logos/horizontal-{theme}.svg', svg(780, 230, horizontal, bg))
    save(f'logos/stacked-{theme}.svg', svg(720, 430, stacked, bg))
    save(f'logos/horizontal-{theme}-transparent.svg', svg(780, 230, horizontal))
    save(f'logos/stacked-{theme}-transparent.svg', svg(720, 430, stacked))
save('logos/wordmark.svg', svg(550, 110, t('ZenRoutine', 10, 83, 84, INK, 600, -1.25)))

# Opaque square icon with OS masking left to the platform.
icon = shell(142, 244, 740)
save('icons/app-icon.svg', svg(1024, 1024, icon, PAPER))
save('icons/app-icon-dark.svg', svg(1024, 1024, shell(142, 244, 740, PAPER, '#8AC8AA'), DARK))
# Foreground artwork is inset within the centre safe area for adaptive masks.
save('icons/adaptive-foreground.svg', svg(1024, 1024, shell(220, 301, 584)))
save('icons/favicon.svg', svg(64, 64, shell(4, 12, 56), PAPER))

# Transparent splash image with an explicit canvas; use contain, never stretch.
save('splash/splash-mark-light.svg', svg(512, 512, shell(40, 100, 432)))
save('splash/splash-mark-dark.svg', svg(512, 512, shell(40, 100, 432, PAPER, '#8AC8AA')))
for theme, bg, fg, a, b in [('light', PAPER, INK, INK, JADE),
                            ('dark', DARK, PAPER, PAPER, '#8AC8AA')]:
    body = shell(399, 637, 372, a, b) + t('ZenRoutine', 585, 1000, 64, fg, 600, -.8, 'middle')
    save(f'splash/concept-{theme}.svg', svg(1170, 2532, body, bg))

social = shell(64, 65, 92) + t('ZenRoutine', 180, 116, 43, INK, 600, -.6)
social += t('A pace you can', 64, 277, 64, INK, 500, -1.6)
social += t('return to.', 64, 353, 64, INK, 500, -1.6)
social += t('Plan gently. Make room for what matters.', 66, 429, 24, '#53685F')
social += shell(790, 205, 336)
social += '<path d="M64 530H1136" stroke="#C8D3C5" stroke-width="2"/>'
social += t('YOUR TIME. YOUR RHYTHM.', 66, 572, 14, '#53685F', 500, 1.6)
save('social/social-1200x630.svg', svg(1200, 630, social, PAPER))

palette = {'ink': INK, 'jade': JADE, 'paper': PAPER, 'evergreen': '#216653',
           'mint': '#8AC8AA', 'night': DARK, 'cream': '#FFFCF4'}
activity = {'work':'#B95142','sideProject':'#A76320','family':'#A35671',
            'fitness':'#28735B','personalDev':'#8B741A','entertainment':'#397793',
            'social':'#785A94','commute':'#61766C','food':'#8D6345',
            'hygiene':'#277E7C','sleep':'#5F678C'}
light = {'primary':'#216653','primaryDark':INK,'secondary':'#4A7560',
         'onPrimary':PAPER,'background':PAPER,'backgroundSecondary':'#E8ECDF',
         'surface':'#FFFCF4','text':INK,'textSecondary':'#53685F','textMuted':'#566B60',
         'border':'#728779','borderLight':'#D6DECE',
         'success':'#216653','warning':'#89621E','error':'#A54135','info':'#35677B',
         'focus':'#216653','activity':activity}
dark = {'primary':'#8AC8AA','primaryDark':'#A7D9BF','secondary':'#B4CBB4',
        'onPrimary':'#132B27','background':DARK,'backgroundSecondary':'#19332D',
        'surface':'#1D3832','text':PAPER,'textSecondary':'#B9CDC0','textMuted':'#9CB5A7',
        'border':'#728E7E','borderLight':'#35564A',
        'success':'#8AC8AA','warning':'#E5C57C','error':'#EAA99B','info':'#9EC7D5',
        'focus':'#B5DFC6','activity':activity}
tokens = {'brand':palette,'light':light,'dark':dark,
          'typography':{'family':'DM Sans','weights':{'body':400,'label':500,'heading':600,'emphasis':700},
                        'h1':{'fontSize':32,'lineHeight':40},'h2':{'fontSize':24,'lineHeight':32},
                        'h3':{'fontSize':20,'lineHeight':28},'body':{'fontSize':16,'lineHeight':24},
                        'bodySmall':{'fontSize':14,'lineHeight':20},'caption':{'fontSize':12,'lineHeight':16}},
          'spacing':{'xs':4,'sm':8,'md':16,'lg':24,'xl':32,'xxl':48},
          'radius':{'sm':6,'md':10,'lg':16,'xl':24,'full':9999},
          'motion':{'fast':160,'normal':240,'reducedMotion':0}}
save('tokens.json', json.dumps(tokens, indent=2)+'\n')
css = '/* ZenRoutine Shell v1: exact brand tokens. */\n'
for theme in ['light','dark']:
    css += (':root, [data-theme="light"]' if theme=='light' else '[data-theme="dark"]') + ' {\n'
    for name, value in tokens[theme].items():
        if isinstance(value,str):
            css += f'  --zr-{name}: {value};\n'
    css += '}\n'
save('tokens.css',css)

def lum(hex_value):
    c = [int(hex_value[i:i+2],16)/255 for i in (1,3,5)]
    c = [x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c]
    return sum(x*w for x,w in zip(c,[.2126,.7152,.0722]))
def contrast(a,b):
    x,y = sorted([lum(a),lum(b)])
    return (y+.05)/(x+.05)
checks=[]
for name, theme in [('light',light),('dark',dark)]:
    for fg in ['text','textSecondary','textMuted','primary','success','warning','error','info']:
        for bg in ['background','surface']:
            ratio=contrast(theme[fg],theme[bg])
            checks.append({'theme':name,'foreground':fg,'background':bg,'ratio':round(ratio,2),'minimum':4.5,'pass':ratio>=4.5})
    for fg,bg,minimum in [('onPrimary','primary',4.5),('border','surface',3),('focus','surface',3)]:
        ratio=contrast(theme[fg],theme[bg]);checks.append({'theme':name,'foreground':fg,'background':bg,'ratio':round(ratio,2),'minimum':minimum,'pass':ratio>=minimum})
save('contrast-report.json', json.dumps(checks,indent=2)+'\n')
failed=[c for c in checks if not c['pass']]
print('Contrast failures:', json.dumps(failed))
if failed:
    raise SystemExit(1)
print('Generated SVG masters, static fonts and theme tokens.')

# Compact review board, made from the same production paths.
board = t('ZenRoutine', 72, 108, 52, INK, 600, -.8)
board += t('SHELL IDENTITY / V1', 72, 148, 16, '#53685F', 500, 2)
board += shell(1010, 66, 380)
board += t('A pace you can return to.', 72, 250, 43, INK, 500, -1)
board += t('A quiet shell. A hidden Z. Progress at your own pace.', 74, 302, 23, '#53685F')
board += '<rect x="64" y="390" width="710" height="260" rx="24" fill="#FFFCF4"/>'
board += shell(96, 444, 195) + t('ZenRoutine', 327, 549, 61, INK, 600, -.8)
board += '<rect x="798" y="390" width="710" height="260" rx="24" fill="#132B27"/>'
board += shell(830, 444, 195, PAPER, '#8AC8AA') + t('ZenRoutine', 1061, 549, 61, PAPER, 600, -.8)
board += t('A SMALL, EXPRESSIVE PALETTE', 72, 717, 16, '#53685F', 500, 1.4)
for i, (name, color) in enumerate([('Ink',INK),('Jade',JADE),('Paper',PAPER),('Evergreen','#216653'),('Mint','#8AC8AA'),('Night',DARK)]):
    x=72+i*243
    board += f'<rect x="{x}" y="747" width="223" height="108" rx="12" fill="{color}" stroke="#728779"/>'
    board += t(name, x, 894, 22, INK, 500) + t(color, x, 925, 17, '#53685F')
board += t('DM Sans', 72, 1033, 51, INK, 600, -.8)
board += t('Clear, open and quietly friendly.', 72, 1084, 24, '#53685F')
board += t('Your week has room to change.', 72, 1150, 29, INK, 400)
board += t('Regular 400 / Medium 500 / Semibold 600 / Bold 700', 72, 1194, 18, '#53685F')
for x,bg,a,b in [(1060,PAPER,INK,JADE),(1294,DARK,PAPER,'#8AC8AA')]:
    board += f'<rect x="{x}" y="986" width="194" height="194" rx="42" fill="{bg}" stroke="#728779"/>'
    board += shell(x+27,1032,140,a,b)
board += t('App icon previews', 1060, 1220, 19, '#53685F')
save('preview/brand-board.svg', svg(1572, 1290, board, PAPER))
