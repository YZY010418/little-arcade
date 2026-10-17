"""Rebuild original-code SVG illustrations from both games' actual visual assets."""
from pathlib import Path
import base64, io, json, re
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'site/previews'
PAPER = ROOT / 'site/games/paper-survivor'
TOWER = ROOT / 'site/games/magic-tower'

def svg(body, defs, title, dark=False):
    background = '#141c26' if dark else '#f2efe5'
    border = '#424b53' if dark else '#d8d4c7'
    ink = '#b4c4c9' if dark else '#767b6d'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960" height="600" viewBox="0 0 960 600" role="img" aria-labelledby="title"><title id="title">{title}</title><defs><clipPath id="frame"><rect width="960" height="600" rx="26"/></clipPath>{defs}</defs><g clip-path="url(#frame)"><rect width="960" height="600" fill="{background}"/>{body}<rect x="18" y="18" width="924" height="564" rx="15" fill="none" stroke="{border}"/><g font-family="Arial, sans-serif" font-size="10" letter-spacing="2" fill="{ink}"><circle cx="42" cy="42" r="3" fill="{ink}"/><text x="55" y="46">THE ARCADE COLLECTION</text><text x="916" y="46" text-anchor="end">PREVIEW</text></g></g></svg>'''

# Reuse the exact hero-art SVG paths from the playable game's menu, not a screenshot.
source = (PAPER / 'index.html').read_text()
art = re.search(r'<svg viewBox="0 0 400 400">(.*?)</svg>', source).group(1)
art = art[:art.rfind('<g fill="#697258"')]
paper_defs = '''<pattern id="rules" width="960" height="32" patternUnits="userSpaceOnUse"><path d="M0 31.5H960" stroke="#aebdcc" stroke-opacity=".26"/></pattern><pattern id="grain" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".55" fill="#999d89" opacity=".2"/><circle cx="9" cy="10" r=".5" fill="#999d89" opacity=".13"/></pattern><radialGradient id="paperGlow"><stop stop-color="#fffdf5"/><stop offset="1" stop-color="#eae6d8"/></radialGradient><g id="idea" stroke="#7a8d66" stroke-width="2.2" stroke-linejoin="round"><path d="M0-9 7 0 0 10-7 0Z" fill="#cadbb7"/></g><g id="ghost" stroke="#30372e" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M-25 18Q-32-11-13-26Q7-37 24-17Q33-2 27 24L15 16 4 27-7 17-18 25Z" fill="currentColor"/><path d="M-9-6V0M12-7V-1"/></g><g id="burst" fill="none" stroke="#d4a758" stroke-width="3.6" stroke-linecap="round"><path d="M0-18V-8M0 8V18M-18 0H-8M8 0H18M-13-13-7-7M7 7 13 13M-13 13-7 7M7-7 13-13"/></g>'''
paper_body = '''<rect width="960" height="600" fill="url(#paperGlow)"/><rect x="38" y="68" width="884" height="494" rx="10" fill="#f8f5ec"/><rect x="38" y="68" width="884" height="494" fill="url(#rules)"/><rect width="960" height="600" fill="url(#grain)"/><path d="M111 69V561" stroke="#d9a9a0" stroke-opacity=".5" stroke-width="1.4"/><g fill="#ddd8ca" stroke="#fdfcf7" stroke-width="2"><circle cx="76" cy="132" r="9"/><circle cx="76" cy="300" r="9"/><circle cx="76" cy="468" r="9"/></g><path d="M157 449Q266 508 343 432Q411 366 501 402Q600 449 720 352" fill="none" stroke="#aab59b" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 12" opacity=".65"/><g fill="none" stroke="#81926e" stroke-width="2" opacity=".28"><ellipse cx="494" cy="307" rx="225" ry="168" transform="rotate(-15 494 307)"/><path d="M238 370Q210 249 311 171M699 214Q758 331 677 420" stroke-width="4" stroke-linecap="round"/></g>'''
paper_body += f'<g transform="translate(280 94) scale(1.05)">{art}</g>'
paper_body += '''<use xlink:href="#ghost" transform="translate(221 255) rotate(-14) scale(1.2)" color="#e4b79f"/><use xlink:href="#ghost" transform="translate(755 200) rotate(13) scale(.94)" color="#c6cde5"/><use xlink:href="#ghost" transform="translate(739 450) rotate(-9) scale(.75)" color="#d9cd9d"/><g><use xlink:href="#idea" transform="translate(308 432)"/><use xlink:href="#idea" transform="translate(331 418) scale(.8)"/><use xlink:href="#idea" transform="translate(683 302) rotate(13)"/><use xlink:href="#idea" transform="translate(714 311) scale(.65)"/><use xlink:href="#idea" transform="translate(584 476) scale(.75)"/></g><use xlink:href="#burst" transform="translate(690 161) scale(.7)"/><use xlink:href="#burst" transform="translate(237 381) scale(.5)"/><g stroke="#b58f49" stroke-width="3" stroke-linecap="round"><path d="M665 232 687 223M665 243 688 244M651 221 663 202"/></g><g font-family="Courier New, monospace" fill="#7e886b"><text x="171" y="165" font-size="14" transform="rotate(-8 171 165)">a little inspiration.</text><text x="669" y="378" font-size="14" transform="rotate(9 669 378)">keep moving!</text><text x="164" y="522" font-size="10" letter-spacing="2">INK. IDEAS. ONE MORE TRY.</text></g><g transform="translate(805 492) rotate(-8)" stroke="#8b967d" fill="none" opacity=".7"><rect x="-49" y="-22" width="98" height="44" rx="3" stroke-width="1.4"/><text text-anchor="middle" y="-3" font-family="Arial,sans-serif" font-size="10" letter-spacing="2" fill="#7e886b" stroke="none">PLAY</text><text text-anchor="middle" y="12" font-family="Arial,sans-serif" font-size="10" letter-spacing="2" fill="#7e886b" stroke="none">EVERY DAY</text></g>'''
(OUT / 'paper-survivor.svg').write_text(svg(paper_body, paper_defs, '纸上幸存者：用游戏原始涂鸦角色绘制的纸张战斗预览'))

# True first-floor tiles and player, composed as pixel-art board and inventory still life.
project = TOWER / 'game/project'
load = lambda p: json.loads(p.read_text().split('=', 1)[1])
icons, maps = load(project / 'icons.js'), load(project / 'maps.js')
floor = load(project / 'floors/MT1.js')
def image_data(im):
    data=io.BytesIO();im.save(data,format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(data.getvalue()).decode()
def original(relative):
    return Image.open(TOWER / 'asset' / (relative + '.png')).convert('RGBA')
needed = set(v for row in floor['map'] for v in row if v and v!=127)
tile_images={'ground':original('GROUND/ground'),'hero':original('PLAYER1')}
for tile in needed:
    detail=maps[str(tile)];name=detail['id'];row=icons[detail['cls']][name]
    atlas=Image.open(project / 'materials' / (detail['cls']+'.png')).convert('RGBA')
    tile_images[str(tile)]=atlas.crop((0,row*32,32,row*32+32))
for key,relative in {'sword':'WEAPON/holy_sword','shield':'WEAPON/holy_shield','key':'ITEM/key_yellow','potion':'ITEM/medicine_red','slime':'MONSTER/green_slime_1','bat':'MONSTER/tiny_bat_1','skeleton':'MONSTER/skeleton_1','gem':'ITEM/crystal_blue'}.items():
    tile_images[key]=original(relative)
image_defs=''.join(f'<image id="tile-{key}" width="32" height="32" xlink:href="{image_data(im)}" image-rendering="pixelated"/>' for key,im in tile_images.items())
tower_defs='''<radialGradient id="towerGlow" cx="63%" cy="44%" r="70%"><stop stop-color="#33404b"/><stop offset=".62" stop-color="#1d2732"/><stop offset="1" stop-color="#101820"/></radialGradient><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#aac9d6" stroke-opacity=".025"/></pattern><linearGradient id="gold" x2="1" y2="1"><stop stop-color="#e0c188"/><stop offset="1" stop-color="#a27948"/></linearGradient>'''+image_defs
body='''<rect width="960" height="600" fill="url(#towerGlow)"/><rect width="960" height="600" fill="url(#grid)"/><circle cx="628" cy="299" r="259" fill="none" stroke="#b8c5bd" stroke-opacity=".05"/><circle cx="628" cy="299" r="237" fill="none" stroke="#b8c5bd" stroke-opacity=".05"/><path d="M68 104H299M68 514H299" stroke="#586365" stroke-width="1"/><g font-family="Arial,sans-serif"><text x="72" y="88" font-size="10" letter-spacing="4" fill="#acb6b2">A CLASSIC ADVENTURE</text><text x="69" y="179" font-size="76" font-weight="700" letter-spacing="-3" fill="url(#gold)">50</text><text x="177" y="159" font-size="12" letter-spacing="4" fill="#b3c0c0">FLOORS</text><text x="179" y="179" font-size="9" letter-spacing="2" fill="#7f939d">ONE WAY UP</text></g><ellipse cx="182" cy="337" rx="87" ry="20" fill="#071014" opacity=".6"/><circle cx="183" cy="282" r="90" fill="none" stroke="#62756f" stroke-opacity=".25" stroke-dasharray="3 8"/><g image-rendering="pixelated"><use xlink:href="#tile-hero" transform="translate(127 226) scale(3.5)"/><use xlink:href="#tile-bat" transform="translate(252 205) scale(1.5)"/><use xlink:href="#tile-slime" transform="translate(76 324) scale(1.75)"/><use xlink:href="#tile-skeleton" transform="translate(260 320) scale(1.5)"/></g><g font-family="Arial,sans-serif" fill="#87999d" font-size="9" letter-spacing="2"><text x="73" y="401">GEAR UP. CHOOSE WISELY.</text><text x="73" y="540">PIXEL ART / STRATEGY / SECRETS</text></g>'''
for i,item in enumerate(['sword','shield','key','potion']):
    x=72+i*61
    body+=f'<rect x="{x}" y="421" width="49" height="61" rx="7" fill="#18212b" stroke="#3d4b53"/><use xlink:href="#tile-{item}" transform="translate({x+8.5} 432)"/><path d="M{x+17} 473H{x+32}" stroke="#725e41"/>'
body+='''<rect x="382" y="88" width="454" height="454" rx="14" fill="#090f16" opacity=".4"/><rect x="372" y="78" width="454" height="454" rx="14" fill="#1b242d" stroke="#6b6252"/><rect x="382" y="88" width="434" height="434" rx="5" fill="#11161d" stroke="#a48958" stroke-opacity=".65"/><g transform="translate(391 97)" image-rendering="pixelated">'''
for y,row in enumerate(floor['map']):
    for x,tile in enumerate(row):
        body+=f'<use xlink:href="#tile-ground" x="{x*32}" y="{y*32}"/>'
        if tile and tile!=127:body+=f'<use xlink:href="#tile-{tile}" x="{x*32}" y="{y*32}"/>'
body+='<use xlink:href="#tile-hero" x="192" y="352"/></g>'
body+='''<path d="M380 95V87H388M810 87H818V95M380 515V523H388M810 523H818V515" fill="none" stroke="#d1b87e" stroke-width="2"/><g transform="translate(802 122)"><rect x="0" y="0" width="72" height="34" rx="4" fill="#d1b578"/><text x="36" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" letter-spacing="1" fill="#24272a">FLOOR 01</text></g><g transform="translate(851 332)" opacity=".7"><path d="M0 39V-24M-10-12 0-24 10-12" stroke="#8b9f9e" stroke-width="1.4" fill="none"/><text x="0" y="61" font-family="Arial,sans-serif" font-size="9" letter-spacing="2" fill="#9caeab" text-anchor="middle">UP</text></g>'''
(OUT/'magic-tower.svg').write_text(svg(body,tower_defs,'50 层魔塔：使用上传素材拼接的真实第一层地图与勇者预览',True))
for p in OUT.glob('*.svg'):print(p.name,p.stat().st_size)
