import re, os, sys, subprocess
S=sys.argv[1]; OUT=sys.argv[2]
os.makedirs(f"{OUT}/svg",exist_ok=True); os.makedirs(f"{OUT}/png",exist_ok=True)

def load(p):
    s=open(p).read()
    vb=re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"',s); W,H=float(vb[1]),float(vb[2])
    tr=re.search(r'<g transform="([^"]+)"',s)[1]
    paths="".join(re.findall(r'<path d="[^"]+"/>',s))
    return W,H,tr,paths
MW,MH,MT,MP=load(f"{S}/trace/spyglass.svg")   # mark
WW,WH,WT,WP=load(f"{S}/trace/word.svg")       # wordmark
BASE=478.0  # baseline inside word box
INK="#203d32"; GREEN="#285c47"; CREAM="#f8f6ef"; ORANGE="#d96738"; SEPIA="#2b1608"; MOSS="#e5ebdf"

def mark(x,y,w,fill):
    s=w/MW
    return f'<g transform="translate({x:.2f},{y:.2f}) scale({s:.6f})"><g transform="{MT}" fill="{fill}">{MP}</g></g>'
def word(x,y,h,fill,dot=ORANGE):
    """h = height from ascender top to baseline. returns (svg, total width)"""
    s=h/BASE; r=62*s; gap=48*s
    g=f'<g transform="translate({x:.2f},{y:.2f}) scale({s:.6f})"><g transform="{WT}" fill="{fill}">{WP}</g></g>'
    cx=x+WW*s+gap+r; cy=y+BASE*s-r
    g+=f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="{dot}"/>'
    return g, WW*s+gap+2*r, (WH-BASE)*s  # width, descender depth
def svg(w,h,body,bg=None,rx=0):
    b=f'<rect width="{w}" height="{h}" rx="{rx}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">{b}{body}</svg>'
files={}
def put(name,s): files[name]=s; open(f"{OUT}/svg/{name}.svg","w").write(s)

# 1. Mark only
mh=MH; mw=MW
for n,c in [("ink",INK),("cream",CREAM),("orange",ORANGE),("green",GREEN),("sepia",SEPIA)]:
    put(f"mark-{n}", svg(mw,mh,mark(0,0,mw,c)))
# 2. Wordmark only
for n,c in [("ink",INK),("cream",CREAM)]:
    g,w,d=word(0,0,BASE,c); put(f"wordmark-{n}", svg(w,BASE+d,g))
# 3. Horizontal lockup
def horizontal(fill):
    wh=BASE; markw=1.45*wh*MW/MH; markh=1.45*wh; gap=0.30*wh
    H=max(markh, wh+(WH-BASE)); 
    mtop=(wh/2)-markh/2  # center mark on x-height-ish band
    pad=max(0,-mtop); 
    g=mark(0,mtop+pad,markw,fill)
    wg,ww,d=word(markw+gap,pad,wh,fill); g+=wg
    return svg(markw+gap+ww, pad+wh+d, g)
put("lockup-horizontal-ink", horizontal(INK)); put("lockup-horizontal-cream", horizontal(CREAM))
# 4. Stacked lockup
def stacked(fill):
    wg,ww,d=word(0,0,BASE,fill); markw=0.62*ww; markh=markw*MH/MW; gap=0.33*BASE
    wg,ww,d=word(0,markh+gap,BASE,fill)
    return svg(ww, markh+gap+BASE+d, mark((ww-markw)/2,0,markw,fill)+wg)
put("lockup-stacked-ink", stacked(INK)); put("lockup-stacked-cream", stacked(CREAM))
# 5. App icons (1024, 22% radius)
def icon(bg,fg,size=1024,rx=None):
    rx=rx if rx is not None else size*0.224
    mw=size*0.74; mh=mw*MH/MW
    return svg(size,size,mark((size-mw)/2,(size-mh)/2,mw,fg),bg=bg,rx=rx)
put("app-icon-cream", icon(CREAM,INK)); put("app-icon-green", icon(GREEN,CREAM)); put("app-icon-orange", icon(ORANGE,CREAM)); put("app-icon-ink", icon(INK,CREAM))
put("app-icon-square-green", icon(GREEN,CREAM,rx=0))  # iOS masks its own corners
# 5b. Simplified glyph for tiny sizes (geometric spyglass)
def glyph(bg,fg,size=64,rx=None):
    rx=size*0.22 if rx is None else rx
    g=f'<g transform="translate(33,33) rotate(-30)" fill="{fg}">'
    # lens cap (big ring) -> three stepped tube segments with collar gaps -> eyepiece
    g+=f'<circle cx="-19" cy="0" r="11.5"/><circle cx="-19" cy="0" r="5" fill="{bg}"/>'
    g+='<rect x="-10" y="-8" width="13" height="16" rx="2"/>'
    g+='<rect x="4.5" y="-6" width="11" height="12" rx="2"/>'
    g+='<rect x="17" y="-4.5" width="9" height="9" rx="1.5"/>'
    g+='<rect x="27.5" y="-3" width="4" height="6" rx="1"/></g>'
    return svg(size,size,f'<g transform="scale({size/64})">{g}</g>',bg=bg,rx=rx)
