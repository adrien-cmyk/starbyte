"""M4 : densité — trims jaunes, feux ambre, tuyaux, modules fins sur toutes les grandes surfaces."""
import numpy as np, math, random
from kit import *
from m1_ring import RI,RO,HT,SPOKES,HANG,angdist,pol
from m2_core import Y
def clear(t,w=9.5):
    return all(abs(angdist(t,s))>w for s in SPOKES) and abs(angdist(t,270))>11
def ring_top_dress(b,bd,rng):
    # bande intérieure : plaques segmentées, trim jaune continu, rivets ; bande extérieure : modules
    for sg in (1,-1):
        zb=(HT+1) if sg>0 else (-HT-1)
        for t0 in np.arange(0,360,3.2):
            tm=t0+1.6
            if not clear(tm,8.5): continue
            if sg>0:
                # segments intérieurs clairs (r 456-484)
                sec=[(456,zb-1),(484,zb-1),(484,zb+1.8),(456,zb+1.8)]
                if rng.random()<.8: b.arc(sec,t0+.15,t0+3.05,rng.choice(['WHITE2','WHITE2','STEEL','WHITE']),step=2)
                for rr in (460,480):
                    A=math.radians(tm);p=np.array((rr*math.cos(A),rr*math.sin(A),zb+1.8))
                    bd.cyl(p,p+(0,0,.6),1.0,'DARK',n=5)
            # bande extérieure (r 556-584)
            if rng.random()<.72:
                b.polar(math.radians(tm))
                w=rng.uniform(16,28);d=rng.uniform(10,22);h=rng.uniform(2,7)
                rc=rng.uniform(562,578)
                z=(HT-3+h/2) if sg>0 else (-HT+3-h/2)
                b.box((0,rc,z),(w,d,h),rng.choice(['GREY','STEEL','DARK','WHITE2','GREY']),ch=.8)
                if rng.random()<.5:
                    bd.box((0,rc,z+sg*(h/2+.2)),(w*.6,d*.5,.4),rng.choice(['DARK','YELLOW','STEEL']))
                if rng.random()<.3:
                    bd.cyl((w*.3,rc,z+sg*(h/2)),(w*.3,rc,z+sg*(h/2+.8)),1.2,'AMBER',n=5)
                b.pop()
    # trim jaune continu intérieur (lu sur top_c : filet jaune r≈452) et filet extérieur
    for t0,t1 in ((0,360),):
        for r,z,w,h in ((486.5,HT+.5,1.5,2.2),(553,HT+.2,1.5,2.0)):
            sec=[(r-w/2,z),(r+w/2,z),(r+w/2,z+h),(r-w/2,z+h)]
            segs=[(s+8.5,s+45-8.5) for s in SPOKES]
            for a,c in segs:
                b.arc(sec,a,c,'YELLOW' if r<500 else 'GREY',step=2.5,caps=False)
def ring_inner_wall(b,bd,rng):
    # paroi intérieure : bandeau ambre, nervures, tuyaux
    R=RI+2
    for s in SPOKES:
        a=s+9;c=s+45-9
        for t in np.arange(a,c,1.6):
            b.polar(math.radians(t+.8))
            b.box((0,R-3.2,HT-22),(8,3,1.8),'STEEL')
            b.box((0,R-3.0,HT-27),(9.5,1.0,6),'DARK')
            bd.box((0,R-3.7,HT-27),(7.5,.4,4),'AMBER' if rng.random()<.72 else 'BLUE')
            b.box((-6,R-3.2,5),(1.4,3,50),'GREY')
            if rng.random()<.4:
                b.box((0,R-3.0,rng.uniform(-30,10)),(rng.uniform(5,9),4,rng.uniform(5,14)),rng.choice(['STEEL','WHITE2','GREY','DARK']),ch=.5)
            b.pop()
def facade_dress(b,bd,rng):
    # lignes de feux et petits trims sur la face externe
    for t in np.arange(0,360,.9):
        A=math.radians(t);
        if not clear(t,7): continue
        if rng.random()<.32:
            z=rng.choice([HT-5,HT-11,-HT+5,-HT+11])
            r=RO+(-5 if abs(z)>50 else -3)
            p=np.array((r*math.cos(A),r*math.sin(A),z));nn=np.array((math.cos(A),math.sin(A),0))
            bd.cyl(p,p+nn*1.0,1.1,'AMBER' if rng.random()<.55 else 'YELLOW',n=5)
