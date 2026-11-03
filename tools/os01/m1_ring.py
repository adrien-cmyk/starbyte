"""M1 : anneau, croisements, bras radiaux, jetée-hangar. Unité : px vue de face."""
import numpy as np, math, random
from kit import *
RI,RO=448.,588.
HT=60.   # demi-hauteur du caisson
SPOKES=[0,45,90,135,180,225,270,315]
HANG=270.
def angdist(a,b):
    d=(a-b+180)%360-180;return d
def oct_sec(r0,r1,z0,z1,c):
    return [(r0+c,z0),(r1-c,z0),(r1,z0+c),(r1,z1-c),(r1-c,z1),(r0+c,z1),(r0,z1-c),(r0,z0+c)]
def ring_core(b):
    # âme sombre continue sauf la bouche du hangar
    for t0,t1 in ((-90+9.5,270-9.5),):
        b.arc(oct_sec(RI+4,RO-8,-HT+2,HT-2,20),t0,t1,'GREY',step=1.5)
    # couronnes internes (rails) dessus / dessous
    for sg in (1,-1):
        for r0,r1,z,mat in ((RI-2,486,HT-2,'WHITE2'),(552,RO-6,HT-5,'STEEL')):
            for t0,t1 in ((-90+9.5,270-9.5),):
                z0,z1=(z-6,z+1) if sg>0 else (-z-1,-z+6)
                b.arc([(r0,z0),(r1,z0),(r1,z1),(r0,z1)],t0,t1,mat,step=1.5)
    # tubes longitudinaux
    for r,z,w in ((RI+3,HT+3,2.6),(RI+13,HT+4,2.0),(RO-16,HT+1,2.4),(RO-2,HT-16,2.6),(RO-2,-HT+16,2.6),(RI-3,HT-14,2.4),(RI-3,-HT+14,2.4),(RI-3,0,3.),(RO+1,10,1.8),(RO+1,-10,1.8)):
        n=6;sec=[(r+w*math.cos(i*6.283/n),z+w*math.sin(i*6.283/n)) for i in range(n)]
        b.arc(sec,-90+9.5,270-9.5,'STEEL' if z>0 else 'GREY',step=2.5,caps=False)
def plates_between(rng,t0,t1,nmin=3,nmax=4):
    n=rng.randint(nmin,nmax);w=[rng.uniform(.8,1.25) for _ in range(n)];s=sum(w);out=[];a=t0
    for x in w:
        d=(t1-t0)*x/s;out.append((a,a+d));a+=d
    return out
def top_plates(b,bw,bd,rng):
    """plaques blanches du dessus (et du dessous en plus sombre) entre croisements"""
    edges=[]
    for i,sp in enumerate(SPOKES):
        t0=sp+8.5;t1=sp+45-8.5
        edges.append((t0,t1))
    extra={(225+8.5,270-8.5):(247.0-4.2,250.5),(270+8.5,315-8.5):(289.5,293.0+4.0)}
    for (t0,t1) in edges:
        segs=[(t0,t1)]
        if (t0,t1) in extra:
            a,c=extra[(t0,t1)];segs=[(t0,a),(c,t1)]
        for s0,s1 in segs:
            for a,c in plates_between(rng,s0,s1,2 if s1-s0<15 else 3,3 if s1-s0<15 else 4):
                g=.5
                # plaque pleine, chanfreinée
                hi=HT+rng.uniform(5,10)
                sec=[(487,HT-4),(552,HT-4),(552,hi-4),(548,hi),(491,hi),(487,hi-4)]
                b.arc(sec,a+g,c-g,'WHITE',step=1.2)
                # sous-joint : couture sombre et sous-panneaux
                if rng.random()<.8:
                    m=rng.uniform(.35,.65)*(c-a)+a
                    bd.arc([(490,hi-.5),(550,hi-.5),(550,hi+.14),(490,hi+.14)],m-.05,m+.05,'DARK',step=2)
                if rng.random()<.7:
                    rr=rng.uniform(505,535)
                    bd.arc([(rr-.3,hi-.5),(rr+.3,hi-.5),(rr+.3,hi+.14),(rr-.3,hi+.14)],a+.5,c-.5,'DARK',step=2)
                # griffures fines
                for _ in range(rng.randint(1,3)):
                    r0=rng.uniform(495,545);t=rng.uniform(a+.8,c-.8)
                    bd_scratch(bd,r0,t,hi+.15,rng)
                # évents (rangée intérieure)
                tm=(a+c)/2;dt=(c-a)*rng.uniform(.28,.42)
                for r0,r1,mat in ((470,483,'DARK'),):
                    b.arc([(r0,HT-1),(r1,HT-1),(r1,HT+2.5),(r0,HT+2.5)],tm-dt,tm+dt,mat,step=2)
                    nb=rng.randint(5,9)
                    for k in range(nb):
                        tt=tm-dt+(2*dt)*(k+.5)/nb
                        bd.arc([(r0+2,HT+2.5),(r1-2,HT+2.5),(r1-2,HT+3.2),(r0+2,HT+3.2)],tt-.28*dt/nb*2,tt+.28*dt/nb*2,'LIGHT' if rng.random()<.25 else 'STEEL',step=2)
                # rivets
                for r_ in (491,548):
                    for tt in np.linspace(a+.6,c-.6,max(3,int((c-a)/1.6))):
                        rv(bw,r_,tt,hi)
                # dessous
                lo=-HT-rng.uniform(3.5,6)
                sec=[(490,lo+2),(550,lo+2),(552,-HT+4),(487,-HT+4),]
                sec=[(487,-HT+4),(487,lo+2),(490,lo),(549.5,lo),(552,lo+2),(552,-HT+4)]
                b.arc(sec,a+g,c-g,'WHITE2',step=1.5)