put("favicon", glyph(GREEN,CREAM)); put("glyph-green", glyph(GREEN,CREAM,size=512)); put("glyph-cream", glyph(CREAM,INK,size=512)); put("glyph-orange", glyph(ORANGE,CREAM,size=512))
# 6. Social avatar (circle)
def avatar(bg,fg,size=1024):
    mw=size*0.70; mh=mw*MH/MW
    return svg(size,size,f'<circle cx="{size/2}" cy="{size/2}" r="{size/2}" fill="{bg}"/>'+mark((size-mw)/2,(size-mh)/2,mw,fg))
put("avatar-green", avatar(GREEN,CREAM)); put("avatar-cream", avatar(CREAM,INK))
# 7. OG / social cards 1200x630
FONT="'Avenir Next','Helvetica Neue',Arial,sans-serif"
def og(bg,fg,sub,tag="Find your next little adventure."):
    wh=125; markw=1.45*wh*MW/MH; markh=1.45*wh; gap=0.30*wh
    _,ww,d=word(0,0,wh,fg); total=markw+gap+ww
    x0=(1200-total)/2; y0=215
    g=mark(x0,y0+wh/2-markh/2,markw,fg); g+=word(x0+markw+gap,y0,wh,fg)[0]
    g+=f'<text x="600" y="455" text-anchor="middle" font-family="{FONT}" font-weight="500" font-size="40" fill="{sub}">{tag}</text>'
    g+=f'<text x="600" y="560" text-anchor="middle" font-family="{FONT}" font-weight="600" font-size="22" letter-spacing="6" fill="{sub}">EXPLORIN · NEW YORK CITY</text>'
    return svg(1200,630,g,bg=bg)
put("og-card-cream", og(CREAM,INK,"#64756b")); put("og-card-green", og(GREEN,CREAM,"#cfdccd"))
# 8. Banner 1500x500 (X/LinkedIn header)
def banner(bg,fg):
    wh=140; markw=1.45*wh*MW/MH; markh=1.45*wh; gap=0.30*wh
    _,ww,d=word(0,0,wh,fg); total=markw+gap+ww; x0=(1500-total)/2; y0=250-wh/2
    return svg(1500,500, mark(x0,y0+wh/2-markh/2,markw,fg)+word(x0+markw+gap,y0,wh,fg)[0], bg=bg)
put("banner-cream", banner(CREAM,INK)); put("banner-green", banner(GREEN,CREAM))
# 9. Pattern tile (subtle moss on cream, for backgrounds)
tile=''.join(mark(80+ (i%2)*640, 60+ (i//2)*420 + (i%2)*210, 480, MOSS) for i in range(6))
put("pattern-tile", svg(1280,1260,tile,bg=CREAM))

# PNG renders
jobs=[("app-icon-green",[1024,512,192,180]),("favicon",[64,48,32,16]),("glyph-green",[512]),("glyph-cream",[512]),("glyph-orange",[512]),("app-icon-cream",[1024,512]),("app-icon-orange",[1024,512]),("app-icon-ink",[1024]),
      ("app-icon-square-green",[1024]),("avatar-green",[1024,400]),("avatar-cream",[400]),
      ("lockup-horizontal-ink",[2400,1200]),("lockup-horizontal-cream",[2400,1200]),("lockup-stacked-ink",[1600]),("lockup-stacked-cream",[1600]),
      ("mark-ink",[1600]),("mark-cream",[1600]),("mark-orange",[1600]),("mark-sepia",[1600]),("wordmark-ink",[1600]),("wordmark-cream",[1600]),
      ("og-card-cream",[1200]),("og-card-green",[1200]),("banner-cream",[1500]),("banner-green",[1500]),("pattern-tile",[1280])]
for n,sizes in jobs:
    for w in sizes:
        subprocess.run(["rsvg-convert","-w",str(w),f"{OUT}/svg/{n}.svg","-o",f"{OUT}/png/{n}-{w}.png"],check=True)
print("wrote",len(files),"svgs")
