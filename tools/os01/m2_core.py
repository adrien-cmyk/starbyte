"""M2 : moyeu, tour centrale, épine basse. Z = 457 - y(px face)."""
import numpy as np, math, random
from kit import *
def Y(y): return 457.-y
def f4(b,fn,phase=0):
    for th in (0,90,180,270):
        b.polar(math.radians(th+phase));fn(th);b.pop()
def f8(b,fn):
    for th in range(0,360,45):
        b.polar(math.radians(th));fn(th);b.pop()
def fd(b,fn,d=None):
    for sx,sy in ((1,1),(-1,1),(-1,-1),(1,-1)):
        b.push(None,(sx*d,sy*d,0));fn(sx,sy);b.pop()
def hub(b,bd,rng):
    # disque principal (dessus/dessous)
    b.lathe([(150,-74),(178,-66),(183,-56),(183,52),(178,62),(166,70),(152,76)],'GREY',n=48)
    # gradins du dessus
    b.lathe([(152,76),(150,80),(132,82),(128,86),(112,88),(108,92),(84,94),(70,96),(0,96)],'DECK',n=48)
    # anneau jaune fin r=112tp=146fp, rails
    b.lathe([(146,74),(148,76.5),(143,78),(141,76)],'YELLOW',n=48,cap=False)
    for r,z,w in ((176,64,1.6),(166,71,1.4),(130,84,1.2),(110,90,1.4)):
        b.lathe([(r-w,z),(r+w,z),(r+w,z+1.4),(r-w,z+1.4)],'STEEL',n=48)
    # couronne de plaques 8 x (entre fenêtres)
    for t in range(0,360,45):
        kind=t%90==0
        b.polar(math.radians(t))
        if kind:
            # fenêtre bleue allongée (N,E,S,W)
            sec_pts=[]
            b.pop()
            b.arc([(108,86),(140,79),(140,84),(108,91)],t-15,t+15,'DARK',step=2)
            b.arc([(112,89.6),(136,84.2),(136,85.2),(112,90.6)],t-13,t+13,'BLUE',step=1.5)
            for a in np.linspace(t-10,t+10,9):
                ca,sa=math.cos(math.radians(a)),math.sin(math.radians(a))
                bd.beam((115*ca,115*sa,90.8),(133*ca,133*sa,86.0),.8,'LIGHT',h=.35)
            # bloc de raccord au rayon sur le bord
            b.polar(math.radians(t))
            b.box((0,168,73),(40,20,8),'WHITE2',ch=1.5)
            b.box((0,168,77.4),(24,12,1),'DARK')
            b.box((-14,172,74),(2,14,6),'YELLOW');b.box((14,172,74),(2,14,6),'YELLOW')
            b.pop()
        else:
            # double étrier jaune
            b.box((-11,142,84),(9,44,4),'YELLOW',ch=.8)
            b.box((11,142,84),(9,44,4),'YELLOW',ch=.8)
            b.box((0,148,84.5),(20,13,3),'YELLOW',ch=.8)
            b.box((0,132,84.5),(16,9,3.2),'DARK',ch=.6)
            b.box((0,168,74),(44,20,10),'YELLOW',ch=1.5)
            b.box((0,168,79.5),(26,12,1.4),'DARK')
            b.pop()
    # plaques blanches
    for t in (22.5,67.5,112.5,157.5,202.5,247.5,292.5,337.5):
        b.arc([(100,92),(141,80),(141,82.8),(100,94.5)],t-9.5,t+9.5,'WHITE',step=2)
        tt=math.radians(t)
        for r_ in (112,128):
            for a in (t-7,t,t+7):
                A=math.radians(a);bd.box((r_*math.cos(A),r_*math.sin(A),96-(r_-100)*.28),(1.8,1.8,.8),'STEEL')
    # bord du disque : baies et feux
    for t in np.arange(0,360,7.5):
        ok=min(abs((t-s+22.5)%45-22.5) for s in (0,))>9
        b.polar(math.radians(t))
        if ok:
            bb=rng.random()
            b.box((0,184,rng.uniform(-30,30)),(rng.uniform(8,16),4,rng.uniform(16,40)),rng.choice(['DARK','STEEL','WHITE2','GREY']),ch=.7)
            if bb<.35: b.box((0,186.4,rng.uniform(-20,20)),(6,.8,8),rng.choice(['AMBER','BLUE']))
        b.pop()
    # feux rouges sur le pourtour (de part et d'autre de chaque rayon)
    for s in range(0,360,45):
        for off in (-14,14):
            b.polar(math.radians(s+off))
            b.cyl((0,186,70),(0,186,82),.7,'STEEL',n=5)
            b.sphere((0,186,83.5),2.84,'RED',n=8,m=5)
            b.pop()
    # petits mâts d'angle de la vue de face (x±102, y 330-370)
    for sx in (-1,1):
        for th in ((0,180) if False else ()):
            pass
    def mast(sx,sy):
        b.cyl((0,0,Y(375)),(0,0,Y(345)),1.2,'STEEL',n=6,r2=.8)
        b.cyl((0,0,Y(375)),(0,0,Y(362)),2.4,'GREY',n=6,r2=1.6)
        b.sphere((0,0,Y(340)),2.97,'RED',n=8,m=5)
    fd(b,mast,107)