def arm_dress(b,bd,th,tip,w,hz,rng,shift=0.,zoff=0.):
    b.polar(math.radians(th));b.push(None,(shift,0,zoff))
    r0=RO+50
    c=12
    # trims jaunes sur les arêtes, conduites le long du flanc
    for sx in (-1,1):
        b.box((sx*(w-1),(r0+tip)/2-5,hz-c-.4),(1.6,tip-r0-14,1.2),'YELLOW')
        b.box((sx*(w-1),(r0+tip)/2-5,-hz+c+.4),(1.6,tip-r0-14,1.2),'GREY')
        b.cyl((sx*(w+.8),r0,hz-c-2.6),(sx*(w+.8),tip-10,hz-c-2.6),.8,'STEEL',n=5)
        b.cyl((sx*(w+.8),r0,-hz+c+2.6),(sx*(w+.8),tip-10,-hz+c+2.6),.8,'STEEL',n=5)
    # dessus : petits blocs + feux
    y=r0
    while y<tip-14:
        y+=rng.uniform(7,16)
        u=rng.uniform(-w*.55,w*.55)
        if rng.random()<.55:
            b.box((u,y,hz+2.6),(rng.uniform(3,9),rng.uniform(3,9),rng.uniform(1.,2.4)),rng.choice(['GREY','STEEL','DARK','YELLOW']),ch=.4)
        if rng.random()<.5:
            sx=rng.choice([-1,1])
            bd.cyl((sx*(w-c-3),y,hz+1.7),(sx*(w-c-3),y,hz+2.6),.9,'AMBER',n=5)
    # mâts rouges latéraux
    for yy in (r0+18,tip-40):
        for sx in (-1,1):
            b.cyl((sx*(w+.5),yy,hz-6),(sx*(w+4),yy,hz+3),.5,'STEEL',n=4)
            b.sphere((sx*(w+4.5),yy,hz+3.6),1.89,'RED',n=8,m=5)
    b.pop();b.pop()
def tower_dress(b,bd,rng):
    # conduites et bagues dans les zones sombres, feux
    for th in (0,90,180,270):
        b.polar(math.radians(th))
        for yy in np.arange(212,284,9):
            for x in (-37,37,-27,27):
                b.cyl((x,45,Y(yy)),(x,45,Y(yy+2)),3.9 if abs(x)==27 else 3.4,'YELLOW' if yy%36<9 and abs(x)==27 else 'DARK',n=8)
        for x in (-50,50,-60,60):
            for yy in np.arange(214,268,12):
                bd.cyl((x,47,Y(yy)),(x,48,Y(yy)),.9,'AMBER',n=5)
        for yy,w_ in ((208,110),(262,120),(288,108),(330,110)):
            b.box((0,47,Y(yy)),(w_,2,2.4),'GREY')
        b.pop()
def spine_dress(b,bd,rng):
    for th in (0,90,180,270):
        b.polar(math.radians(th))
        for yy in np.arange(560,770,7):
            if rng.random()<.5:
                bd.cyl((rng.choice([-1,1])*rng.uniform(56,62),58,Y(yy)),(0,0,0),0,'DARK',n=3) if False else None
                x=rng.choice([-1,1])*rng.uniform(52,60)
                bd.cyl((x,63.5,Y(yy)),(x,64.4,Y(yy)),1,'AMBER',n=5)
        for x in (-56,56):
            b.cyl((x,62,Y(555)),(x,62,Y(765)),1.8,'STEEL',n=6)
        for x in (-23,23):
            b.cyl((x,66,Y(612)),(x,66,Y(690)),1.8,'GREY',n=6)
        for yy in np.arange(560,770,21):
            for x in (-57,57):
                b.box((x,63,Y(yy)),(6,5,3),'YELLOW' if yy%42<21 else 'GREY',ch=.5)
        for x,r_ in ((-30,2.4),(-14,2.),(14,2.),(30,2.4)):
            b.cyl((x,40,Y(790)),(x,40,Y(862)),r_,'STEEL',n=6,r2=r_*.7)
        for yy in (800,818,836,852):
            b.box((0,40,Y(yy)),(70,8,3),'GREY',ch=.6)
        b.pop()
