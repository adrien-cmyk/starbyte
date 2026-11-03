"""M6 : relief réel — treillis d'anneau, faisceaux de tuyaux, nervures, pinacles, aiguilles de quille."""
import numpy as np, math, random
from kit import *
from m1_ring import RI,RO,HT,SPOKES,pol,angdist
from m2_core import Y,f4
def free_ang(t,w=9.5):
    return all(abs(angdist(t,s))>w for s in SPOKES) and abs(angdist(t,270))>11
def ring_truss(b):
    # treillis continu sur la paroi intérieure, deux niveaux
    for s in SPOKES:
        ts=np.arange(s+9,s+36.01,4.5)
        for a,c in zip(ts[:-1],ts[1:]):
            for z in (HT-10,-HT+12):
                b.truss(pol(437,a,z),pol(437,c,z),11,13,2,'STEEL' if z>0 else 'GREY',bar=1.0,chord=1.7)
def ring_pipes(b,rng):
    # faisceaux de tuyaux sur le dessus intérieur et le bandeau extérieur
    for s in SPOKES:
        ts=np.arange(s+9,s+36.01,3.)
        for r,z,w,mat in ((452,HT+3.5,1.6,'STEEL'),(457,HT+3.5,1.2,'GREY'),(461,HT+3.5,1.6,'YELLOW'),(583,HT-4,1.7,'STEEL'),(578,HT-2,1.3,'GREY')):
            for a,c in zip(ts[:-1],ts[1:]):
                b.cyl(pol(r,a,z),pol(r,c,z),w,mat,n=6,caps=False)
            for t in ts[::2]:
                b.cyl(pol(r-3.5,t,z),pol(r+3.5,t,z),w+.7,'DARK',n=6)
        # nervures verticales sur la paroi externe (haut et bas de baie)
        for t in np.arange(s+9.5,s+36,1.15):
            if not free_ang(t,8.5): continue
            for z0,z1 in ((HT-14,HT-5),(-HT+5,-HT+18)):
                A=pol(RO+2.2,t,0)
                b.box((A[0],A[1],(z0+z1)/2),(2.4,2.4,z1-z0),rng.choice(['GREY','STEEL','GREY','DARK']))
def arm_gantry(b,th,tip,w,hz,sh,zo,rng):
    b.polar(math.radians(th));b.push(None,(sh,0,zo))
    y0=RO+54
    for sx in (-1,1):
        x=sx*(w+3.5)
        b.truss((x,y0,hz*.25),(x,tip-14,hz*.25),6,hz*.8,max(4,int((tip-y0)/18)),'GREY',bar=.8,chord=1.3)
        for yy in np.arange(y0+6,tip-14,17):
            b.box((x,yy,hz*.72),(7,4,3),rng.choice(['YELLOW','STEEL','GREY']),ch=.5)
    # tuyaux dorsaux
    for x,r_,mat in ((-w*.42,1.7,'STEEL'),(w*.42,1.7,'STEEL'),(-w*.28,1.2,'GREY'),(w*.28,1.2,'YELLOW')):
        b.cyl((x,y0,hz+4),(x,tip-12,hz+4),r_,mat,n=6,caps=False)
    for yy in np.arange(y0+8,tip-12,13):
        b.box((0,yy,hz+3.6),(w*1.05,2.2,2.2),'DARK')
    b.pop();b.pop()
def tower_relief(b,rng):
    # tuyaux verticaux tout autour du tambour, panneau jaune réduit par-dessus
    for t in np.arange(0,360,6):
        if min(abs(angdist(t,a)) for a in (0,90,180,270))<20: continue
        A=pol(66.4,t,0);b.cyl((A[0],A[1],Y(202)),(A[0],A[1],Y(173)),1.5,'STEEL' if int(t)%12==0 else 'GREY',n=5,caps=False)
    def th(_):
        # pinacles et étages de la flèche
        for sx in (-1,1):
            b.cyl((sx*10,15,Y(112)),(sx*10,15,Y(62)),1.7,'STEEL',n=6,r2=.9)
            b.box((sx*10,15,Y(92)),(4.4,4.4,3),'YELLOW')
            b.cyl((sx*16,20,Y(150)),(sx*16,20,Y(112)),2.0,'GREY',n=6,r2=1.2)
            b.box((sx*30,38,Y(172)),(8,8,16),'GREY',ch=1)
            b.cyl((sx*30,38,Y(166)),(sx*30,38,Y(142)),1.8,'STEEL',n=6,r2=1)
            # colonnes verticales du fût
            for x,r_ in ((13,2.2),(50,2.4)):
                b.cyl((sx*x,53,Y(286)),(sx*x,53,Y(206)),r_,'STEEL',n=6,caps=False)
            for yy in np.arange(214,284,14):
                b.box((sx*31,50.5,Y(yy)),(26,2.2,2.6),'GREY')
    f4(b,th)
    # baguage du fût
    for yy,r_ in ((206,64),(286,62),(148,48),(112,26)):
        b.lathe([(r_-3,Y(yy)-1.6),(r_+1.5,Y(yy)-1.6),(r_+1.5,Y(yy)+1.6),(r_-3,Y(yy)+1.6)],'GREY',n=24)
def keel_relief(b,rng):
    def k(_):
        for x,y0,y1,r_ in ((-46,742,880,1.8),(46,742,880,1.8),(-36,790,895,1.5),(36,790,895,1.5),(-27,830,905,1.3),(27,830,905,1.3)):
            b.cyl((x,50 if abs(x)>40 else 30,Y(y0)),(x,50 if abs(x)>40 else 30,Y(y1)),r_,'STEEL',n=6,r2=r_*.6)
        for yy in np.arange(800,880,16):
            b.box((0,34,Y(yy)),(74,6,2.6),'GREY')
        # tuyaux sur la plaque centrale
        for x in (-18,18):
            b.cyl((x,66,Y(556)),(x,66,Y(612)),1.5,'STEEL',n=6,caps=False)
            b.cyl((x,66,Y(690)),(x,66,Y(752)),1.5,'STEEL',n=6,caps=False)
        for yy in np.arange(560,612,12):
            b.box((0,65.4,Y(yy)),(44,1.6,1.8),'GREY')
    f4(b,k)
def build(seed=41):
    rng=random.Random(seed);b=B('relief')
    ring_truss(b);ring_pipes(b,rng)
    for th,tip in ((0,770),(180,770),(90,768)):
        arm_gantry(b,th,tip,31,33,0,3.,rng)
    for th,sh in ((45,-13.),(135,13.),(225,-13.),(315,13.)):
        arm_gantry(b,th,808,29,31,sh,0.,rng)
    tower_relief(b,rng);keel_relief(b,rng)
    return dict(relief=b)