def lamps(bd,pts,mat='AMBER',r=1.0,nrm=(0,1,0)):
    for p in pts:
        p=np.asarray(p,float);bd.cyl(p,p+np.asarray(nrm,float)*.8,r,mat,n=5)
def tower(b,bd,rng):
    b.lathe([(112,88),(112,96),(100,100),(96,108)],'DARK',n=24)
    b.lathe([(46,Y(372)),(46,Y(200))],'DARK',n=16)
    def face(th):
        # socle : gradins et afficheur bleu (y 358-382)
        b.box((0,56,Y(373)),(92,30,16),'GREY',ch=2.5)
        b.box((0,64,Y(366)),(62,20,14),'STEEL',ch=2)
        b.box((0,74.3,Y(366)),(46,1,8),'DARK');b.win((0,75,Y(366)),36,5,'BLUE',cols=8,rows=1)
        for sx in (-1,1):
            b.box((sx*42,72,Y(376)),(6,2,5),'YELLOW')
        lamps(bd,[(u,71.8,Y(376)) for u in np.arange(-32,33,8)])
        # bas de fût : porte bleue (y 330-360)
        b.box((0,46,Y(345)),(30,6,30),'GREY',ch=1)
        b.win((0,49.4,Y(345)),18,24,'BLUE',cols=2,rows=4)
        for x,r,mat in ((-20,3.2,'STEEL'),(20,3.2,'STEEL'),(-30,3.4,'GREY'),(30,3.4,'GREY'),(-39,2.8,'STEEL'),(39,2.8,'STEEL'),(-47,3.4,'DARK'),(47,3.4,'DARK')):
            b.cyl((x,44,Y(358)),(x,44,Y(328)),r,mat,n=8)
        for sx in (-1,1):
            b.box((sx*25,46,Y(350)),(6,3,10),'AMBER')
            b.box((sx*43,46,Y(340)),(4,3,16),rng.choice(['YELLOW','BLUE']))
            for yy in (335,350):
                b.box((sx*30,47.8,Y(yy)),(9,1.8,2.2),'YELLOW')
        # bloc-croix central (y 298-328, x ±58)
        b.box((0,52,Y(313)),(116,22,30),'GREY',ch=3)
        b.box((0,63.4,Y(313)),(48,1.4,20),'DARK')
        for k in range(8):
            b.box((-19.6+k*5.6,64.3,Y(313)),(4,.6,14),'AMBER' if k in(3,4) else ('YELLOW' if k%3==0 else 'STEEL'))
        bd.box((0,64.8,Y(313)),(44,.3,1.2),'DARK')
        for sx in (-1,1):
            b.box((sx*41,61.6,Y(313)),(24,3,26),'WHITE2',ch=1)
            b.box((sx*41,63.4,Y(313)),(14,.6,12),'YELLOW')
            bd.box((sx*41,63.9,Y(313)),(8,.3,6),'DARK')
            lamps(bd,[(sx*30,63.4,Y(301)),(sx*52,63.4,Y(301)),(sx*30,63.4,Y(325)),(sx*52,63.4,Y(325))],'DARK',.9)
        b.box((0,49,Y(291)),(50,16,14),'STEEL',ch=2)
        b.box((0,57.4,Y(291)),(30,.8,7),'DARK');lamps(bd,[(u,57.8,Y(291)) for u in (-10,0,10)])
        # fenêtre bleue haute (y 212-282)
        b.box((0,46,Y(248)),(32,5,72),'GREY')
        b.win((0,48.8,Y(248)),24,62,'BLUE',cols=2,rows=9)
        b.box((0,49.4,Y(278)),(18,.8,4),'GREY');b.box((0,49.4,Y(216)),(18,.8,4),'GREY')
        # tubes du fût
        for x,r,mat in ((-18,3.2,'STEEL'),(18,3.2,'STEEL'),(-27,3.6,'GREY'),(27,3.6,'GREY'),(-37,3.0,'STEEL'),(37,3.0,'STEEL'),(-46,3.2,'GREY'),(46,3.2,'GREY'),(-54,2.4,'DARK'),(54,2.4,'DARK')):
            b.cyl((x,42,Y(284)),(x,42,Y(206)),r,mat,n=8)
        for sx in (-1,1):
            b.box((sx*22.6,45.6,Y(246)),(1.6,1.2,70),'YELLOW')
            b.box((sx*41.6,44.6,Y(250)),(1.6,1.2,60),'YELLOW')
            for yy in np.arange(214,284,18):
                b.box((sx*32,45,Y(yy)),(10,1.6,2),'GREY')
                lamps(bd,[(sx*32,45.7,Y(yy))],'AMBER',.9)
    f4(b,face)
    # angles : blocs blancs (y 262-334) + colonnes + tourelles (d=85)
    def corner(sx,sy):
        b.box((-sx*9,-sy*9,Y(298)),(44,44,70),'GREY',ch=2.5);b.box((sx*7,sy*12.5,Y(298)),(12,3,58),'WHITE',ch=.8);b.box((sx*12.5,sy*7,Y(298)),(3,12,58),'WHITE',ch=.8)
        for u_ in (-12,-3):
            b.cyl((sx*u_,sy*14.6,Y(330)),(sx*u_,sy*14.6,Y(266)),2.1,'STEEL',n=6);b.cyl((sx*14.6,sy*u_,Y(330)),(sx*14.6,sy*u_,Y(266)),2.1,'STEEL',n=6)
        # deux faces visibles
        for ax,(nx,ny) in enumerate(((0,sy),(sx,0))):
            def Pf(u,z,d=0):
                return (u-sx*9,-sy*9+ny*(22+d),z) if ax==0 else (-sx*9+nx*(22+d),u-sy*9,z)
            def Bf(u,z,du,dz,dd,mat):
                c=Pf(u,z,dd/2-.2)
                bb=(du,dd,dz) if ax==0 else (dd,du,dz)
                b.box(c,bb,mat)
            Bf(-(sx if ax==0 else sy)*10,Y(298),2,62,1.6,'DARK')
            Bf(-(sx if ax==0 else sy)*15.5,Y(298),6,50,1.2,'DARK')
            for kk in range(6):
                c=Pf(-(sx if ax==0 else sy)*15.5,Y(278+kk*8),1.3);bd.box(c,(4.2,.3,5.4) if ax==0 else (.3,4.2,5.4),'BLUE')
                c=Pf(-(sx if ax==0 else sy)*15.5,Y(278+kk*8),1.5);bd.box(c,(2.2,.2,2.2) if ax==0 else (.2,2.2,2.2),'LIGHT')
            Bf((sx if ax==0 else sy)*6,Y(290),18,24,1,'DARK')
            Bf((sx if ax==0 else sy)*6,Y(315),16,12,.8,'STEEL')
            Bf((sx if ax==0 else sy)*6,Y(290),6,6,1.4,'AMBER')
            Bf(-(sx if ax==0 else sy)*7,Y(298),1.6,68,1.2,'YELLOW')
            Bf((sx if ax==0 else sy)*18,Y(298),2.2,50,1,'YELLOW')
            for z in (Y(267),Y(329)):
              for u in (-16,16):
                bd.cyl(Pf(u,z,0),Pf(u,z,.8),1.1,'DARK',n=5)
        # colonnes basses (y 334-372)
        for u,v,r,mat in ((-14,-14,5,'GREY'),(6,-6,4.5,'STEEL'),(10,10,3.4,'DARK')):
            b.cyl((sx*(u+0),sy*(v+0),Y(376)),(sx*(u+0),sy*(v+0),Y(332)),r,mat,n=8)
        for k in range(2):
            b.box((sx*(-4-k*14),sy*(k*8-14),Y(352)),(6,6,16),'AMBER' if k else 'GREY')
        # colonnes hautes (y 212-262) et tourelle
        for u,v,r,mat in ((-6,-6,5,'GREY'),(5,-8,3.2,'STEEL'),(-8,5,3.2,'STEEL')):
            b.cyl((sx*u,sy*v,Y(264)),(sx*u,sy*v,Y(205)),r,mat,n=8)
        b.box((0,0,Y(240)),(26,26,22),'GREY',ch=2.5)
        b.box((0,0,Y(232)),(30,30,5),'GREY',ch=1.2)
        for (nx,ny) in ((0,sy),(sx,0)):
            c=(nx*15.2,ny*15.2,Y(241))
            b.box(c,(18,1,9) if nx==0 else (1,18,9),'DARK')
            for k in range(3):
                u=-6+k*6
                c2=(nx*15.9+(u if nx==0 else 0),ny*15.9+(u if ny==0 else 0),Y(241))
                bd.box(c2,(4,.5,6) if nx==0 else (.5,4,6),'YELLOW' if k==1 else 'AMBER')
        b.box((0,0,Y(216)),(17,17,26),'STEEL',ch=2)
        b.box((sx*.0,sy*8.8,Y(216)),(9,.8,10),'DARK');b.box((sx*8.8,0,Y(216)),(.8,9,10),'DARK')
        b.box((0,sy*9.5,Y(216)),(3,.5,4),'AMBER');b.box((sx*9.5,0,Y(216)),(.5,3,4),'AMBER')
        for x,y in ((-3.6,-3.6),(3.6,3.6)):
            b.cyl((x,y,Y(203)),(x,y,Y(136)),1.5,'STEEL',n=6,r2=1.0)
            b.box((x,y,Y(172)),(3.4,3.4,7),'YELLOW')
            b.box((x,y,Y(160)),(2.6,2.6,4),'WHITE2')
            b.sphere((x,y,Y(132)),3.24,'RED',n=8,m=5)
    fd(b,corner,85)
    # dessus (vue plan) : onglets lumineux, anneaux jaunes
    for t in range(0,360,45):
        A=math.radians(t);ca,sa=math.cos(A),math.sin(A)
        b.push(Rz(A-math.pi/2),(ca*84,sa*84,Y(205)))
        b.box((0,0,0),(18,24,5),'WHITE2',ch=1);b.box((0,0,2.8),(9,14,.8),'AMBER')
        b.pop()
    # tambour (y 170-208)
    b.lathe([(50,Y(210)),(62,Y(204)),(63,Y(170)),(50,Y(164))],'GREY',n=32)
    b.lathe([(62,Y(209)),(66,Y(205)),(66,Y(202)),(62,Y(200))],'WHITE2',n=32)
    b.lathe([(62,Y(176)),(66,Y(173)),(66,Y(170)),(60,Y(165))],'WHITE2',n=32)
    def drum(th):
        for off,w,mat in ((0,52,'YELLOW'),(-44,22,'GREY'),(44,22,'GREY')):
            r=63
            ang=off/r
            b.push(Rz(-ang),(r*math.sin(ang),r*math.cos(ang),Y(187)))
            b.box((0,.5,0),(w,3.2,23),mat,ch=1)
            if mat=='YELLOW':
                b.box((0,2.4,0),(w*.5,.7,6),'DARK')
                for u in (-18,18):
                    bd.box((u,2.3,4),(8,.4,3),'DARK')
                lamps(bd,[(u,2,-9) for u in (-20,-10,10,20)],'DARK',.8)
            else:
                b.box((0,2.4,0),(w*.6,.6,10),'AMBER' if off<0 else 'YELLOW')
                bd.box((0,2.9,0),(w*.5,.3,1.2),'DARK')
            b.pop()
    f4(b,drum)
    # étage (y 148-168)
    b.lathe([(46,Y(166)),(46,Y(148)),(30,Y(146))],'GREY',n=8)
    b.lathe([(54,Y(169)),(58,Y(169)),(58,Y(167)),(54,Y(167))],'YELLOW',n=32)
    b.lathe([(26,Y(147)),(29,Y(147)),(29,Y(145)),(26,Y(145))],'YELLOW',n=24)
    def upper(th):
        b.box((0,34,Y(157)),(34,24,24),'STEEL',ch=2)
        b.box((0,46.3,Y(157)),(16,1,14),'DARK');b.box((0,47,Y(157)),(7,.5,8),'AMBER')
        b.box((0,46.8,Y(145)),(26,1.2,2),'YELLOW')
        for sx in (-1,1):
            b.box((sx*27,32,Y(160)),(12,14,20),'GREY',ch=1.5)
            bd.box((sx*27,39.4,Y(160)),(4,.5,8),'YELLOW')
            lamps(bd,[(sx*27,39.4,Y(150))],'AMBER',.8)
    f4(b,upper)
    def ant2(sx,sy):
        # mâts x=±41 (y 80-146) : en diagonale
        b.cyl((0,0,Y(150)),(0,0,Y(84)),1.2,'STEEL',n=6,r2=.8)
        b.cyl((0,0,Y(150)),(0,0,Y(122)),2.6,'GREY',n=6,r2=1.6)
        b.sphere((0,0,Y(80)),3.10,'RED',n=8,m=5)
    fd(b,ant2,41)
    # (y 112-148)
    b.lathe([(23,Y(150)),(22,Y(112))],'GREY',n=8)
    def up2(th):
        b.box((0,18,Y(130)),(24,10,34),'WHITE2',ch=1.5)
        b.box((0,23.3,Y(130)),(11,.8,26),'DARK')
        for z in np.arange(Y(142),Y(118),4):
            bd.box((0,23.9,z),(8,.3,2.2),'STEEL')
        for sx in (-1,1):
            b.box((sx*9.5,23.4,Y(128)),(1.2,.6,28),'YELLOW')
    f4(b,up2)
    # flèche (y 52-112)
    b.box((0,0,Y(82)),(27,27,60),'WHITE',ch=2.5,tap=(.82,.82))
    b.box((0,0,Y(52)),(17,17,4),'GREY',ch=1)
    b.box((0,0,Y(114)),(30,30,5),'GREY',ch=1.5)
    def sp(th):
        b.box((0,13.3,Y(85)),(8,.8,36),'DARK')
        b.box((0,13.9,Y(90)),(4.5,.5,10),'YELLOW')
        b.box((0,13.9,Y(74)),(4.5,.5,6),'AMBER')
        lamps(bd,[(-9,13,Y(104)),(9,13,Y(104))],'DARK',.8)
    f4(b,sp)
    for sx_,sy_ in ((1,1),(-1,1),(-1,-1),(1,-1)):
        b.cyl((sx_*18,sy_*18,Y(112)),(sx_*18,sy_*18,Y(92)),1.5,'STEEL',n=6,r2=.8)
        b.box((sx_*17,sy_*17,Y(118)),(9,9,12),'STEEL',ch=1)
        b.cyl((sx_*26,sy_*26,Y(148)),(sx_*26,sy_*26,Y(126)),1.8,'STEEL',n=6,r2=1)
    b.cyl((0,0,Y(52)),(0,0,Y(14)),2.0,'STEEL',n=6,r2=.9)
    b.cyl((0,0,Y(52)),(0,0,Y(38)),3.6,'GREY',n=6,r2=2)
    b.sphere((0,0,Y(10)),3.78,'RED',n=8,m=5)
    def ant(th):
        b.cyl((0,9.5,Y(52)),(0,9.5,Y(38)),1,'STEEL',n=5,r2=.6)
    f4(b,ant)
