"""M5 : kitbash automatique — chaque grande face visible est découpée en panneaux (guillotine) et habillée."""
import numpy as np, math, random
import bpy, mathutils
from mathutils.bvhtree import BVHTree
from kit import *
LIGHTM={MI['WHITE'],MI['WHITE2']}
MECH={MI['GREY'],MI['STEEL'],MI['DARK']}
YEL=MI['YELLOW']
def split(rng,x0,y0,x1,y1,mins,out,maxd=6,d=0):
    w,h=x1-x0,y1-y0
    if d>=maxd or (w<mins*2 and h<mins*2) or (max(w,h)<mins*3.2 and rng.random()<.3):
        out.append((x0,y0,x1,y1));return
    if (w>h and w>=mins*2) or h<mins*2:
        c=x0+w*rng.uniform(.3,.7);split(rng,x0,y0,c,y1,mins,out,maxd,d+1);split(rng,c,y0,x1,y1,mins,out,maxd,d+1)
    else:
        c=y0+h*rng.uniform(.3,.7);split(rng,x0,y0,x1,c,mins,out,maxd,d+1);split(rng,x0,c,x1,y1,mins,out,maxd,d+1)
def leaf_mech(g,c,w,h,rng,norm=None):
    """repère local (x,y plan ; z normale)"""
    x,y=c;r=rng.random();m=min(w,h);M=max(w,h)
    pw,ph=w-1.0,h-1.0
    if pw<1 or ph<1: return
    if r<.20:   # plaque relevée sombre, joint noir autour
        hh=rng.uniform(1.2,3.6);mat=rng.choice(['GREY','GREY','DARK','STEEL'])
        g.box((x,y,hh/2),(pw,ph,hh),mat)
        if M>9 and rng.random()<.6: g.box((x,y,hh+.12),(pw*.45,ph*.45,.25),rng.choice(['DARK','YELLOW','DARK']))
    elif r<.36: # évent
        g.box((x,y,.2),(pw,ph,.4),'DARK' if M<14 else 'GREY')
        n=max(2,int(M/2.4))
        for k in range(min(n,9)):
            if w>h: g.box((x-pw/2+(k+.5)*pw/min(n,9),y,.9),(pw/min(n,9)*.5,ph*.82,1.2),'GREY')
            else:   g.box((x,y-ph/2+(k+.5)*ph/min(n,9),.9),(pw*.82,ph/min(n,9)*.5,1.2),'GREY')
    elif r<.50: # conduites sur fond noir
        g.box((x,y,.2),(w,h,.4),'DARK' if M<14 else 'GREY')
        n=rng.randint(2,3)
        for k in range(n):
            mat=rng.choice(['STEEL','GREY','STEEL','YELLOW'])
            if w>h:
                yy=y-ph/2+(k+.5)*ph/n;rr=min(2.2,ph/n*.42);g.cyl((x-pw/2,yy,rr+.5),(x+pw/2,yy,rr+.5),rr,mat,n=6,caps=False)
            else:
                xx=x-pw/2+(k+.5)*pw/n;rr=min(2.2,pw/n*.42);g.cyl((xx,y-ph/2,rr+.5),(xx,y+ph/2,rr+.5),rr,mat,n=6,caps=False)
    elif r<.60: # bloc
        hh=rng.uniform(3,9) if M>7 else rng.uniform(2,4);mat=rng.choice(['GREY','DARK','STEEL','WHITE2','YELLOW','GREY','DARK'])
        g.box((x,y,hh/2),(pw*.78,ph*.78,hh),mat)
        g.box((x,y,hh+.4),(1.1,1.1,.5),'AMBER') if rng.random()<.45 else None
    elif r<.80: # feux ambre sur fond noir (signature de la planche)
        g.box((x,y,.2),(pw,ph,.4),rng.choice(['DARK','GREY']))
        n=min(6,max(2,int(M/2.8)));col=rng.choice(['AMBER','AMBER','AMBER','YELLOW','BLUE'])
        for k in range(n):
            xx=x-pw/2+(k+.5)*pw/n if w>h else x;yy=y if w>h else y-ph/2+(k+.5)*ph/n
            g.box((xx,yy,.6),(1.25,1.25,.5),col)
    elif r<.88: # plaque + rivets
        g.box((x,y,.25),(pw,ph,.5),'GREY')
        for sx in (-1,1):
            for sy in (-1,1):
                g.cyl((x+sx*(pw/2-.9),y+sy*(ph/2-.9),.5),(x+sx*(pw/2-.9),y+sy*(ph/2-.9),.9),.5,'YELLOW',n=3,caps=False)
    elif r<.94 and m>2: # trim jaune
        g.box((x,y,.2),(w,h,.3),'DARK')
        g.box((x,y,.4),(pw*(.3 if w>h else .9),ph*(.9 if w>h else .3),.6),'YELLOW')