def pol(r,t,z=0.):
    a=math.radians(t);return (r*math.cos(a),r*math.sin(a),z)
def rv(b,r,t,z,h=.7,rr=.9):
    p=np.array(pol(r,t,z));b.cyl(p,p+(0,0,h),rr,'GREY',n=5,r2=rr*.7,caps=True)
def bd_scratch(b,r,t,z,rng):
    a=math.radians(t);d=rng.uniform(5,16);ang=rng.uniform(0,6.28)
    p0=np.array(pol(r,t,z));p1=p0+np.array([math.cos(ang),math.sin(ang),0])*d
    b.beam(p0,p1,.45,'DARK',h=.12)
def collar(b,bd,th,off,w=15.5,yellow=True,full=True):
    """sangle en C hexagonal (vue de face) : part de RI+8, passe dessus, descend le flanc extérieur, revient dessous.
       dans le repère polaire du rayon th ; off = décalage tangent"""
    mat='YELLOW' if yellow else 'GREY'
    h=HT+11;ro=RO+11;c=26
    ro_=ro+ (0)
    b.polar(math.radians(th))
    r0=RI+6 if full else RO-30
    outer=[(r0,h),(ro_-c,h),(ro_,h-c),(ro_,-h+c),(ro_-c,-h),(r0,-h),(r0,-h+9),(ro_-c-4,-h+9),(ro_-10,-h+c+4),(ro_-10,h-c-4),(ro_-c-4,h-9),(r0,h-9)]
    # extrusion tangentielle : axe x local, (u,v)=(y,z)
    b.poly(outer,'x',off-w/2,off+w/2,mat)
    # plaques/rivets/fente
    for rr in np.linspace(r0+10,ro-c-6,5 if full else 2):
        p=(off,rr,h);b.cyl(p,(off,rr,h+.9),1.5,'DARK',n=6);
        b.cyl((off,rr,-h),(off,rr,-h-.9),1.5,'DARK',n=6)
    b.box((off,ro_+.2,0),(w*.55,1.2,h*1.25),'DARK')
    for zz in (-34,-14,6,26):
        bd.box((off,ro_+.6,zz),(w*.42,.8,5),'LIGHT' if yellow and zz%2==0 and False else 'STEEL')
    b.box((off-w/2+1.5,ro_+.2,0),(1.2,.8,h*1.5),'GREY');b.box((off+w/2-1.5,ro_+.2,0),(1.2,.8,h*1.5),'GREY')
    b.pop()
def crossings(b,bd):
    for th in SPOKES:
        if th==HANG: continue
        # bloc de croisement sombre + plaque
        b.arc(oct_sec(RI-6,RO+4,-HT-3,HT+3,18),th-8,th+8,'DARK',step=2)
        for off in (-27,27):
            collar(b,bd,th,off,w=20)
        # âme claire du milieu : pont du rayon qui traverse
        b.polar(math.radians(th))
        b.box((0,(RI+RO)/2,HT+1),(30,RO-RI-8,8),'DECK',ch=1.2)
        for rr in np.arange(RI+8,RO-8,12):
            b.box((0,rr,HT+5.2),(18,8,.7),'STEEL')
            b.box((-11,rr,HT+5.1),(2,5,.8),'DARK');b.box((11,rr,HT+5.1),(2,5,.8),'DARK')
        b.pop()
    # sangles flanquant le hangar
    for th in (270-20.5,270+20.5):
        b.arc(oct_sec(RI-4,RO+2,-HT-2,HT+2,18),th-5.2,th+5.2,'DARK',step=2)
        collar(b,bd,th,-17,w=21);collar(b,bd,th,17,w=21)
        b.polar(math.radians(th))
        for rr in np.arange(RI+14,RO-4,15):
            b.box((0,rr,HT+3),(11,10,3),'STEEL',ch=.5)
            b.box((0,rr,HT+4.6),(7,6,.5),'DARK')
        b.pop()