def hub_dress(b,bd,rng):
    # flanc du moyeu : panneaux, rails, ambre ; dessous nervuré
    for t in np.arange(0,360,5.625):
        b.polar(math.radians(t))
        w=16.5
        b.box((0,184.5,18),(w,3,30),rng.choice(['GREY','STEEL','GREY','WHITE2','DARK']),ch=.5)
        b.box((0,184.5,-22),(w,3,30),rng.choice(['DARK','GREY','GREY','STEEL']),ch=.5)
        if rng.random()<.55: bd.box((0,186.3,18),(w*.6,.5,rng.uniform(4,14)),rng.choice(['DARK','AMBER','DARK','YELLOW']))
        if rng.random()<.55: bd.box((0,186.3,-22),(w*.6,.5,rng.uniform(4,14)),rng.choice(['DARK','AMBER','BLUE','DARK']))
        b.box((-w/2,185,0),(1.2,2.6,70),'DARK')
        b.pop()
    for z,r,mat in ((-2,186.4,'YELLOW'),(40,186.2,'STEEL'),(-44,186.2,'STEEL')):
        b.lathe([(r-1,z-1.2),(r+.6,z-1.2),(r+.6,z+1.2),(r-1,z+1.2)],mat,n=64,cap=False)
    # sous-face
    for t in np.arange(0,360,15):
        A=math.radians(t);ca,sa=math.cos(A),math.sin(A)
        b.beam((ca*92,sa*92,-93),(ca*176,sa*176,-68),3,'STEEL')
    # dessus du moyeu : zone sombre intérieure (r<116) : pièces radiales, arcs jaunes
    for t in np.arange(0,360,45):
        A=t
        b.arc([(66,96),(70,96),(70,98.5),(66,98.5)],A+6,A+39,'YELLOW',step=4)
    for r,z,w,mat in ((101,98,3,'STEEL'),(116,91,2,'YELLOW')):
        b.lathe([(r-w,z),(r+w,z),(r+w,z+1.6),(r-w,z+1.6)],mat,n=48,cap=False)
    for t in np.arange(0,360,9):
        A=math.radians(t);r=rng.uniform(100,112)
        b.box((r*math.cos(A),r*math.sin(A),96.5),(rng.uniform(2,6),rng.uniform(2,6),rng.uniform(2,5)),rng.choice(['GREY','STEEL','DARK','YELLOW']))
def spoke_dress(b,bd,rng):
    for th in SPOKES:
        w=27 if th%90==0 else 34
        b.polar(math.radians(th))
        y=178
        while y<RI-2:
            ln=rng.uniform(9,16);
            for sx in (-1,1):
                # ligne de hublots ambre sur flanc, consoles
                b.box((sx*(w+.3),y+ln/2,-6),(.7,ln*.86,4),'DARK')
                bd.box((sx*(w+.8),y+ln/2,-6),(.3,ln*.6,2.4),'AMBER' if rng.random()<.8 else 'BLUE')
                b.box((sx*(w+.4),y+ln/2,5),(1.,ln-1,2.2),'STEEL')
                if rng.random()<.5:
                    b.box((sx*(w*.75),y+ln/2,18),(rng.uniform(4,8),ln*.7,rng.uniform(2,4.5)),rng.choice(['GREY','STEEL','WHITE2','DARK']),ch=.4)
            y+=ln
        for sx in (-1,1):
            b.cyl((sx*(w-6),180,-16),(sx*(w-6),RI,-16),1.4,'STEEL',n=6)
            b.cyl((sx*(w-12),180,-17),(sx*(w-12),RI,-17),1.1,'GREY',n=6)
        b.pop()
def rear_axis(b,bd,rng):
    # axe arrière (+Y) : échelle centrale et caissons en X (vue arrière)
    b.polar(math.radians(90))
    y=RO+5
    b.box((0,y,0),(52,4,2*HT+8),'GREY',ch=1.5)
    for sx in (-1,1):
        b.box((sx*19,y+3,0),(5,3,2*HT+14),'WHITE2',ch=.8)
    for z in np.arange(-HT,HT,9):
        b.box((0,y+3,z),(26,2,3.4),'STEEL')
        bd.box((0,y+4.2,z),(18,.4,1.2),'AMBER' if rng.random()<.25 else 'DARK')
    # caissons en X de part et d'autre (vue arrière)
    for sx in (-1,1):
        cx=sx*56
        b.box((cx,y-1,0),(62,5,84),'DARK')
        for zz in (-42,42):
            b.box((cx,y+2,zz),(64,5,5),'STEEL',ch=.8)
        for xx in (cx-31,cx+31):
            b.box((xx,y+2,0),(5,5,88),'STEEL',ch=.8)
        for s1 in (-1,1):
            b.beam((cx-28,y+3,-s1*40),(cx+28,y+3,s1*40),4.5,'GREY')
        b.box((cx,y+4,0),(16,4,16),'YELLOW',ch=1)
    b.pop()
def build(seed=31):
    rng=random.Random(seed);b=B('dress');bd=B('fine4')
    ring_top_dress(b,bd,rng);ring_inner_wall(b,bd,rng);facade_dress(b,bd,rng)
    for th,tip in ((0,770),(180,770),(90,768)):
        arm_dress(b,bd,th,tip,31,33,rng,zoff=3.)
    for th,sh in ((45,-13.),(135,13.),(225,-13.),(315,13.)):
        arm_dress(b,bd,th,808,29,31,rng,sh)
    tower_dress(b,bd,rng);spine_dress(b,bd,rng);hub_dress(b,bd,rng);spoke_dress(b,bd,rng);rear_axis(b,bd,rng)
    return dict(dress=b,fine4=bd)