def capsule(b,bd,c,hh,R):
    pr=[(0,-hh),(R*.45,-hh+.4),(R*.78,-hh+R*.25),(R*.96,-hh+R*.6),(R,-hh+R*1.1),(R,hh-R*1.1),(R*.96,hh-R*.6),(R*.78,hh-R*.25),(R*.45,hh-.4),(0,hh)]
    b.lathe(pr,'SPHERE',n=16,c=c)
    for zz,ww in ((-hh*.62,2.4),(hh*.62,2.4)):
        b.lathe([(R+.1,zz-ww*.7),(R+.7,zz-ww*.5),(R+.7,zz+ww*.5),(R+.1,zz+ww*.7)],'YELLOW',n=16,c=c)
def spine(b,bd,rng):
    b.lathe([(150,-74),(120,-82),(90,-92),(0,-92)],'GREY',n=32)
    def under(th):
        b.box((0,204,Y(538)),(36,60,24),'WHITE2',ch=3)
        b.box((0,204,Y(552)),(24,50,6),'DARK')
        b.box((0,128,Y(538)),(52,92,26),'GREY',ch=3)
        for r_ in (112,138,164):
            b.box((0,r_,Y(524)),(32,16,1.4),'STEEL')
        for sx in (-1,1):
            b.box((sx*19,204,Y(538)),(1,40,12),'DARK')
            for k in range(4):
                b.box((sx*19.6,187+k*11,Y(538)),(.5,7,6),'AMBER')
        b.box((0,235,Y(538)),(28,6,18),'GREY',ch=1)
        b.box((0,238.2,Y(538)),(22,.8,10),'DARK')
        for k in range(3):
            b.box((-7+k*7,238.8,Y(538)),(5,.5,7),'AMBER')
    f4(b,under)
    b.box((0,0,Y(620)),(112,112,170),'GREY')
    def core(th):
        # bandeau d'attache y 530-552
        b.box((0,60,Y(542)),(64,8,24),'WHITE',ch=1.5)
        b.box((0,64.3,Y(542)),(26,.6,14),'DARK')
        lamps(bd,[(u,64,Y(552)) for u in (-24,-12,12,24)],'AMBER')
        # plaque haute blanche (y 556-612)
        b.box((0,60,Y(584)),(46,8,58),'WHITE',ch=1.5)
        for z in (Y(560),Y(608)):
            for u in (-19,19): bd.cyl((u,63.7,z),(u,64.5,z),1,'DARK',n=5)
        bd.beam((-14,64.2,Y(590)),(0,64.2,Y(600)),.6,'DARK',h=.4);bd.beam((14,64.2,Y(590)),(0,64.2,Y(600)),.6,'DARK',h=.4)
        bd.box((0,64.2,Y(575)),(30,.4,1),'DARK');bd.box((0,64.2,Y(566)),(30,.4,1),'DARK')
        for sx in (-1,1):
            b.box((sx*30,60,Y(584)),(10,6,58),'GREY',ch=1)
            b.win((sx*30,63.4,Y(580)),4.8,36,'BLUE',cols=1,rows=5)
            b.box((sx*44,58,Y(590)),(16,10,74),'STEEL',ch=1.5)
            b.box((sx*44,63.3,Y(590)),(9,.6,40),'DARK')
            b.box((sx*56,54,Y(600)),(7,18,96),'GREY',ch=1)
            lamps(bd,[(sx*44,63,Y(556)),(sx*44,63,Y(626))],'AMBER')
        # fenêtre bleue centrale (y 616-680)
        b.box((0,60,Y(650)),(30,6,70),'GREY')
        b.win((0,63.3,Y(650)),22,60,'BLUE',cols=2,rows=8)
        # plaques blanches latérales (y 618-760)
        for sx in (-1,1):
            b.box((sx*40,58,Y(676)),(36,10,116),'WHITE',ch=2)
            b.box((sx*40,63.3,Y(650)),(14,.6,30),'STEEL');bd.box((sx*40,63.9,Y(650)),(7,.3,18),'DARK')
            for zz in (Y(625),Y(675),Y(725)):
                for uu in (-14,14):
                    bd.cyl((sx*40+uu,63,zz),(sx*40+uu,63.8,zz),1.0,'DARK',n=5)
            bd.box((sx*40,63.2,Y(690)),(34,.4,1),'DARK')
            # bloc jaune (y 712-750)
            b.box((sx*44,63,Y(730)),(26,2.4,38),'YELLOW',ch=1)
            b.box((sx*44,64.5,Y(730)),(13,.6,24),'DARK')
            for k in range(3):
                bd.box((sx*44,65,Y(722+k*8)),(9,.3,5),'STEEL')
            b.box((sx*22,60,Y(650)),(1.4,6,62),'YELLOW')
        for yy in (612,686):
            b.box((0,63,Y(yy)),(118,6,5),'GREY',ch=1)
            lamps(bd,[(u,66,Y(yy)) for u in np.arange(-48,49,16)],'AMBER',1)
        # bloc blanc bas centre (y 690-752)
        b.box((0,60,Y(722)),(40,8,62),'WHITE',ch=1.5)
        b.box((0,64.3,Y(708)),(20,.5,14),'DARK')
        for k in range(3): bd.box((0,64.7,Y(703+k*5)),(16,.3,2.4),'STEEL')
        bd.box((0,64.3,Y(735)),(30,.4,1),'DARK')
        # bloc jaune d'axe (y 752-790)
        b.box((0,54,Y(772)),(28,10,40),'YELLOW',ch=1.5)
        b.win((0,59.3,Y(772)),15,28,'AMBER',cols=2,rows=3)
    f4(b,core)
    # réservoirs d'angle (grappe de 4 capsules, y 590-675)
    def tanks(sx,sy):
        for u,v in ((-18,-18),(18,-18),(-18,18),(18,18)):
            capsule(b,bd,(u,v,Y(632)),43,17.5)
        b.box((0,0,Y(632)),(18,18,60),'GREY')
        # ceinture jaune et plaque (faces visibles)
        for nx,ny in ((0,sy),(sx,0)):
            c=(nx*35.6,ny*35.6,Y(632))
            b.box(c,(10,2.2,46) if nx==0 else (2.2,10,46),'YELLOW',ch=.7)
            b.box((nx*37,ny*37,Y(632)),(5,.6,26) if nx==0 else (.6,5,26),'DARK')
            for k in range(4):
                bd.box((nx*37.5,ny*37.5,Y(622+k*6.5)),(3.6,.3,3.6) if nx==0 else (.3,3.6,3.6),'AMBER')
        b.box((0,0,Y(590)),(66,66,8),'GREY',ch=1.5)
        b.box((-sx*6,-sy*6,Y(572)),(70,70,32),'STEEL',ch=3)
        b.box((0,0,Y(677)),(60,60,6),'GREY',ch=1)
        for u,v in ((-26,-26),(26,26)):
            b.cyl((u,v,Y(590)),(u,v,Y(578)),.9,'STEEL',n=5);b.sphere((u,v,Y(576)),2.43,'RED',n=8,m=5)
    fd(b,tanks,100)
    # tiges suspendues sous les rayons diagonaux
    def strut(d,y1,w,sx,sy,kind):
        b.push(None,(sx*d,sy*d,0))
        for u in (-1,1):
            for v in (-1,1):
                b.box((u*w*.36,v*w*.36,Y((470+y1)/2)),(2,2,y1-470),'STEEL')
        b.box((0,0,Y((470+y1)/2)),(w*.3,w*.3,y1-470),'DARK')
        for yy in np.arange(558,y1-8,24):
            b.box((0,0,Y(yy)),(w*1.05,w*1.05,5.5),'GREY',ch=.8)
            bd.box((0,sy*w*.54,Y(yy)),(w*.8,.5,2.2),'YELLOW');bd.box((sx*w*.54,0,Y(yy)),(.5,w*.8,2.2),'YELLOW')
            for k in (-1,1):
                b.beam((k*w*.36,sy*w*.4,Y(yy)),(-k*w*.36,sy*w*.4,Y(yy+24)),1,'GREY');b.beam((sx*w*.4,k*w*.36,Y(yy)),(sx*w*.4,-k*w*.36,Y(yy+24)),1,'GREY')
        if kind==0:
            b.box((0,0,Y(y1+14)),(20,20,28),'WHITE2',ch=2)
            b.box((0,sy*10.2,Y(y1+14)),(9,.8,12),'YELLOW');b.box((sx*10.2,0,Y(y1+14)),(.8,9,12),'YELLOW')
            b.box((0,0,Y(y1+31)),(13,13,6),'GREY')
        else:
            b.box((0,0,Y(y1+14)),(26,26,30),'GREY',ch=2)
            b.box((0,sy*13.2,Y(y1+14)),(12,.8,14),'WHITE');b.box((sx*13.2,0,Y(y1+14)),(.8,12,14),'WHITE')
            b.cyl((0,0,Y(y1+29)),(0,0,Y(y1+42)),2.5,'STEEL',n=6);b.sphere((0,0,Y(y1+43)),3.24,'RED',n=8,m=5)
        b.pop()
    for sx,sy in ((1,1),(-1,1),(-1,-1),(1,-1)):
        strut(190,650,18,sx,sy,0);strut(153,625,14,sx,sy,1)
    # groupe médian d'angle (y 685-705)
    def mid(sx,sy):
        b.box((0,0,Y(695)),(82,82,20),'GREY',ch=3)
        b.box((0,0,Y(686)),(70,70,3.5),'WHITE2');b.box((-sx*14,-sy*14,Y(712)),(52,52,18),'GREY',ch=2)
        for nx,ny in ((0,sy),(sx,0)):
            b.box((nx*41.2,ny*41.2,Y(696)),(56,1,11) if nx==0 else (1,56,11),'DARK')
            for k in range(4):
                u=-21+k*14
                c=(nx*41.8+(u if nx==0 else 0),ny*41.8+(u if ny==0 else 0),Y(696))
                b.box(c,(9,.5,7) if nx==0 else (.5,9,7),'WHITE' if k%2 else 'YELLOW')
        for nx,ny in ((sx,0),(0,sy)):
            b.cyl((nx*41,ny*41,Y(695)),(nx*47,ny*47,Y(695)),3,'STEEL',n=8)
            b.sphere((nx*48,ny*48,Y(695)),3.24,'RED',n=8,m=5)
        # tiges (x=±121) en coin externe
        b.box((sx*21,sy*21,Y(726)),(9,9,42),'GREY',ch=1)
        b.box((sx*21,sy*21,Y(722)),(11,11,6),'YELLOW')
        b.box((sx*21,sy*21,Y(750)),(6,6,5),'STEEL')
    fd(b,mid,100)
    # gousses d'angle (d=76, y 712-800) + aiguille
    b.box((0,0,Y(735)),(92,92,90),'GREY')
    def pods(sx,sy):
        b.box((0,0,Y(756)),(30,30,74),'GREY',ch=3)
        for nx,ny in ((0,sy),(sx,0)):
            b.box((nx*15.3,ny*15.3,Y(770)),(14,1,30) if nx==0 else (1,14,30),'WHITE')
            b.win((0 if nx else 0,ny*16,Y(772)) if nx==0 else (nx*16,0,Y(772)),7.5,16,'AMBER',cols=1,rows=3,axis='y' if nx==0 else 'x',sg=1 if (ny>0 or nx>0) else -1)
            b.box((nx*15.2,ny*15.2,Y(735)),(20,1,10) if nx==0 else (1,20,10),'YELLOW')
            for k in range(3):
                bd.box((nx*16.5,ny*16.5,Y(766+k*6)),(7,.3,1) if nx==0 else (.3,7,1),'DARK')
        b.box((0,0,Y(800)),(20,20,14),'WHITE2',ch=2,tap=(.7,.7))
        b.cyl((0,0,Y(806)),(0,0,Y(832)),3.6,'STEEL',n=8,r2=2.6)
        b.cyl((0,0,Y(832)),(0,0,Y(847)),1,'STEEL',n=5)
        b.sphere((0,0,Y(850)),3.38,'RED',n=8,m=5)
    fd(b,pods,79)
    def pin(sx,sy):
        b.box((0,0,Y(805)),(13,13,70),'GREY',ch=1.5)
        for nx,ny in ((0,sy),(sx,0)):
            b.win((0,ny*6.8,Y(800)) if nx==0 else (nx*6.8,0,Y(800)),6,42,'BLUE',cols=1,rows=6,axis='y' if nx==0 else 'x',sg=1 if (ny>0 or nx>0) else -1)
        b.cyl((0,0,Y(840)),(0,0,Y(860)),2.5,'STEEL',n=6,r2=1.4)
        b.sphere((0,0,Y(862)),2.56,'RED',n=8,m=5)
    fd(b,pin,40)
    # pointe
    b.lathe([(44,Y(790)),(44,Y(818)),(32,Y(832)),(27,Y(838)),(25,Y(860))],'GREY',n=8)
    def lo2(th):
        b.box((0,21,Y(812)),(20,12,46),'WHITE2',ch=1.2)
        b.win((0,27.3,Y(812)),10,28,'AMBER',cols=2,rows=4)
        for sx in (-1,1): b.box((sx*22,21,Y(824)),(4,6,44),'STEEL')
    f4(b,lo2)
    b.lathe([(20,Y(858)),(26,Y(862)),(26,Y(876)),(19,Y(880))],'WHITE2',n=12)
    b.lathe([(26.3,Y(871)),(27,Y(870)),(27,Y(867)),(26.3,Y(866))],'YELLOW',n=12)
    b.lathe([(13,Y(880)),(9,Y(905)),(5.5,Y(918))],'GREY',n=8)
    b.cyl((0,0,Y(905)),(0,0,Y(925)),2.4,'STEEL',n=6,r2=1)
    b.sphere((0,0,Y(925)),3.78,'RED',n=8,m=5)
    for s1,s2 in ((1,1),(-1,1),(-1,-1),(1,-1)):
        b.cyl((s1*13,s2*13,Y(880)),(s1*13,s2*13,Y(908)),1.5,'STEEL',n=6)
        b.sphere((s1*13,s2*13,Y(910)),2.70,'RED',n=8,m=5)
def build(seed=11):
    rng=random.Random(seed)
    h=B('hub');t=B('tower');s=B('spine');bd=B('fine2')
    hub(h,bd,rng);tower(t,bd,rng);spine(s,bd,rng)
    return dict(hub=h,tower=t,spine=s,fine2=bd)
if __name__=='__main__':
    import sys;sys.path.insert(0,'.')
    import m1_ring, ctl, zb, cv2
    A=B()
    for P in (m1_ring.build(),build()):
        for k,v in P.items(): A.merge(v)
    V,T,M=A.tris();print(len(T))
    res,S=ctl.scores(V,T)
    p=zb.render(V,T,M,'front')
    f=cv2.imread('/home/claude/os01/ref/front_c.png');g=cv2.imread('/home/claude/os01/ref/front.png')
    for nm,(x0,y0,x1,y1) in (('tw',(640,0,1040,400)),('sp',(630,520,1040,941))):
        crop=lambda im:cv2.resize(im[y0:y1,x0:x1],None,fx=1.5,fy=1.5,interpolation=cv2.INTER_AREA)
        cv2.imwrite(f'/home/claude/os01/ctl/m2_{nm}.png',np.hstack([crop(g),crop(f),crop(p)]))