def facade(b,bd,rng):
    """face extérieure de l'anneau : grands panneaux blancs / baies machines ambre / demi-colliers"""
    for ax in (0,90,180,270):
        for sg in (1,-1):
            def T(p): return ax+sg*p
            # panneaux blancs à côté de l'axe
            if ax==270: panels=[(9.5,14.6),(14.8,18.2)]
            else: panels=[(6.5,12.5),(12.7,18.2)]
            for a,c in panels:
                t0,t1=sorted((T(a),T(c)))
                sec=[(RO-8,-HT+15),(RO+3.5,-HT+22),(RO+3.5,HT-22),(RO-8,HT-15)]
                b.arc(sec,t0,t1,'WHITE',step=1.0)
                # fente, croix, plaques
                tm=(t0+t1)/2
                b.polar(math.radians(tm))
                wd=math.radians(t1-t0)*RO
                b.box((0,RO+3.8,1),(wd*.7,1,3.2),'DARK')
                for k in range(int(wd*.7/4)):
                    bd.box((-wd*.33+k*4,RO+4.4,1),(2.4,.5,2.2),'LIGHT' if ax==270 and k%3==0 else 'STEEL')
                # marquage en X
                for s1 in (-1,1):
                    bd.beam((s1*wd*.12,RO+3.7,0),(s1*wd*.38,RO+3.7,HT*.5),.8,'DARK',h=.5)
                    bd.beam((s1*wd*.12,RO+3.7,0),(s1*wd*.38,RO+3.7,-HT*.5),.8,'DARK',h=.5)
                bd.box((0,RO+3.9,HT*.54),(wd*.4,.6,3),'DARK');bd.box((0,RO+3.9,-HT*.54),(wd*.4,.6,3),'DARK')
                for u in (-wd*.42,wd*.42):
                    for v in (-HT*.5,0,HT*.5):
                        bd.cyl((u,RO+3.5,v),(u,RO+4.5,v),1.3,'GREY',n=6)
                b.pop()
                # chanfreins haut/bas
                b.arc([(RO-10,HT-14),(RO+3.5,HT-22),(RO-1,HT-8),(RO-12,HT-2)],t0,t1,'WHITE2',step=1.2)
                b.arc([(RO-12,-HT+2),(RO-1,-HT+8),(RO+3.5,-HT+22),(RO-10,-HT+14)],t0,t1,'WHITE2',step=1.2)
            # demi-collier 18.5-23.7 (hangar : plein déjà construit)
            if ax!=270:
                for p in (19.4,22.8):
                    collar(b,bd,T(p),0,w=13,full=False)
                b.polar(math.radians(T(21.1)))
                b.box((0,RO-4,0),(10,10,HT*1.4),'DARK')
                for zz in np.arange(-36,40,8):
                    bd.box((0,RO+.5,zz),(7,2,3),'STEEL')
                b.pop()
            # baie machines 23.7-38.5
            t0,t1=sorted((T(24.2),T(38.2)))
            b.arc([(RO-22,-HT+10),(RO-16,-HT+10),(RO-16,HT-10),(RO-22,HT-10)],t0,t1,'DARK',step=1.5)
            # auvent blanc au-dessus, plaque basse
            nn=4
            for k in range(nn):
                a=t0+(t1-t0)*k/nn+.12;c=t0+(t1-t0)*(k+1)/nn-.12
                b.arc([(RO-22,10),(RO+2,10),(RO+2,HT-16),(RO-10,HT-3),(RO-22,HT-3)],a,c,'WHITE',step=1.2)
            for k in range(nn+2):
                a=t0+(t1-t0)*k/(nn+2)+.1;c=t0+(t1-t0)*(k+1)/(nn+2)-.1
                b.arc([(RO-22,-HT+5),(RO-6,-HT+5),(RO+2,-HT+13),(RO+2,-HT+24),(RO-22,-HT+22)],a,c,'WHITE2' if k%2 else 'STEEL',step=1.2)
            tm=(t0+t1)/2;wd=math.radians(t1-t0)*RO
            b.polar(math.radians(tm))
            # poutres horizontales et tuyaux
            for zz,hh,mat in ((6,3,'STEEL'),(-26,4,'STEEL')):
                b.box((0,RO-6,zz),(wd*1.0,7,hh),mat)
            for zz in (3,-23):
                b.cyl((-wd*.5,RO-2,zz),(wd*.5,RO-2,zz),1.5,'GREY',n=6)
            # fenêtres ambre (rangée)
            nw=6
            for k in range(nw):
                u=-wd*.36+k*wd*.72/(nw-1)
                b.box((u,RO-5,-10),(wd*.1,5,18),'GREY',ch=.8)
                b.box((u,RO-2.4,-10),(wd*.075,.6,13),'AMBER')
                for zz in (-14,-10,-6):
                    bd.box((u,RO-1.9,zz),(wd*.078,.3,.8),'DARK')
                bd.box((u,RO-1.9,-10),(.7,.3,13),'DARK')
            # blocs techniques
            for k in range(6):
                u=rng.uniform(-wd*.45,wd*.45);
                bd.box((u,RO-3,rng.choice([13,-18,24])),(rng.uniform(5,12),rng.uniform(4,8),rng.uniform(3,7)),rng.choice(['GREY','STEEL','DARK']),ch=.5)
            for u in (-wd*.5,wd*.5):
                b.box((u,RO-6,0),(4,10,HT*1.45),'GREY',ch=.6)
            b.pop()
            # zone de transition derrière le croisement diagonal 38.5-45 : panneaux
            t0,t1=sorted((T(37.9),T(45)))
    # fond plein rayon cardinal hors hangar : voile de rayons