def leaf_light(g,c,w,h,rng):
    x,y=c;pw,ph=w-.5,h-.5
    if pw<1 or ph<1: return
    r=rng.random();M=max(w,h)
    if r<.42:   # joint fin en périphérie (léger retrait visuel)
        for sx in (-1,1):
            g.box((x+sx*(w/2),y,.06),(.32,h,.12),'DARK')
    if r<.2 and M>7:
        g.box((x,y,.7),(pw*.86,ph*.86,1.4),rng.choice(['WHITE','WHITE2']))
    elif r<.36:
        for sx in (-1,1):
            for sy in (-1,1):
                g.cyl((x+sx*(pw/2-1),y+sy*(ph/2-1),.05),(x+sx*(pw/2-1),y+sy*(ph/2-1),.5),.55,'GREY',n=3,caps=False)
    elif r<.47 and 5<M<11:
        g.box((x,y,.12),(pw*.5,ph*.5,.25),'GREY')
        if M>9: g.box((x,y,.3),(pw*.32,ph*.32,.2),rng.choice(['STEEL','YELLOW','WHITE2']))
    elif r<.55 and M>6:
        # griffure
        a=rng.uniform(0,6.28);L=M*.4;g.beam((x-L*math.cos(a),y-L*math.sin(a),.1),(x+L*math.cos(a),y+L*math.sin(a),.1),.22,'DARK',h=.1)
def leaf_yel(g,c,w,h,rng):
    x,y=c;pw,ph=w-.5,h-.5
    if pw<1 or ph<1: return
    r=rng.random()
    if r<.3:
        g.box((x,y,.15),(pw*.55,ph*.55,.3),'DARK')
    elif r<.55:
        for sx in (-1,1):
            g.cyl((x+sx*(pw/2-1),y,.05),(x+sx*(pw/2-1),y,.5),.6,'DARK',n=3,caps=False)
def apply(P,keys=('ring','arms','hub','tower','spine','towers'),amin=32.,seed=5,dens=1.0):
    rng=random.Random(seed)
    # BVH global
    Vs=[];Fs=[];n=0;src=[]
    for k,b in P.items():
        V,F,M=b.arrays()
        Vs.append(V);Fs+= [[i+n for i in q] for q in F];n+=len(V)
        if k in keys: src.append((V,F,M))
    AV=np.vstack(Vs);bvh=BVHTree.FromPolygons([tuple(p) for p in AV.tolist()],Fs,epsilon=1e-5)
    def free(o,d,dist):
        h=bvh.ray_cast(mathutils.Vector(o),mathutils.Vector(d),dist)
        return h[0] is None
    g=B('green');count=0
    for V,F,M in src:
        for q,mi in zip(F,M):
            if len(q)!=4 or mi not in LIGHTM|MECH|{YEL}: continue
            p=V[list(q)]
            a=p[1]-p[0];b_=p[3]-p[0]
            N=np.cross(a,b_);A=np.linalg.norm(N)
            if A<amin: continue
            N=N/A
            wa=np.linalg.norm(a);wb=np.linalg.norm(b_)
            if wa<4 or wb<4: continue
            c=p.mean(axis=0)
            # orientation extérieure
            up=c+N*.08;dn=c-N*.08
            fu=free(tuple(up),tuple(N),5.);fd=free(tuple(dn),tuple(-N),5.)
            if fu: nn=N
            elif fd: nn=-N
            else: continue
            U=a/wa;Vv=np.cross(nn,U)
            # base rect
            s=0 if mi in MECH else 1
            mins=rng.uniform(9,14) if mi in MECH else rng.uniform(16,26)
            leaves=[];split(rng,-wa/2,-wb/2,wa/2,wb/2,mins,leaves,maxd=5 if A<1500 else 8)
            R=np.c_[U,Vv,nn]
            for (x0,y0,x1,y1) in leaves:
                cx,cy=(x0+x1)/2,(y0+y1)/2;pc=c+U*cx+Vv*cy
                if not free(tuple(pc+nn*.08),tuple(nn),3.2): continue
                if rng.random()>dens: continue
                g.push(R,pc)
                if mi in MECH: leaf_mech(g,(0,0),x1-x0,y1-y0,rng)
                elif mi in LIGHTM: leaf_light(g,(0,0),x1-x0,y1-y0,rng)
                else: leaf_yel(g,(0,0),x1-x0,y1-y0,rng)
                g.pop();count+=1
    return g
def build(P):
    return dict(green=apply(P))