def bumps(b,rng):
    """petits modules sur les bords intérieur et extérieur (vue de dessus)"""
    for t in np.arange(0,360,3.0):
        ok=all(abs(angdist(t,s))>9 for s in SPOKES)
        if not ok or rng.random()<.25: continue
        if abs(angdist(t,250))<7 or abs(angdist(t,290))<7: continue
        b.polar(math.radians(t))
        if rng.random()<.8:
            r=RI-7;w=rng.uniform(14,26);d=rng.uniform(10,20);h=rng.uniform(14,36);zc=rng.choice([HT-18,-HT+18,0,HT-24])
            b.box((0,r,zc),(w,d,h),rng.choice(['GREY','STEEL','DARK','WHITE2']),ch=1.2)
            b.box((0,r-d/2-.4,zc),(w*.6,1,h*.55),'DARK')
            if rng.random()<.35: b.box((0,r-d/2-.9,zc),(w*.45,.4,h*.25),rng.choice(['AMBER','BLUE']))
        if rng.random()<.45:
            r=RO+3
            b.box((0,r,HT-11),(rng.uniform(10,20),6,12),rng.choice(['DARK','GREY']),ch=.8)
        b.pop()
def spoke_inner(b,bd,th,w,rng,kind='card'):
    b.polar(math.radians(th))
    r0,r1=170.,RI+2.
    L=r1-r0;rc=(r0+r1)/2
    hz=14 if kind=='card' else 16
    b.poly([(-w,-hz+4),(-w+4,-hz),(w-4,-hz),(w,-hz+4),(w,hz-4),(w-4,hz),(-w+4,hz),(-w,hz-4)],'y',r0,r1,'GREY')
    # plateau central, rails jaunes, voie
    b.box((0,rc,hz+1.2),(w*1.12,L,2.4),'WHITE2')
    b.box((0,rc,hz+2.8),(w*.72,L,1.2),'STEEL')
    b.box((0,rc,hz+3.6),(w*.3,L-10,.7),'WHITE')
    for sx in (-1,1):
        b.box((sx*w*.42,rc,hz+3.8),(1.5,L,1.2),'YELLOW')
        b.box((sx*(w-2.5),rc,hz+2),(3.4,L,3),'STEEL')
    # fenêtres rect. dans l'axe
    n=int(L/32)
    for i in range(n):
        y=r0+18+i*(L-30)/max(1,n-1)
        w2=w*.38 if i%2 else w*.26
        b.box((0,y,hz+4.1),(w2,9 if i%2 else 6,.8),'DARK')
        bd.box((0,y,hz+4.7),(w2*.75,5 if i%2 else 3,.3),'BLUE' if i%2==0 else 'LIGHT')
        for sx in (-1,1):
            bd.cyl((sx*w*.3,y+7,hz+3.4),(sx*w*.3,y+7,hz+4.3),1,'DARK',n=6)
    # flancs : baies ambre + modules, dessous treillis
    for sx in (-1,1):
        n2=int(L/22)
        for i in range(n2):
            y=r0+12+i*L/n2
            if rng.random()<.75:
                d=rng.uniform(5,9);h=rng.uniform(9,18);ln=rng.uniform(10,18)
                b.box((sx*(w+d/2-.5),y,rng.uniform(-3,3)),(d,ln,h),rng.choice(['GREY','STEEL','DARK','WHITE2']),ch=.8)
            if i%2==0:
                b.box((sx*(w+.4),y,0),(1,9,5),'AMBER' if rng.random()<.8 else 'BLUE')
    # poutre basse
    b.truss((0,r0,-hz-6),(0,r1,-hz-6),w*.9,10,int(L/24),'GREY',bar=1.0,chord=1.8)
    b.pop()
def arm_outer(b,bd,th,tip,w,hz,rng,kind='card',shift=0.,zoff=0.):
    """bras extérieur (au-delà de l'anneau). repère polaire. tip : rayon de bout de coque"""
    b.polar(math.radians(th))
    b.push(None,(shift,0,zoff))
    r0=RO-4
    # épaule (transition depuis l'anneau)
    sh=r0+46
    b.poly([(-w-10,-HT+6),(w+10,-HT+6),(w+10,HT-6),(-w-10,HT-6)],'y',r0-8,r0+4,'GREY')
    pts0=[(-w-4,-HT+16),(-w+8,-HT+6),(w-8,-HT+6),(w+4,-HT+16),(w+4,HT-16),(w-8,HT-6),(-w+8,HT-6),(-w-4,HT-16)]
    c=12
    pts1=[(-w,-hz+c),(-w+c,-hz),(w-c,-hz),(w,-hz+c),(w,hz-c),(w-c,hz),(-w+c,hz),(-w,hz-c)]
    V=[(u,r0+4,v) for u,v in pts0]+[(u,sh,v) for u,v in pts1]
    f=[(i,(i+1)%8,8+(i+1)%8,8+i) for i in range(8)]
    b.add(V,[q[::-1] for q in f],'STEEL')
    # coque principale
    b.poly(pts1,'y',sh,tip-8,'GREY')
    # plaques dessus/dessous en tuiles
    y=sh+3
    i=0
    while y<tip-14:
        ln=rng.uniform(26,50);ln=min(ln,tip-14-y)
        for sz in (1,-1):
            b.box((0,y+ln/2,sz*(hz+.8)),(2*w-2*c+2,ln-1.5,2.4),('WHITE' if i%2==0 else 'WHITE2') if sz>0 else 'STEEL',ch=.6)
            for sx in (-1,1):
                V=[(sx*(w-c+1),y+.7,sz*(hz+.2)),(sx*(w+.5),y+.7,sz*(hz-c-1)),(sx*(w+.5),y+ln-.8,sz*(hz-c-1)),(sx*(w-c+1),y+ln-.8,sz*(hz+.2))]
                b.add(V,[(0,1,2,3),(3,2,1,0)],'WHITE2' if (i+sx)%3 else 'STEEL')
        # marquages du dessus
        if ln>24:
            b.box((0,y+ln/2,hz+2.2),(w*.5,ln*.34,.6),'DARK')
            for k in range(5):
                bd.box((-w*.2+k*w*.1,y+ln/2,hz+2.6),(w*.07,ln*.24,.3),'BLUE' if i%2==0 else ('LIGHT' if k%2 else 'STEEL'))
            for sx in (-1,1):
              for yy in (y+5,y+ln-6):
                bd.cyl((sx*(w-c-2),yy,hz+1.9),(sx*(w-c-2),yy,hz+2.8),1.1,'DARK',n=5)
        y+=ln;i+=1
    # flancs : caissons en X, fenêtre bleue
    L=tip-8-sh;ny=int(L/42)
    for sx in (-1,1):
        for i in range(ny):
            y=sh+6+(i+.5)*(L-8)/ny;wd=(L-8)/ny-3
            win=(i==ny//2)
            b.box((sx*(w+.3),y,0),(1.0,wd,2*hz-2*c-1),'DARK')
            if win:
                b.box((sx*(w+.9),y,0),(.6,wd*.86,hz*.62),'GREY')
                for k in range(7):
                    b.box((sx*(w+1.3),y-wd*.36+k*wd*.12,0),(.4,wd*.09,hz*.36),'BLUE')
                    bd.box((sx*(w+1.6),y-wd*.36+k*wd*.12,0),(.3,wd*.05,hz*.14),'LIGHT')
            else:
                hh=2*hz-2*c-3
                for s2 in (-1,1):
                    b.beam((sx*(w+1),y-wd*.46,-s2*hh/2),(sx*(w+1),y+wd*.46,s2*hh/2),2.0,'STEEL')
                b.box((sx*(w+1),y-wd/2,0),(1.2,1.8,hh),'GREY')
                b.box((sx*(w+1),y+wd/2,0),(1.2,1.8,hh),'GREY')
            b.box((sx*(w+1),y,hz-c+.5),(1.4,wd,1.4),'STEEL');b.box((sx*(w+1),y,-hz+c-.5),(1.4,wd,1.4),'STEEL')
    # modules latéraux (bosses vues de dessus) et petits mâts
    n3=int(L/28)
    for i in range(n3):
        y=sh+10+i*L/n3
        for sx in (-1,1):
            if rng.random()<(.8 if kind=='diag' else .45):
                d=rng.uniform(2,4) if kind=='card' else rng.uniform(2.5,5)
                b.box((sx*(w+d/2+.6),y,rng.choice([hz*.45,-hz*.45,hz*.6])),(d,rng.uniform(10,18),rng.uniform(7,12)),rng.choice(['GREY','WHITE2','STEEL','DARK']),ch=.6)
    # pointe
    b.poly(pts1,'y',tip-8,tip-5,'YELLOW' if kind=='diag' and False else 'STEEL')
    pt2=[(u*.82,v*.82) for u,v in pts1]
    b.poly(pt2,'y',tip-5,tip+5,'GREY')
    b.box((0,tip+4,0),(w*1.2,3,hz*1.1),'DARK')
    for sx,sz in ((-1,-1),(1,-1),(1,1),(-1,1)):
        b.box((sx*(w*.8),tip+3,sz*(hz*.62)),(4,6,4),'STEEL')
        b.cyl((sx*(w*.8),tip+6,sz*(hz*.62)),(sx*(w*.8),tip+12,sz*(hz*.62)),.7,'STEEL',n=5)
        b.sphere((sx*(w*.8),tip+13,sz*(hz*.62)),2.43,'RED',n=8,m=5)
    b.pop();b.pop()
def card_nozzle(b,th,tip,tot):
    b.polar(math.radians(th))
    b.push(None,(0,0,0))
    b.cyl((0,tip+2,0),(0,tot-14,0),5.2,'STEEL',n=10)
    b.cyl((0,tot-14,0),(0,tot-4,0),3.3,'WHITE2',n=10)
    b.cyl((0,tot-4,0),(0,tot,0),3.8,'STEEL',n=10)
    for y in (tip+8,tip+14):
        b.cyl((0,y,0),(0,y+2,0),7,'DARK',n=10)
    b.pop();b.pop()
def hangar(b,bd,rng):
    """jetée-hangar (-Y) : bouche octogonale, tunnel éclairé, pont à voie lumineuse"""
    b.polar(math.radians(HANG))
    W=88;Z0=-62;Z1=46
    r0=RI+2;r1=RO+4
    # cadre extérieur octogonal (front_c : noir/blanc à liseré jaune)
    c=24
    def oc(w,z0,z1,c): return [(-w+c,z0),(w-c,z0),(w,z0+c),(w,z1-c),(w-c,z1),(-w+c,z1),(-w,z1-c),(-w,z0+c)]
    b.loop(oc(W+11,Z0-9,Z1+9,c+4),oc(W,Z0,Z1,c),'y',RO-16,RO+7,'DARK')
    b.loop(oc(W+6,Z0-4,Z1+4,c+2),oc(W+2,Z0-1.5,Z1+1.5,c+1),'y',RO+6.5,RO+8,'YELLOW')
    b.loop(oc(W,Z0,Z1,c),oc(W-5,Z0+5,Z1-5,c-1),'y',RO-4,RO+7,'GREY')
    # tunnel convergent : donne la perspective lue sur la vue de face
    NR=9
    def fr(k):  # k=0 bouche .. 1 fond
        return (W-4-(W*.52)*k, Z0+4+24*k, Z1-4-22*k, max(8,c-1-13*k), RO-4-(RO-4-r0-3)*k)
    for i in range(NR):
        k0=i/NR;k1=(i+1)/NR
        w0,a0,b0,c0,y0=fr(k0);w1,a1,b1,c1,y1=fr(k1)
        # paroi (coque tronconique)
        o0=oc(w0,a0,b0,c0);o1=oc(w1,a1,b1,c1)
        V=[(u,y0,v) for u,v in o0]+[(u,y1,v) for u,v in o1]
        f=[(n,(n+1)%8,8+(n+1)%8,8+n) for n in range(8)]
        b.add(V,f,'DARK')
        # nervure au début de chaque travée
        o2=oc(w0-2.5,a0+2.5,b0-2.5,c0)
        b.loop(o0,o2,'y',y0-2.2,y0,'GREY')
        # lumières : plafond (2 bandes), parois (colonnes bleues), sol (axe)
        ym=(y0+y1)/2
        for sx in (-1,1):
            xm=sx*(w0+w1)/2
            b.box((sx*(w0+w1)*.22,ym,(b0+b1)/2-1.5),((w0+w1)*.16,(y0-y1)*.5,.6),'LIGHT')
            b.box((xm-sx*1.2,ym,(a0+b0)/2),(.6,(y0-y1)*.56,(b0-a0)*.28),'BLUE')
            b.box((xm-sx*1.0,ym,(a0+b0)/2+(b0-a0)*.3),(.5,(y0-y1)*.6,1.),'STEEL')
            b.box((sx*(w0+w1)*.24,ym,(a0+a1)/2+1.4),((w0+w1)*.12,(y0-y1)*.55,.5),'BLUE')
        b.box((0,ym,(a0+a1)/2+1.4),(4,(y0-y1)*.5,.5),'LIGHT')
    w1,a1,b1,c1,y1=fr(1.)
    zc=(a1+b1)/2
    b.box((0,y1,zc),(2*w1+4,2,b1-a1+4),'DARK')
    for sx in (-1,1):
        b.box((sx*w1*.5,y1+1.3,zc+10),(w1*.7,.6,10),'BLUE')
        b.box((sx*w1*.5,y1+1.3,zc-11),(w1*.7,.6,6),'BLUE')
        b.beam((0,y1+2,zc),(sx*(w1-3),y1+2,b1-2),2.4,'STEEL');b.beam((0,y1+2,zc),(sx*(w1-3),y1+2,a1+2),2.4,'STEEL')
    b.box((0,y1+2.4,zc),(14,2,10),'GREY',ch=1);b.box((0,y1+3.5,zc),(8,.5,4),'AMBER')
    # joues de l'anneau de chaque côté et toit
    for sx in (-1,1):
        b.box((sx*(W+24),(r0+RO)/2-6,0),(46,RO-r0-10,2*HT-4),'GREY')
    sec=[(RI+2,HT-16),(RO-4,HT-16),(RO+3,HT-8),(RO+3,HT+4),(RI+2,HT+4)]
    b.arc(sec,270-9.6,270+9.6,'WHITE2',step=2)if False else None
    b.pop()
    b.arc(oct_sec(RI+4,RO-8,Z1+6,HT+2,6),270-10,270+10,'GREY',step=2)
    b.arc(oct_sec(RI+4,RO-8,-HT-2,Z0-6,4),270-10,270+10,'GREY',step=2)
    # plaque de toit (dessus) + rails
    sec=[(487,HT-2),(552,HT-2),(552,HT+4),(549,HT+6),(490,HT+6),(487,HT+4)]
    b.arc(sec,270-9.5,270-.25,'WHITE',step=1.2);b.arc(sec,270+.25,270+9.5,'WHITE',step=1.2)
    for r_,z_ in ((RI+20,HT),(555,HT)):
        pass
    b.arc([(RI-2,HT-6),(486,HT-6),(486,HT+1),(RI-2,HT+1)],270-9.6,270+9.6,'WHITE2',step=2)
    b.arc([(552,HT-8),(RO-6,HT-8),(RO-6,HT-1),(552,HT-1)],270-9.6,270+9.6,'STEEL',step=2)
    b.arc([(RI-2,-HT-1),(486,-HT-1),(486,-HT+6),(RI-2,-HT+6)],270-9.6,270+9.6,'WHITE2',step=2)
    b.polar(math.radians(HANG))
    # pont-jetée
    ra,rb=RO+2,790.
    Lb=rb-ra;rc=(ra+rb)/2
    w=46;
    # coque basse en U (pont ouvert)
    ZF=-48
    b.poly([(-w,ZF-14),(-w+10,ZF-22),(w-10,ZF-22),(w,ZF-14),(w,ZF+36),(w-8,ZF+36),(w-8,ZF+3),(-w+8,ZF+3),(-w+8,ZF+36),(-w,ZF+36)],'y',ra,rb,'GREY')
    for sx in (-1,1):
        y=ra+4
        while y<rb-6:
            ln=min(rng.uniform(34,62),rb-6-y)
            b.box((sx*(w-4),y+ln/2,ZF+37.5),(9,ln-1.3,3),'WHITE' if rng.random()<.8 else 'WHITE2',ch=.6)
            b.box((sx*(w+.6),y+ln/2,ZF+14),(1.4,ln-1.5,34),'WHITE2' if rng.random()<.6 else 'STEEL')
            b.box((sx*(w+1.6),y+ln/2,ZF+14),(.8,ln*.5,4),'DARK')
            y+=ln
        for yy in np.arange(ra+10,rb-6,17):
            b.box((sx*(w-9),yy,ZF+20),(1.5,3,30),'STEEL')
            b.box((sx*(w-9.6),yy+8,ZF+24),(1.0,6,8),rng.choice(['AMBER','BLUE','BLUE','DARK']))
            b.box((sx*(w+1.6),yy,ZF+4),(1.2,5,3),'AMBER')
    # voie centrale et feux
    b.box((0,rc,ZF+4.5),(2*w-16,Lb,3),'DECK')
    b.box((0,rc,ZF+6.2),(2*w-40,Lb-6,.6),'DECK')
    for yy in np.arange(ra+14,rb-10,24):
        for sx in (-.28,0.28):
            b.box((sx*w,yy,ZF+6.8),(1.8,12,.5),'BLUE')
        bd.box((0,yy+12,ZF+6.8),(10,1.2,.3),'DARK')
    for sx in (-1,1):
        b.box((sx*(w*.62),rc,ZF+6.6),(1.5,Lb-4,.9),'YELLOW')
    # extrémité basse + feux
    b.box((0,rb+2,ZF-6),(2*w-6,8,28),'GREY',ch=2)
    b.box((0,rb+6.5,ZF-6),(2*w-22,1.5,16),'DARK')
    b.box((0,rb-1,ZF+7),(2*w-20,2,1.6),'RED')
    b.cyl((0,rb+6,ZF-6),(0,rb+15,ZF-6),3.4,'STEEL',n=10)
    for sx in (-1,0,1):
        xx=sx*w*.62
        b.cyl((xx,rb+6,ZF-6),(xx,rb+15+(0 if sx else 4),ZF-6),.7,'STEEL',n=5)
        b.sphere((xx,rb+16+(0 if sx else 4),ZF-6),2.97,'RED',n=8,m=5)
    # carène basse à bossages (vue de profil : ressauts sous la coque)
    y=ra+18
    while y<rb-30:
        ln=rng.uniform(18,34)
        b.box((rng.uniform(-8,8),y,ZF-26),(rng.uniform(22,50),ln,rng.uniform(10,18)),rng.choice(['GREY','DARK','WHITE2']),ch=1.2)
        y+=ln+rng.uniform(16,40)
    b.pop()
def build(seed=7):
    rng=random.Random(seed)
    b=B('ring');bd=B('fine');bw=B('rivets')
    ring_core(b)
    top_plates(b,bw,bd,rng)
    crossings(b,bd)
    facade(b,bd,rng)
    bumps(b,rng)
    hangar(b,bd,rng)
    a=B('arms')
    for th in SPOKES:
        spoke_inner(a,bd,th,27 if th%90==0 else 34,rng,'card' if th%90==0 else 'diag')
    for th,tip,tot in ((0,770,806),(180,770,806),(90,768,806)):
        arm_outer(a,bd,th,tip,31,33,rng,'card',zoff=3.)
        card_nozzle(a,th,tip,tot)
    for th in (45,135,225,315):
        sh={45:1,135:-1,225:1,315:-1}[th]*-13.
        sh={45:-13.,135:13.,225:-13.,315:13.}[th]
        arm_outer(a,bd,th,808,29,31,rng,'diag',shift=sh)
    return dict(ring=b,arms=a,fine=bd,rivets=bw)
if __name__=='__main__':
    import sys,time;sys.path.insert(0,'tools')
    t=time.time()
    P=build();A=B()
    for k,v in P.items(): A.merge(v)
    print('build',time.time()-t)
    from ctl import *
    t=time.time();bundle(A,'m1');print('ctl',time.time()-t)
